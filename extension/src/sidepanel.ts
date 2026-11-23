// The Nudi side panel: sits NEXT TO the website (Chrome's own side panel),
// so it never covers the page, and it follows you from page to page.
//
// For the page in the current tab it shows, top to bottom:
//   1. Safety verdict: website trust check + warnings found on the page
//   2. A short summary
//   3. "What would you like to do?": big numbered choices + "Show me where it is"
//   4. "Things to watch out for": "Remove it for me" fixes + warnings
//   5. "Ask a question"
//   6. Family Link
//   7. Controls: Read aloud, Talk, text size, voice on/off
//
// The panel never touches the page itself; it sends small messages to the
// content script (content.ts), which does the work inside the page.

import { createAskBox, type AskBox } from "./lib/askBox";
import { applyTextSize, buildControls } from "./lib/controls";
import { buildFamilySection } from "./lib/familyPanel";
import { askBackground } from "./lib/messages";
import { buildChoice, buildFix, buildHeader, buildVerdict, buildWarningList } from "./lib/panelParts";
import { loadSettings } from "./lib/settings";
import { STYLES } from "./lib/styles";
import { el } from "./lib/ui";
import { speak, stopSpeaking } from "./lib/voice";
import { parseCommand } from "./lib/voiceCommands";
import type { FamilyState, PageReadResult, SimplifyResponse, TabRequest, TrustResult } from "./types";

// ---------- Set up the page ----------

const style = document.createElement("style");
style.textContent = STYLES;
document.head.append(style);

const app = el("div", "app");
document.body.append(app);

let currentTabId: number | null = null;
let familySharing: boolean | null = null; // for the header badge
let lastSpokenUrl = "";
let lastTaskSite = ""; // send "task started" once per website, not on every page

// ---------- Talking to the page ----------

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function sendToPage<T>(message: TabRequest): Promise<T> {
  if (currentTabId === null) throw new Error("No tab");
  return chrome.tabs.sendMessage(currentTabId, message) as Promise<T>;
}

/** Ask the page to read itself. If Nudi's page script is missing (page opened before install), add it once. */
async function readCurrentPage(): Promise<PageReadResult> {
  try {
    return await sendToPage<PageReadResult>({ type: "nudi:read" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: currentTabId! }, files: ["content.js"] });
    return sendToPage<PageReadResult>({ type: "nudi:read" });
  }
}

// ---------- Screens ----------

function showMessage(title: string, message: string, loading = false): void {
  applyTextSize(app);
  const panel = el("div", "panel docked");
  const body = el("div", "body");
  const box = el("div", "loading");
  box.setAttribute("role", "status");
  const heading = el("div", "loading-title");
  if (loading) heading.append(el("div", "spinner"));
  heading.append(el("span", "", title));
  box.append(heading, el("p", "muted", message));
  if (loading) box.append(el("div", "skeleton"), el("div", "skeleton"), el("div", "skeleton"));
  body.append(box, buildFamilySection(onFamilyChange));
  panel.append(buildHeader(familySharing), body);
  app.replaceChildren(panel);
}

/** The words Nudi says out loud: verdict, summary, then the choices. */
function spokenText(result: SimplifyResponse, trust: TrustResult | null): string {
  const parts: string[] = [];
  if (trust?.level === "danger") parts.push(`Warning. This website looks like a scam. ${trust.reasons[0]?.message_simple ?? ""}`);
  parts.push(result.summary);
  result.warnings.filter((w) => w.level === "danger").forEach((w) => parts.push(`Warning. ${w.message}`));
  result.actions.forEach((a, i) => parts.push(`Option ${i + 1}: ${a.label}.`));
  return parts.join(" ");
}

