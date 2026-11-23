// What happens IN THE PAGE when the user taps a choice in the side panel.
//   - text box     -> point at it and put the cursor there
//   - payment      -> ask first (payment guard), then click
//   - anything else -> click it

import type { Action } from "../types";
import { findElement, isFormField, visibleLabel } from "./pageReader";
import { clickApproved, confirmPayment, looksLikePayment } from "./paymentGuard";
import { spotlight } from "./spotlight";
import { speak } from "./voice";

export async function runAction(action: Action): Promise<void> {
  const target = findElement(action.element_id);
  if (!target) {
    speak("Sorry, I cannot find that button on the page any more.");
    return;
  }

  if (isFormField(target)) {
    spotlight(target, `Type here: ${action.label}`);
    target.focus();
    speak(`Please type here: ${action.label}`);
    return;
  }

  // Payments: ALWAYS ask. We check the backend's flag, the new label, AND the
  // real button's own text (in case the AI renamed "Pay ₹5000" to "Finish").
  const isPayment = action.is_payment || looksLikePayment(action.label) || looksLikePayment(visibleLabel(target));
  if (isPayment) {
    const yes = await confirmPayment(visibleLabel(target) || action.label);
    if (!yes) {
      speak("Okay, I stopped. No money was spent.");
      return;
    }
    speak("Okay. Going ahead.");
    clickApproved(target);
    return;
  }

  // Not a payment: a plain click. The page-wide guard still checks it, as a backup.
  speak(`Okay. ${action.label}.`);
  target.click();
}

export function showMe(elementId: string, label: string): void {
  const target = findElement(elementId);
  if (!target) return;
  spotlight(target, `This is "${label}"`);
  speak(`Here it is: ${label}`);
}
