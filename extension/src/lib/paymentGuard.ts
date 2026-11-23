// The payment guard. Nudi ALWAYS stops and asks before anything that spends
// money. It works in two ways:
//   1. Buttons in the Action View that look like payments ask first.
//   2. A page-wide click watcher catches the user clicking a "Pay"/"Buy"
//      button on the real page, and asks first there too.

import { visibleLabel } from "./pageReader";
import { createOverlayHost } from "./ui";
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

/** Show a big Yes / No question. Resolves true only if the user taps Yes. */
export function confirmPayment(actionLabel: string): Promise<boolean> {
  const { host, root } = createOverlayHost("nudi-confirm");
  const question = `This will spend money: "${actionLabel}". Do you want to continue?`;

  // Only fixed text goes into innerHTML. Page text is added below with textContent.
  root.innerHTML += `
    <div class="backdrop">
      <div class="dialog" role="alertdialog" aria-modal="true">
        <p class="big">⚠️ Please check</p>
        <p class="question"></p>
        <p class="small">Check the amount. Nudi never sees your card, OTP or password.</p>
        <button class="yes">Yes, pay</button>
        <button class="no">No, stop</button>
      </div>
    </div>`;
  root.querySelector(".question")!.textContent = question;
  speak(question);

  return new Promise((resolve) => {
    const finish = (answer: boolean) => {
      host.remove();
      resolve(answer);
    };
    // isTrusted is only true for a real tap or key press by the person,
    // never for a fake click made by the website's own code.
    root.querySelector<HTMLButtonElement>(".yes")!.onclick = (event) => {
      if (event.isTrusted) finish(true);
    };
    root.querySelector<HTMLButtonElement>(".no")!.onclick = () => finish(false);
    root.querySelector<HTMLButtonElement>(".no")!.focus(); // the safe choice is the default
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
