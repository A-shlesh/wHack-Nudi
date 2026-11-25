// The payment guard (runs inside the web page). Nudi ALWAYS stops and asks
// before anything that spends money:
//   1. Choices in the side panel that look like payments ask first.
//   2. A page-wide click watcher catches the user clicking a "Pay"/"Buy"
//      button on the real page, and asks first there too.
//
// What the person sees depends on how risky the page is (Nudi's decision):
//   watch       "Check before you pay":  No, do not pay | Yes, pay | Ask Sushant
//   ask_family  "Ask Sushant first":     No, do not pay | Ask Sushant | (small) pay anyway
//   block       "Nudi stopped this":     OK, do not pay | Ask Sushant | (small) pay anyway
// A scam WEBSITE (trust level "danger") is always "block".
//
// "Pay anyway" is the person's own choice, but it is SLOW on purpose: Nudi
// reads the reasons, waits 15 seconds, then the button must be HELD for 3
// seconds. Phone scammers say "just click through the warning"; the pause
// gives the person time to think, and the family is told afterwards.

import type { ApprovalStatus, Decision, FamilyState, TrustResult } from "../types";
import { addHistory, type HistoryItem } from "./history";
import { askBackground } from "./messages";
import { visibleLabel } from "./pageReader";
import { createOverlayHost, el, iconSpan } from "./ui";
import { speak } from "./voice";

// Same lists as backend/app/risk_rules.py. English words are matched as whole
// words, so "pay" does not match "display".
const PAYMENT_PATTERN =
  /\b(?:pay|payment|buy|checkout|check out|place order|purchase|subscribe|donate|transfer|send money|confirm order)\b/i;

export function looksLikePayment(label: string): boolean {
  return PAYMENT_PATTERN.test(label);
}

/** Find a money amount such as "₹1,339" or "Rs. 500" in a button label. */
export function findAmount(label: string): string | null {
  const match = label.match(/(?:₹|rs\.?|inr)\s?\d[\d,]*(?:\.\d+)?/i);
  return match ? match[0] : null;
}

/** "₹1,339" -> 1339 (for the family's "money saved" total). */
export function amountToNumber(amount: string | null): number | null {
  if (!amount) return null;
  const digits = amount.replace(/[^\d.]/g, "");
  return digits ? Number(digits) : null;
}

// The trust result and Nudi's decision for this page, sent by the side panel (null = not checked).
let pageTrust: TrustResult | null = null;
let pageDecision: Decision | null = null;
export function setPageTrust(trust: TrustResult | null, decision: Decision | null = null): void {
  pageTrust = trust;
  pageDecision = decision;
}

type Mode = "watch" | "ask_family" | "block";

/** The strictest of: the website trust check and the page decision. */
function paymentMode(): Mode {
  if (pageTrust?.level === "danger" || pageDecision?.action === "block") return "block";
  if (pageDecision?.action === "ask_family") return "ask_family";
  return "watch";
}

/** Every reason Nudi has, in plain words: website reasons first, then the page decision. */
function riskReasons(): string[] {
  const site =
    pageTrust?.level === "safe"
      ? []
      : (pageTrust?.reasons ?? []).filter((r) => r.code !== "LOCAL").map((r) => r.message_simple);
  const page = pageDecision?.action === "watch" ? [] : (pageDecision?.reasons ?? []);
  return [...new Set([...site, ...page])];
}

const WAIT_SECONDS = 15; // "pay anyway": time to think before the button works
const HOLD_MS = 3000; // ...and then it must be held down this long

// Three quick questions to make the user pause and think before paying.
const CHECKLIST = [
  "This is the website I meant to use",
  "I know who I am paying, and why",
  "Nobody on the phone is telling me to do this",
];

const POLL_EVERY_MS = 2000;

// Only one payment question at a time (a page might fire several clicks).
let dialogOpen = false;

