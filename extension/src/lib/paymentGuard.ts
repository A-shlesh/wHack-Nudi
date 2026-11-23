// The payment guard. Nudi ALWAYS stops and asks before anything that spends
// money. It works in two ways:
//   1. Buttons in the Action View that look like payments ask first.
//   2. A page-wide click watcher catches the user clicking a "Pay"/"Buy"
//      button on the real page, and asks first there too.

import { visibleLabel } from "./pageReader";
import { createOverlayHost, el, iconSpan } from "./ui";
import { speak } from "./voice";

// Same lists as backend/app/risk_rules.py. English words are matched as whole
// words, so "pay" does not match "display".
const PAYMENT_PATTERN =
  /\b(?:pay|payment|buy|checkout|check out|place order|purchase|subscribe|donate|transfer|send money|confirm order)\b/i;
// Kannada and Hindi words for "payment" / "pay".
const NATIVE_PAYMENT_WORDS = ["ಪಾವತಿ", "भुगतान", "पे करें"];

export function looksLikePayment(label: string): boolean {
  return PAYMENT_PATTERN.test(label) || NATIVE_PAYMENT_WORDS.some((word) => label.includes(word));
}

/** Find a money amount such as "₹1,339" or "Rs. 500" in a button label. */
function findAmount(label: string): string | null {
  const match = label.match(/(?:₹|rs\.?|inr)\s?\d[\d,]*(?:\.\d+)?/i);
  return match ? match[0] : null;
}

// Three quick questions to make the user pause and think before paying.
const CHECKLIST = [
  "This is the website I meant to use",
  "I know who I am paying, and why",
  "Nobody on the phone is telling me to do this",
];

// Only one payment question at a time (a page might fire several clicks).
let dialogOpen = false;

/** Show a big Yes / No question. Resolves true only if the user taps Yes. */
export function confirmPayment(actionLabel: string): Promise<boolean> {
  if (dialogOpen) return Promise.resolve(false);
  dialogOpen = true;

  const { host, app } = createOverlayHost("nudi-confirm");
  const amount = findAmount(actionLabel);

  const dialog = el("div", "dialog");
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "nudi-pay-title");

  const title = el("h2", "", "Check before you pay");
  title.id = "nudi-pay-title";
  dialog.append(title, el("p", "muted", `You pressed "${actionLabel}". This will spend money.`));

  if (amount) {
    const box = el("div", "amount");
    box.append(el("div", "amount-label", "You are about to pay"), el("div", "amount-value", amount));
    dialog.append(box);
  }

  dialog.append(el("p", "", "Pay only if all of these are true:"));
  const list = el("ul", "checklist");
  for (const item of CHECKLIST) {
    const li = el("li", "");
    li.append(iconSpan("check", 20), el("span", "", item));
    list.append(li);
  }
  dialog.append(list);

  // "No" is the big, safe, default button. "Yes" is plainer on purpose.
  const no = el("button", "btn primary", "No, do not pay");
  const yes = el("button", "btn secondary", amount ? `Yes, pay ${amount}` : "Yes, continue");
  const buttons = el("div", "dialog-buttons");
  buttons.append(no, yes);
  const note = el("div", "privacy-line");
  note.append(iconSpan("shield", 18), el("span", "", "Nudi never sees your card, OTP or password."));
  dialog.append(buttons, note);

  const backdrop = el("div", "backdrop");
  backdrop.append(dialog);
  app.append(backdrop);

  const spoken = amount
    ? `Before you pay ${amount}. Is this the right website, and do you know who you are paying? Tap No to stop, or Yes to pay.`
    : `This will spend money. Tap No to stop, or Yes to continue.`;
  speak(spoken);

  return new Promise((resolve) => {
    const finish = (answer: boolean) => {
      dialogOpen = false;
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(answer);
    };
    // Escape means "No". stopPropagation so Escape does not ALSO close the panel.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      finish(false);
    };
    document.addEventListener("keydown", onKey, true);
    // isTrusted is only true for a real tap or key press by the person,
    // never for a fake click made by the website's own code.
    yes.onclick = (event) => {
      if (event.isTrusted) finish(true);
    };
    no.onclick = () => finish(false);
    no.focus(); // the safe choice is the default
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
