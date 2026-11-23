// The payment guard (runs inside the web page). Nudi ALWAYS stops and asks
// before anything that spends money:
//   1. Choices in the side panel that look like payments ask first.
//   2. A page-wide click watcher catches the user clicking a "Pay"/"Buy"
//      button on the real page, and asks first there too.
//
// The question ("Check before you pay") has three answers:
//   No, do not pay  |  Yes, pay  |  Ask Sushant (Family Link)
// If the website looks like a SCAM (trust level "danger"), "Yes" is removed:
// the only way forward is a family member approving it.

import type { ApprovalStatus, FamilyState, TrustResult } from "../types";
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

// The trust result for this page, sent by the side panel (null = not checked).
let pageTrust: TrustResult | null = null;
export function setPageTrust(trust: TrustResult | null): void {
  pageTrust = trust;
}

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

    const finish = (paid: boolean) => {
      dialogOpen = false;
      window.clearInterval(polling);
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      const event = paid ? "payment_confirmed" : "payment_blocked";
      askBackground({ type: "family:event", event: { kind: event, amount: amountToNumber(amount) } }).catch(() => {});
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

    /** Scam site: payment is blocked. Only family can unlock it. */
    function showBlocked(): void {
      const title = el("h2", "", "Nudi stopped this payment");
      const reasons = el("ul", "checklist danger-list");
      for (const reason of pageTrust?.reasons ?? []) {
        const li = el("li", "");
        li.append(iconSpan("alert", 20), el("span", "", reason.message_simple));
        reasons.append(li);
      }
      const close = el("button", "btn primary", "OK, do not pay");
      close.onclick = () => finish(false);
      const buttons = el("div", "dialog-buttons");
      buttons.append(close);
      const lead = familyReady
        ? `This website looks like a scam. You can only pay if ${familyName} checks it and says yes.`
        : "This website looks like a scam, so paying here is blocked.";
      if (familyReady) buttons.append(askFamilyButton(false));

      dialog.className = "dialog blocked";
      dialog.replaceChildren(title, el("p", "", lead), amountBox(), reasons, buttons, privacyLine());
      close.focus();
      speak(`I have stopped this payment. This website looks like a scam. ${familyReady ? `You can ask ${familyName} to check it.` : ""}`);
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
          site,
          amount,
          reasons: (pageTrust?.reasons ?? []).map((r) => r.message_simple),
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

    if (pageTrust?.level === "danger") showBlocked();
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