/** Ask the user (and maybe their family) before paying. Resolves true only on a real "Yes". */
export async function confirmPayment(actionLabel: string): Promise<boolean> {
  if (dialogOpen) return false;
  dialogOpen = true;

  const family = await askBackground<FamilyState>({ type: "family:state" }).catch(() => null);
  const familyReady = family?.status === "paired" && family.sharingOn;
  const familyName = family?.familyName ?? "my family";
  const amount = findAmount(actionLabel);
  const site = pageTrust?.domain ?? location.hostname;

  const { host, app } = createOverlayHost("nudi-confirm");
  const dialog = el("div", "dialog");
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  const backdrop = el("div", "backdrop");
  backdrop.append(dialog);
  app.append(backdrop);

  return new Promise<boolean>((resolve) => {
    let polling: number | undefined;
    const timers: number[] = []; // countdown and hold timers, stopped when the dialog closes
    const mode = paymentMode();
    const reasons = riskReasons();
    const risk: HistoryItem["risk"] = mode === "block" ? "danger" : "caution";
    let familySaidNo = false;

    /** how: "normal" (Yes or No), or "anyway" (paid after the slow override). */
    const finish = (paid: boolean, how: "normal" | "anyway" = "normal") => {
      dialogOpen = false;
      window.clearInterval(polling);
      timers.forEach((t) => window.clearInterval(t));
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      const kind = how === "anyway" ? "payment_overridden" : paid ? "payment_confirmed" : "payment_blocked";
      askBackground({ type: "family:event", event: { kind, amount: amountToNumber(amount) } }).catch(() => {});
      // "What Nudi stopped" (kept on this computer): only risky pages, not every normal "No".
      const what: HistoryItem["what"] | null =
        how === "anyway" ? "paid_anyway" : familySaidNo ? "family_no" : !paid && mode !== "watch" ? "stopped" : null;
      if (what) addHistory({ site, what, risk, amount, reasons }).catch(() => {});
      resolve(paid);
    };

    // Escape means "No". stopPropagation so Escape does not ALSO close other Nudi parts.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      finish(false);
    };
    document.addEventListener("keydown", onKey, true);

    // ----- the screens inside the dialog -----

    const amountBox = () => {
      const box = el("div", "amount");
      box.append(el("div", "amount-label", "You are about to pay"), el("div", "amount-value", amount ?? "an amount"));
      return box;
    };

    const privacyLine = () => {
      const note = el("div", "privacy-line");
      note.append(iconSpan("shield", 18), el("span", "", "Nudi never sees your card, OTP or password."));
      return note;
    };

    const askFamilyButton = (primary: boolean) => {
      const button = el("button", primary ? "btn primary" : "btn secondary", `Ask ${familyName} first`);
      button.onclick = askFamily;
      return button;
    };

    /** Normal check: No (big, default) / Yes / Ask family. */
    function showCheck(approvedByFamily = false): void {
      const title = el("h2", "", "Check before you pay");
      const lead = approvedByFamily
        ? `${familyName} said it is OK. You can still say no.`
        : `You pressed "${actionLabel}". This will spend money.`;
      const list = el("ul", "checklist");
      for (const item of CHECKLIST) {
        const li = el("li", "");
        li.append(iconSpan("check", 20), el("span", "", item));
        list.append(li);
      }
      const no = el("button", "btn primary", "No, do not pay");
      const yes = el("button", "btn secondary", amount ? `Yes, pay ${amount}` : "Yes, continue");
      // isTrusted is only true for a real tap or key press by the person,
      // never for a fake click made by the website's own code.
      yes.onclick = (event) => {
        if (event.isTrusted) finish(true);
      };
      no.onclick = () => finish(false);
      const buttons = el("div", "dialog-buttons");
      buttons.append(no, yes);
      if (familyReady && !approvedByFamily) buttons.append(askFamilyButton(false));

      dialog.className = "dialog";
      dialog.replaceChildren(title, el("p", "muted", lead), amountBox(), el("p", "", "Pay only if all of these are true:"), list, buttons, privacyLine());
      no.focus(); // the safe choice is the default
      speak(
        approvedByFamily
          ? `${familyName} said it is OK. Do you want to pay ${amount ?? ""}?`
          : `Before you pay ${amount ?? ""}. Is this the right website, and do you know who you are paying?`,
      );
    }

    const reasonList = () => {
      const list = el("ul", "checklist danger-list");
      for (const reason of reasons) {
        const li = el("li", "");
        li.append(iconSpan("alert", 20), el("span", "", reason));
        list.append(li);
      }
      return list;
    };

    /** The small "pay anyway" link: the person's own choice, but it leads to the slow screen. */
    const payAnywayLink = () => {
      const link = el("button", "link-btn pay-anyway", "I understand the risk. Let me pay anyway.");
      link.onclick = (event) => {
        if (event.isTrusted) showOverride();
      };
      return link;
    };

    /** Scam site (or a clear scam page): payment is blocked. Family can unlock it, or the slow "pay anyway". */
    function showBlocked(): void {
      const title = el("h2", "", "Nudi stopped this payment");
      const close = el("button", "btn primary", "OK, do not pay");
      close.onclick = () => finish(false);
      const buttons = el("div", "dialog-buttons");
      buttons.append(close);
      const what = pageTrust?.level === "danger" ? "This website looks like a scam" : "This page looks like a scam";
      const lead = familyReady
        ? `${what}. The safest way is to ask ${familyName} to check it first.`
        : `${what}, so I stopped the payment.`;
      if (familyReady) buttons.append(askFamilyButton(false));
      buttons.append(payAnywayLink());

      dialog.className = "dialog blocked";
      dialog.replaceChildren(title, el("p", "", lead), amountBox(), reasonList(), buttons, privacyLine());
      close.focus();
      speak(`I have stopped this payment. ${what}. ${familyReady ? `You can ask ${familyName} to check it.` : ""}`);
    }

    /** Risky page: Nudi suggests asking family first. Paying alone is still possible, slowly. */
    function showAskFirst(): void {
      const title = el("h2", "", familyReady ? `Ask ${familyName} first` : "Please stop and check");
      const no = el("button", "btn primary", "No, do not pay");
      no.onclick = () => finish(false);
      const buttons = el("div", "dialog-buttons");
      buttons.append(no);
      if (familyReady) buttons.append(askFamilyButton(false));
      buttons.append(payAnywayLink());
      const lead = familyReady
        ? `Something on this page worries me. Please let ${familyName} check before you pay.`
        : "Something on this page worries me. Please talk to someone you trust before you pay.";

      dialog.className = "dialog";
      dialog.replaceChildren(title, el("p", "", lead), amountBox(), reasonList(), buttons, privacyLine());
      no.focus();
      speak(`${lead} ${reasons[0] ?? ""}`);
    }

    /**
     * "Pay anyway": the person may pay, but only after hearing the reasons again,
     * waiting 15 seconds, and then holding the button down for 3 seconds.
     */
    function showOverride(): void {
      const title = el("h2", "", "Are you sure?");
      const lead = el("p", "", "Nudi thinks this payment is not safe because:");
      const phone = el(
        "p",
        "override-phone",
        "If someone on the phone is telling you to pay, hang up now. Banks and companies never rush you.",
      );
      const no = el("button", "btn primary", "No, do not pay");
      no.onclick = () => finish(false);
      const hold = holdButton(() => finish(true, "anyway"));
      const buttons = el("div", "dialog-buttons");
      buttons.append(no, hold.button);

      dialog.className = "dialog blocked";
      dialog.replaceChildren(title, lead, reasonList(), phone, amountBox(), buttons);
      no.focus();
      speak(`Are you sure? ${reasons.join(" ")} If someone on the phone is telling you to pay, hang up now.`);

      // Count down, then let the person hold the button.
      let left = WAIT_SECONDS;
      hold.wait(left);
      const countdown = window.setInterval(() => {
        left -= 1;
        hold.wait(left);
        if (left <= 0) window.clearInterval(countdown);
      }, 1000);
      timers.push(countdown);
    }

    /** A button that only works after the countdown, and only while held down for HOLD_MS. */
    function holdButton(onDone: () => void): { button: HTMLButtonElement; wait: (seconds: number) => void } {
      const button = el("button", "btn secondary hold-btn") as HTMLButtonElement;
      const fill = el("span", "hold-fill");
      const label = el("span", "hold-label");
      button.append(fill, label);
      let ready = false;
      let ticker: number | undefined;
      const readyText = amount ? `Hold to pay ${amount}` : "Hold to pay anyway";

      const reset = () => {
        window.clearInterval(ticker);
        ticker = undefined;
        fill.style.width = "0%";
        if (ready) label.textContent = readyText;
      };
      // isTrusted: only a real press by the person counts, never the website's own code.
      const start = (event: Event) => {
        if (!ready || !event.isTrusted || ticker !== undefined) return;
        const started = Date.now();
        label.textContent = "Keep holding…";
        ticker = window.setInterval(() => {
          const done = Math.min(1, (Date.now() - started) / HOLD_MS);
          fill.style.width = `${done * 100}%`;
          if (done >= 1) {
            reset();
            onDone();
          }
        }, 50);
        timers.push(ticker);
      };
      button.addEventListener("pointerdown", start);
      button.addEventListener("pointerup", reset);
      button.addEventListener("pointerleave", reset);
      button.addEventListener("pointercancel", reset);
      button.addEventListener("keydown", (event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          start(event);
        }
      });
      button.addEventListener("keyup", reset);
      button.addEventListener("click", (event) => event.preventDefault()); // a quick tap does nothing

      const wait = (seconds: number) => {
        ready = seconds <= 0;
        button.disabled = !ready;
        label.textContent = ready ? readyText : `Please wait ${seconds} seconds and think`;
      };
      return { button, wait };
    }

    /** Waiting for the family member to answer on their phone. */
    async function askFamily(): Promise<void> {
      dialog.className = "dialog";
      const waiting = el("div", "waiting");
      waiting.setAttribute("role", "status");
      waiting.append(el("div", "spinner"), el("h2", "", `Waiting for ${familyName}…`));
      const cancel = el("button", "btn secondary", "Stop waiting, do not pay");
      cancel.onclick = () => finish(false);
      dialog.replaceChildren(
        waiting,
        el("p", "muted", `I sent ${familyName} the website name and the amount. Nothing else.`),
        cancel,
      );
      speak(`Waiting for ${familyName}.`);

      try {
        const { approval_id } = await askBackground<{ approval_id: string }>({
          type: "family:ask-approval",
          kind: "payment",
          site,
          amount,
          ageDays: pageTrust?.domain_age_days ?? null,
        });
        polling = window.setInterval(async () => {
          const status = await askBackground<ApprovalStatus>({ type: "family:approval-status", approvalId: approval_id }).catch(
            () => "pending" as ApprovalStatus,
          );
          if (status === "approved") {
            window.clearInterval(polling);
            showCheck(true);
          } else if (status === "blocked") {
            window.clearInterval(polling);
            showFamilySaidNo();
          }
        }, POLL_EVERY_MS);
      } catch {
        dialog.replaceChildren(el("h2", "", "I could not reach your family"), el("p", "", "To be safe, do not pay now."), cancel);
        speak("I could not reach your family. To be safe, do not pay now.");
      }
    }

    function showFamilySaidNo(): void {
      familySaidNo = true;
      const ok = el("button", "btn primary", "OK");
      ok.onclick = () => finish(false);
      dialog.className = "dialog blocked";
      dialog.replaceChildren(
        el("h2", "", `${familyName} said no`),
        el("p", "", `${familyName} thinks this is not safe, so I stopped the payment. No money was spent. You did the right thing by asking.`),
        ok,
      );
      ok.focus();
      speak(`${familyName} said no, so I stopped the payment. No money was spent. You did the right thing by asking.`);
    }

    if (mode === "block") showBlocked();
    else if (mode === "ask_family") showAskFirst();
    else showCheck();
  });
}

/** Click an element that the user has already approved, without asking again. */
export function clickApproved(element: HTMLElement): void {
  element.dataset.nudiApproved = "yes";
  element.click();
  delete element.dataset.nudiApproved;
}

/** Watch every click on the page and stop payment clicks until the user says yes. */
export function installPageGuard(): void {
  document.addEventListener(
    "click",
    (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "button, a, input[type=submit], input[type=button], input[type=image], [role=button]",
      );
      if (!target || target.dataset.nudiApproved === "yes") return;

      const label = visibleLabel(target);
      if (!looksLikePayment(label)) return;

      // Stop the click right now, then ask.
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmPayment(label).then((yes) => {
        if (yes) clickApproved(target);
      });
    },
    true, // "capture" = we see the click before the page's own code does
  );
}
