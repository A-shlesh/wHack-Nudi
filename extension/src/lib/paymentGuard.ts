// The payment guard. Nudi ALWAYS stops and asks before anything that spends
// money. It works in two ways:
//   1. Buttons in the Action View marked "is_payment" ask first.
//   2. A page-wide click watcher catches the user clicking a "Pay"/"Buy"
//      button on the real page, and asks first there too.

import { createOverlayHost } from "./ui";
import { speak } from "./voice";

// Same idea as PAYMENT_WORDS in backend/app/risk_rules.py.
const PAYMENT_WORDS = [
  "pay", "buy", "checkout", "check out", "place order", "purchase",
  "subscribe", "donate", "transfer", "send money", "confirm order", "proceed to payment",
];

export function looksLikePayment(label: string): boolean {
  const lowered = label.toLowerCase();
  return PAYMENT_WORDS.some((word) => lowered.includes(word));
}

/** Show a big Yes / No question. Resolves true only if the user taps Yes. */
export function confirmPayment(actionLabel: string): Promise<boolean> {
  const { host, root } = createOverlayHost("nudi-confirm");
  const question = `This will spend money: "${actionLabel}". Do you want to continue?`;

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
  // Set the question with textContent so page text can never inject HTML.
  root.querySelector(".question")!.textContent = question;
  speak(question);

  return new Promise((resolve) => {
    const finish = (answer: boolean) => {
      host.remove();
      resolve(answer);
    };
    root.querySelector<HTMLButtonElement>(".yes")!.onclick = () => finish(true);
    root.querySelector<HTMLButtonElement>(".no")!.onclick = () => finish(false);
    root.querySelector<HTMLButtonElement>(".no")!.focus(); // safe choice is the default
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
        "button, a, input[type=submit], input[type=button], [role=button]",
      );
      if (!target || target.dataset.nudiApproved === "yes") return;

      const label = target.innerText || (target as HTMLInputElement).value || target.getAttribute("aria-label") || "";
      if (!looksLikePayment(label)) return;

      // Stop the click right now, then ask.
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmPayment(label.trim()).then((yes) => {
        if (yes) clickApproved(target);
      });
    },
    true, // "capture" = we see the click before the page's own code does
  );
}
