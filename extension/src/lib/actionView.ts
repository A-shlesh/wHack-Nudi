// The Action View: Nudi's side panel on top of a website.
// From top to bottom:
//   1. Safety verdict  ("This page looks risky", with "See why")
//   2. A one-line summary of the page
//   3. "What would you like to do?"  big numbered choices + "Show me where it is"
//   4. "Things to watch out for"     "Remove it for me" fixes + scam warnings
//   5. "Ask a question"              question buttons + question box
//   6. Controls                      Read aloud, Talk, text size, voice on/off
// The panel can be hidden behind a small "Nudi" tab and opened again.

import type { Action, PageSnapshot, SimplifyResponse } from "../types";
import { createAskBox, type AskBox } from "./askBox";
import { applyTextSize, buildControls } from "./controls";
import { findFixes } from "./fixes";
import { stopListening } from "./listen";
import { findElement, isFormField, visibleLabel } from "./pageReader";
import { buildChoice, buildFix, buildHeader, buildVerdict, buildWarningList } from "./panelParts";
import { clickApproved, confirmPayment, looksLikePayment } from "./paymentGuard";
import { closeSpotlight, spotlight } from "./spotlight";
import { createOverlayHost, el, logoSpan } from "./ui";
import { speak, stopSpeaking } from "./voice";
import { parseCommand } from "./voiceCommands";

const ROOT_ID = "nudi-root";

/** Everything the panel needs to draw itself. */
interface View {
  result: SimplifyResponse;
  page: PageSnapshot;
  app: HTMLElement;
  onRefresh: () => void; // read the page again (after a fix changed it)
}

export function closeView(): void {
  stopSpeaking();
  stopListening();
  closeSpotlight();
  document.getElementById(ROOT_ID)?.remove();
}

// ---------- What the choices do ----------

/** What happens when the user taps (or says) one big choice. */
async function runAction(action: Action): Promise<void> {
  const target = findElement(action.element_id);
  if (!target) {
    speak("Sorry, I cannot find that button on the page any more.");
    return;
  }

  // Text boxes: point at them and put the cursor there so the user can type.
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

function showMe(action: Action): void {
  const target = findElement(action.element_id);
  if (!target) return;
  spotlight(target, `This is "${action.label}"`);
  speak(`Here it is: ${action.label}`);
}

/** The words Nudi says out loud: summary, serious warnings, then the choices. */
function spokenText(result: SimplifyResponse): string {
  const warnings = result.warnings.filter((w) => w.level === "danger").map((w) => `Warning. ${w.message}`);
  const choices = result.actions.map((a, i) => `Option ${i + 1}: ${a.label}.`);
  return [result.summary, ...warnings, ...choices].join(" ");
}

/** Act on spoken words such as "option two", "pay", "read again", or a question. */
function handleSpoken(said: string, view: View, askBox: AskBox): void {
  const command = parseCommand(said, view.result.actions.length);
  switch (command.type) {
    case "read":
      speak(spokenText(view.result));
      break;
    case "close":
      closeView();
      break;
    case "action":
      runAction(view.result.actions[command.index]);
      break;
    case "pay": {
      const payment = view.result.actions.find((a) => a.is_payment);
      if (payment) runAction(payment);
      else speak("I cannot find a payment button on this page.");
      break;
    }
    case "ask":
      askBox.ask(command.text);
      break;
  }
}

// ---------- Drawing the panel ----------

function renderPanel(view: View): void {
  const { result, page, app } = view;
  applyTextSize(app);

  const panel = el("aside", "panel");
  panel.setAttribute("aria-label", "Nudi helper");
  panel.append(buildHeader(() => renderTab(view), closeView));

  const body = el("div", "body");
  const watchOutHeading = el("h2", "", "Things to watch out for");
  watchOutHeading.setAttribute("tabindex", "-1");
  const verdict = buildVerdict(result.warnings, () => {
    watchOutHeading.scrollIntoView({ behavior: "smooth", block: "start" });
    watchOutHeading.focus({ preventScroll: true });
  });
  body.append(verdict, el("p", "summary", result.summary));

  // 1. The main choices come first, so they are visible without scrolling.
  body.append(el("h2", "", "What would you like to do?"));
  const choices = el("ol", "choices");
  result.actions.forEach((action, index) => {
    choices.append(buildChoice(action, index, () => runAction(action), () => showMe(action)));
  });
  if (result.actions.length === 0) body.append(el("p", "muted", "I could not find clear actions on this page."));
  body.append(choices);

  // 2. Fixes (things we can DO) first, then the warnings.
  const fixes = findFixes();
  if (result.warnings.length > 0 || fixes.length > 0) {
    body.append(watchOutHeading);
    fixes.forEach((fix) =>
      body.append(
        buildFix(fix, () => {
          speak("Done. I removed the extra. Please check the new total.");
          setTimeout(view.onRefresh, 2500); // the page changed, so read it again
        }),
      ),
    );
    body.append(buildWarningList(result.warnings));
  }

  // 3. Questions.
  const askBox = createAskBox(page);
  body.append(el("h2", "", "Ask a question"), askBox.element);

  const controls = buildControls({
    app,
    readText: () => spokenText(result),
    onHeard: (said) => handleSpoken(said, view, askBox),
  });

  panel.append(body, controls);
  app.replaceChildren(panel);

  // Move keyboard and screen-reader focus to the verdict, the most important part.
  verdict.querySelector<HTMLElement>(".verdict-title")?.focus({ preventScroll: true });
}

/** The small "Nudi" tab on the right edge, shown while the panel is hidden. */
function renderTab(view: View): void {
  stopSpeaking();
  const tab = el("button", "tab");
  tab.append(logoSpan(32), el("span", "", "Nudi"));
  tab.setAttribute("aria-label", "Open Nudi helper");
  tab.onclick = () => renderPanel(view);
  view.app.replaceChildren(tab);
  tab.focus();
}

// ---------- Called from content.ts ----------

/** Show the "reading this page" state, or an error, in the panel style. */
export function showMessage(title: string, message: string, loading = false): void {
  const { app } = createOverlayHost(ROOT_ID);
  applyTextSize(app);
  const panel = el("aside", "panel");
  panel.setAttribute("aria-label", "Nudi helper");
  panel.setAttribute("aria-busy", String(loading));
  const body = el("div", "body");
  const box = el("div", "loading");
  box.setAttribute("role", "status");
  const heading = el("div", "loading-title");
  if (loading) heading.append(el("div", "spinner"));
  heading.append(el("span", "", title));
  box.append(heading, el("p", "muted", message));
  if (loading) box.append(el("div", "skeleton"), el("div", "skeleton"), el("div", "skeleton"));
  body.append(box);
  panel.append(buildHeader(null, closeView), body);
  app.append(panel);
}

export function showActionView(
  result: SimplifyResponse,
  page: PageSnapshot,
  onRefresh: () => void,
  quiet = false,
): void {
  const { app } = createOverlayHost(ROOT_ID);
  renderPanel({ result, page, app, onRefresh });
  if (!quiet) speak(spokenText(result));
}
