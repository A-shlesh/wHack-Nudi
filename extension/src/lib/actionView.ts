// The Action View: the Nudi panel shown on top of a website.
// From top to bottom it has:
//   - a safety meter (Looks safe / Be careful / Risky page)
//   - a one-line summary of the page
//   - "Watch out": scam warnings, plus "Fix it for me" for sneaky extras
//   - "What do you want to do?": a few big buttons, each with a "Show me"
//   - "Ask me anything": question chips and a question box
//   - a toolbar: Read aloud, Talk (voice commands), A- / A+ text size
// The panel can be made small (a round bubble) and opened again.

import type { Action, PageSnapshot, PageWarning, SimplifyResponse } from "../types";
import { createAskBox } from "./askBox";
import { findFixes, type Fix } from "./fixes";
import { canListen, listenOnce, stopListening } from "./listen";
import { findElement, isFormField, visibleLabel } from "./pageReader";
import { clickApproved, confirmPayment, looksLikePayment } from "./paymentGuard";
import { closeSpotlight, spotlight } from "./spotlight";
import { createOverlayHost, el, iconButton, iconSpan } from "./ui";
import { speak, stopSpeaking } from "./voice";
import { parseCommand } from "./voiceCommands";

const ROOT_ID = "nudi-root";
const MIN_SCALE = 0.9;
const MAX_SCALE = 1.5;

let textScale = 1; // changed by the A- / A+ buttons

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

// ---------- Small building blocks ----------

function buildHeader(onMinimize?: () => void): HTMLElement {
  const header = el("div", "header");
  const brand = el("div", "brand");
  brand.append(el("div", "brand-name", "Nudi"), el("div", "brand-sub", "Your friendly web helper"));
  header.append(el("div", "logo", "ನು"), brand);

  if (onMinimize) {
    const minimize = iconButton("icon-btn", "minimize", "", "Make Nudi small");
    minimize.onclick = onMinimize;
    header.append(minimize);
  }
  const close = iconButton("icon-btn", "close", "", "Close Nudi");
  close.onclick = closeView;
  header.append(close);
  return header;
}

function buildSafetyMeter(warnings: PageWarning[]): HTMLElement {
  const hasDanger = warnings.some((w) => w.level === "danger");
  const hasCaution = warnings.some((w) => w.level === "caution");
  const [level, label, note] = hasDanger
    ? ["risky", "Risky page", "I found signs of a scam. Read the warnings below."]
    : hasCaution
      ? ["careful", "Be careful", "This page uses tricks to rush or push you."]
      : ["safe", "Looks safe", "I did not find any tricks on this page."];

  const meter = el("div", `safety ${level}`);
  const iconBox = el("div", "safety-icon");
  iconBox.append(iconSpan(level === "safe" ? "shield" : "alert", 22));
  const words = el("div", "");
  words.append(el("div", "safety-label", label), el("div", "safety-note", note));
  meter.append(iconBox, words);
  return meter;
}

function buildWarningCard(warning: PageWarning): HTMLElement {
  const card = el("div", `card ${warning.level}`);
  card.append(iconSpan(warning.level === "info" ? "info" : "alert"), el("div", "", warning.message));
  return card;
}

const WARNINGS_SHOWN_AT_FIRST = 2;
const LEVEL_ORDER = { danger: 0, caution: 1, info: 2 };

/** Warnings, most serious first. Only the first two are shown until "Show more" is tapped. */
function buildWarningList(warnings: PageWarning[]): HTMLElement {
  const list = el("div", "");
  const sorted = [...warnings].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  sorted.slice(0, WARNINGS_SHOWN_AT_FIRST).forEach((w) => list.append(buildWarningCard(w)));

  const hidden = sorted.slice(WARNINGS_SHOWN_AT_FIRST);
  if (hidden.length > 0) {
    const more = el("button", "chip", `Show ${hidden.length} more warning${hidden.length > 1 ? "s" : ""}`);
    more.onclick = () => {
      more.replaceWith(...hidden.map(buildWarningCard));
    };
    list.append(more);
  }
  return list;
}

function buildFixCard(fix: Fix, view: View): HTMLElement {
  const card = el("div", "card fix");
  const button = iconButton("small-btn", "wand", "Fix it for me");
  button.onclick = () => {
    fix.apply();
    card.className = "card done";
    card.replaceChildren(iconSpan("check"), el("div", "", "Done. I removed the extra. Please check the new total."));
    speak("Done. I removed the extra. Please check the new total.");
    // The page changed (for example the total went down), so read it again.
    setTimeout(view.onRefresh, 2500);
  };
  card.append(el("div", "", fix.message), button);
  return card;
}

function buildActionRow(action: Action, index: number): HTMLElement {
  const row = el("div", "action-row");
  row.style.animationDelay = `${index * 60}ms`;

  const button = el("button", action.is_payment ? "action payment" : "action") as HTMLButtonElement;
  const label = el("div", "action-label", action.label);
  if (action.is_payment) {
    const pill = el("div", "pill");
    pill.append(iconSpan("lock", 12), el("span", "", "I will ask before paying"));
    label.append(el("br", ""), pill);
  }
  button.append(el("span", "badge", String(index + 1)), label);
  button.onclick = () => runAction(action);

  const showMe = iconButton("show-me", "eye", "Show me", `Show me where "${action.label}" is`);
  showMe.onclick = () => {
    const target = findElement(action.element_id);
    if (!target) return;
    spotlight(target, `This is "${action.label}"`);
    speak(`Here it is: ${action.label}`);
  };

  row.append(button, showMe);
  return row;
}

