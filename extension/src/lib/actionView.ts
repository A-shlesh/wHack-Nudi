// The Action View: a calm panel with a short summary, scam warnings, and a
// few big buttons. Each big button does the same thing as a button on the
// real page, but payment buttons always ask first.

import type { Action, SimplifyResponse } from "../types";
import { findElement } from "./pageReader";
import { clickApproved, confirmPayment, looksLikePayment } from "./paymentGuard";
import { createOverlayHost, el } from "./ui";
import { speak, stopSpeaking } from "./voice";

const ROOT_ID = "nudi-root";

function closeView(): void {
  stopSpeaking();
  document.getElementById(ROOT_ID)?.remove();
}

/** Show a simple message (used while loading and for errors). */
export function showMessage(title: string, message: string): void {
  const { root } = createOverlayHost(ROOT_ID);
  const panel = el("div", "panel");
  panel.append(el("h2", "", title), el("p", "summary", message));
  const close = el("button", "", "Close");
  close.onclick = closeView;
  panel.append(close);
  root.append(panel);
}

/** What happens when the user taps one big button. */
async function runAction(action: Action): Promise<void> {
  const target = findElement(action.element_id);
  if (!target) {
    speak("Sorry, I cannot find that button on the page any more.");
    return;
  }

  // Bring the real element into view and highlight it so the user learns where it is.
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.style.outline = "4px solid #f59e0b";
  setTimeout(() => (target.style.outline = ""), 3000);

  // Text boxes: just put the cursor there so the user can type.
  if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") {
    target.focus();
    speak(`Please type here: ${action.label}`);
    return;
  }

  // Payments: ALWAYS ask. We check both the backend's flag and our own word list.
  const isPayment = action.is_payment || looksLikePayment(action.label) || looksLikePayment(target.innerText);
  if (isPayment) {
    const yes = await confirmPayment(action.label);
    if (!yes) {
      speak("Okay, I stopped. No money was spent.");
      return;
    }
  }

  speak(`Okay. ${action.label}.`);
  clickApproved(target);
}

export function showActionView(result: SimplifyResponse): void {
  const { root } = createOverlayHost(ROOT_ID);
  const panel = el("div", "panel");

  panel.append(el("h2", "", "Nudi"), el("p", "summary", result.summary));

  for (const warning of result.warnings) {
    panel.append(el("div", `warning ${warning.level}`, warning.message));
  }

  if (result.actions.length === 0) {
    panel.append(el("p", "summary", "I could not find clear actions on this page."));
  }

  result.actions.forEach((action, index) => {
    const note = action.is_payment ? " 🔒 (I will ask you first)" : "";
    const button = el("button", action.is_payment ? "payment" : "", `${index + 1}. ${action.label}${note}`);
    button.onclick = () => runAction(action);
    panel.append(button);
  });

  // Bottom row: read aloud again, or close.
  const row = el("div", "row");
  const readAloud = el("button", "", "🔊 Read again");
  readAloud.onclick = () => speak(spokenText(result));
  const close = el("button", "", "✖ Close");
  close.onclick = closeView;
  row.append(readAloud, close);
  panel.append(row);

  panel.append(el("p", "mode", result.mode === "mock" ? "Demo mode (no cloud AI)" : "Powered by AWS Bedrock"));
  root.append(panel);

  speak(spokenText(result));
}

/** The words Nudi says out loud: summary, serious warnings, then the choices. */
function spokenText(result: SimplifyResponse): string {
  const warnings = result.warnings.filter((w) => w.level === "danger").map((w) => `Warning. ${w.message}`);
  const choices = result.actions.map((a, i) => `Option ${i + 1}: ${a.label}.`);
  return [result.summary, ...warnings, ...choices].join(" ");
}