function render(read: PageReadResult, result: SimplifyResponse, trust: TrustResult | null): void {
  applyTextSize(app);
  const panel = el("div", "panel docked");
  panel.append(buildHeader(familySharing));

  const body = el("div", "body");
  const watchOutHeading = el("h2", "", "Things to watch out for");
  watchOutHeading.setAttribute("tabindex", "-1");
  body.append(
    buildVerdict(trust, result.warnings, () => {
      watchOutHeading.scrollIntoView({ behavior: "smooth", block: "start" });
      watchOutHeading.focus({ preventScroll: true });
    }),
    el("p", "summary", result.summary),
  );

  // 1. Choices
  body.append(el("h2", "", "What would you like to do?"));
  const choices = el("ol", "choices");
  result.actions.forEach((action, index) => {
    choices.append(
      buildChoice(
        action,
        index,
        () => sendToPage({ type: "nudi:run", action }),
        () => sendToPage({ type: "nudi:show-me", elementId: action.element_id, label: action.label }),
      ),
    );
  });
  if (result.actions.length === 0) body.append(el("p", "muted", "I could not find clear actions on this page."));
  body.append(choices);

  // 2. Fixes, then warnings
  if (result.warnings.length > 0 || read.fixes.length > 0) {
    body.append(watchOutHeading);
    read.fixes.forEach((message, index) =>
      body.append(
        buildFix(
          message,
          () => sendToPage({ type: "nudi:fix", index }),
          () => {
            speak("Done. I removed the extra. Please check the new total.");
            setTimeout(() => analyze(true), 2000); // the page changed: read it again
          },
        ),
      ),
    );
    body.append(buildWarningList(result.warnings));
  }

  // 3. Questions
  const askBox: AskBox = createAskBox(read.page);
  body.append(el("h2", "", "Ask a question"), askBox.element);

  // 4. Family
  body.append(buildFamilySection(onFamilyChange));

  const controls = buildControls({
    app,
    readText: () => spokenText(result, trust),
    onHeard: (said) => handleSpoken(said, result, askBox),
  });

  panel.append(body, controls);
  app.replaceChildren(panel);
}

/** Act on spoken words such as "option two", "pay", "read again", or a question. */
function handleSpoken(said: string, result: SimplifyResponse, askBox: AskBox): void {
  const command = parseCommand(said, result.actions.length);
  switch (command.type) {
    case "read":
      speak(result.summary);
      break;
    case "close":
      stopSpeaking();
      window.close();
      break;
    case "action":
      sendToPage({ type: "nudi:run", action: result.actions[command.index] });
      break;
    case "pay": {
      const payment = result.actions.find((a) => a.is_payment);
      if (payment) sendToPage({ type: "nudi:run", action: payment });
      else speak("I cannot find a payment button on this page.");
      break;
    }
    case "ask":
      askBox.ask(command.text);
      break;
  }
}

function onFamilyChange(state: FamilyState): void {
  const sharing = state.status === "paired" ? state.sharingOn : null;
  if (sharing === familySharing) return;
  familySharing = sharing;
  // Redraw only the header badge.
  const oldHeader = app.querySelector("header");
  oldHeader?.replaceWith(buildHeader(familySharing));
}

// ---------- Reading the page ----------

let analyzing = 0; // a newer analysis cancels an older one

/** quiet = true when refreshing after a fix, so Nudi does not repeat everything aloud. */
async function analyze(quiet = false): Promise<void> {
  const myRun = ++analyzing;
  await loadSettings();
  currentTabId = await activeTabId();
  if (!quiet) showMessage("Reading this page…", "One moment. I am making it simple for you.", true);

  let read: PageReadResult;
  try {
    read = await readCurrentPage();
  } catch {
    showMessage("Nudi cannot help on this page", "Chrome does not let extensions work on its own pages. Open a normal website.");
    return;
  }

  try {
    // Simplify the page and check the website at the same time.
    const [result, trust] = await Promise.all([
      askBackground<SimplifyResponse>({ type: "simplify", page: read.page }),
      askBackground<TrustResult>({
        type: "trust",
        request: {
          url: read.page.url,
          has_payment: read.hasPayment,
          has_login: read.hasLogin,
          demo_domain: read.demoDomain,
          demo_age_days: read.demoAgeDays,
        },
      }).catch(() => null), // the trust check is a bonus: never block the panel on it
    ]);
    if (myRun !== analyzing) return; // the user already moved to another page

    await sendToPage({ type: "nudi:set-trust", trust }).catch(() => {});
    render(read, result, trust);

    // Family Link events: only that a task started and the warning level. No page details.
    const site = trust?.domain ?? read.page.url;
    if (site !== lastTaskSite) {
      lastTaskSite = site;
      askBackground({ type: "family:event", event: { kind: "task_started" } }).catch(() => {});
    }
    const worst = trust?.level === "danger" || result.warnings.some((w) => w.level === "danger") ? "danger"
      : trust?.level === "caution" || result.warnings.some((w) => w.level === "caution") ? "caution" : null;
    if (worst) askBackground({ type: "family:event", event: { kind: "warning_shown", level: worst } }).catch(() => {});

    // Speak once per page (not again after a fix refresh).
    if (!quiet && read.page.url !== lastSpokenUrl) {
      lastSpokenUrl = read.page.url;
      speak(spokenText(result, trust));
    }
  } catch {
    showMessage("Nudi cannot connect", "The Nudi helper server is not running. Please start it, then try again.");
  }
}

// Follow the user: re-read when they switch tabs or a page finishes loading.
chrome.tabs.onActivated.addListener(() => {
  stopSpeaking();
  analyze();
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === currentTabId && info.status === "complete") {
    stopSpeaking();
    analyze();
  }
});

analyze();