// ---------- What the buttons do ----------

/** What happens when the user taps (or says) one big button. */
async function runAction(action: Action): Promise<void> {
  const target = findElement(action.element_id);
  if (!target) {
    speak("Sorry, I cannot find that button on the page any more.");
    return;
  }

  // Text boxes: point at them and put the cursor there so the user can type.
  if (isFormField(target)) {
    spotlight(target, `Please type here: ${action.label}`);
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

/** The words Nudi says out loud: summary, serious warnings, then the choices. */
function spokenText(result: SimplifyResponse): string {
  const warnings = result.warnings.filter((w) => w.level === "danger").map((w) => `Warning. ${w.message}`);
  const choices = result.actions.map((a, i) => `Option ${i + 1}: ${a.label}.`);
  return [result.summary, ...warnings, ...choices].join(" ");
}

// ---------- The whole panel ----------

function buildToolbar(view: View, panel: HTMLElement, askBox: ReturnType<typeof createAskBox>): HTMLElement {
  const toolbar = el("div", "toolbar");

  const read = iconButton("tool", "speaker", "Read", "Read the page aloud");
  read.onclick = () => speak(spokenText(view.result));

  const talk = iconButton("tool", "mic", "Talk");
  talk.onclick = () => {
    if (!canListen()) {
      speak("Sorry, talking to me does not work in this browser.");
      return;
    }
    stopSpeaking();
    talk.classList.add("listening");
    talk.querySelector("span:last-child")!.textContent = "Listening…";
    listenOnce(
      (said) => handleSpoken(said, view, askBox),
      () => {
        talk.classList.remove("listening");
        talk.querySelector("span:last-child")!.textContent = "Talk";
      },
    );
  };

  const smaller = el("button", "tool", "A−");
  smaller.setAttribute("aria-label", "Smaller text");
  smaller.onclick = () => setScale(panel, textScale - 0.1);
  const bigger = el("button", "tool", "A+");
  bigger.setAttribute("aria-label", "Bigger text");
  bigger.onclick = () => setScale(panel, textScale + 0.1);

  toolbar.append(read, talk, smaller, bigger);
  return toolbar;
}

function setScale(panel: HTMLElement, scale: number): void {
  textScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  panel.closest<HTMLElement>(".app")!.style.setProperty("--scale", String(textScale));
}

/** Act on a voice command such as "option two", "pay", "read again" or a question. */
function handleSpoken(said: string, view: View, askBox: ReturnType<typeof createAskBox>): void {
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

function renderPanel(view: View): void {
  const { result, page, app } = view;
  app.style.setProperty("--scale", String(textScale));

  const panel = el("div", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Nudi helper");
  panel.append(buildHeader(() => renderBubble(view)));

  const body = el("div", "body");
  body.append(buildSafetyMeter(result.warnings), el("p", "summary", result.summary));

  // The main buttons come first, so the user sees them without scrolling.
  body.append(el("div", "section-title", "What do you want to do?"));
  if (result.actions.length === 0) {
    body.append(el("p", "muted", "I could not find clear actions on this page."));
  }
  result.actions.forEach((action, index) => body.append(buildActionRow(action, index)));

  // Fixes first (they are things we can DO), then the most serious warnings.
  const fixes = findFixes();
  if (result.warnings.length > 0 || fixes.length > 0) {
    body.append(el("div", "section-title", "Watch out"));
    fixes.forEach((f) => body.append(buildFixCard(f, view)));
    body.append(buildWarningList(result.warnings));
  }

  const askBox = createAskBox(page);
  body.append(el("div", "section-title", "Ask me anything"), askBox.element);

  const modeText = result.mode === "mock" ? "Demo mode · works offline" : "Powered by AWS Bedrock";
  panel.append(body, buildToolbar(view, panel, askBox), el("div", "footnote", `${modeText} · Nudi never reads passwords, OTPs or card numbers`));
  app.replaceChildren(panel);
}

/** The small round bubble shown when the panel is minimized. */
function renderBubble(view: View): void {
  stopSpeaking();
  const bubble = el("button", "fab", "ನು");
  bubble.setAttribute("aria-label", "Open Nudi");
  bubble.title = "Open Nudi";
  bubble.onclick = () => renderPanel(view);
  view.app.replaceChildren(bubble);
}

// ---------- Called from content.ts ----------

/** Show a loading or error message in the panel style. */
export function showMessage(title: string, message: string, loading = false): void {
  const { app } = createOverlayHost(ROOT_ID);
  const panel = el("div", "panel");
  const body = el("div", "body");
  if (loading) body.append(el("div", "spinner"));
  body.append(el("p", "loading-title", title), el("p", "muted", message));
  panel.append(buildHeader(), body);
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
