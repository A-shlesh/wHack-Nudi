// The Nudi side panel: sits NEXT TO the website (Chrome's own side panel),
// so it never covers the page, and it follows you from page to page.
//
// For the page in the current tab it shows, top to bottom:
//   1. Safety verdict (website trust + page warnings; details folded under "Why?")
//   2. "What would you like to do?": big numbered choices + "Show me where it is"
//   3. "Remove it for me" cards, if Nudi found a sneaky extra
//   4. "Ask a question", "What Nudi stopped" and "Family": folded, tap to open
//   5. Controls: Read aloud, Talk, text size, voice on/off
//
// The panel never touches the page itself; it sends small messages to the
// content script (content.ts), which does the work inside the page.
//
// Going back to a page within 10 minutes shows Nudi's answer at once from a
// small cache (pageCache.ts). "Read this page again" always reads it fresh.

import { createAskBox, type AskBox } from "./lib/askBox";
import { applyTextSize, buildControls } from "./lib/controls";
import { clearExplain, explainSlot, startExplain } from "./lib/explainCard";
import { buildFamilySection } from "./lib/familyPanel";
import { addHistory, applyTrusted, getTrusted } from "./lib/history";
import { buildHistorySection } from "./lib/historyPanel";
import { askBackground } from "./lib/messages";
import { basicModeAnswer } from "./lib/offline";
import { cachePage, getCachedPage, pageKey } from "./lib/pageCache";
import { buildChoice, buildFix, buildFold, buildHeader, buildVerdict, buildVoiceQuestion } from "./lib/panelParts";
import { getSettings, loadSettings, saveSettings } from "./lib/settings";
import { buildSiteCheck } from "./lib/siteCheck";
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
let familyName: string | null = null; // "Sushant", once paired
let lastSpokenUrl = "";
let lastTaskSite = ""; // send "task started" once per website, not on every page

const AI_NAMES: Record<string, string> = {
  ollama: "an AI on this computer (Ollama)",
  gemini: "Gemini AI",
  groq: "Groq AI",
  bedrock: "AWS Bedrock AI",
};

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
  body.append(explainSlot(), box, buildFamilySection(onFamilyChange));
  panel.append(buildHeader(familySharing), body);
  app.replaceChildren(panel);
}

/** What Nudi says when a page opens: short. The verdict, then the choices. */
function spokenText(result: SimplifyResponse, trust: TrustResult | null): string {
  const parts: string[] = [];
  if (trust?.level === "danger") parts.push("Warning. This website looks like a scam. Do not pay here.");
  else if (result.decision.action === "block") parts.push("Warning. This page looks like a scam. Do not pay here.");
  else if (result.warnings.some((w) => w.level === "danger")) parts.push("Warning. This page looks risky.");
  else if (trust?.level === "caution" || result.decision.action === "ask_family" || result.warnings.length > 0) {
    parts.push("Be careful on this page.");
  } else parts.push("This website looks safe.");
  if (result.actions.length > 0) {
    parts.push("You can:");
    result.actions.forEach((a, i) => parts.push(`${i + 1}, ${a.label}.`));
  }
  return parts.join(" ");
}

/** basicMode = true when the helper server is off and the answer was made in the browser. */
function render(read: PageReadResult, result: SimplifyResponse, trust: TrustResult | null, basicMode = false): void {
  applyTextSize(app);
  const panel = el("div", "panel docked");
  panel.append(buildHeader(familySharing));

  // Only the verdict and the choices are open. Everything else is folded,
  // so the panel is not a wall of text.
  const body = el("div", "body");

  if (basicMode) {
    const banner = el("div", "basic-banner");
    banner.setAttribute("role", "status");
    banner.append(
      el("strong", "", "Basic mode: the Nudi helper is off."),
      el("span", "", " Payments are still checked. The website check, questions and Family need the helper."),
    );
    body.append(banner);
  }

  // A right-click "Explain this" answer, if there is one, stays on top.
  body.append(explainSlot());

  // First time only: ask before Nudi ever speaks.
  if (getSettings().readAloud === null) {
    const question = buildVoiceQuestion(async (readAloud) => {
      await saveSettings({ readAloud });
      question.remove();
      app.querySelector(".controls .toggle")?.setAttribute("aria-pressed", String(readAloud));
      if (readAloud) speak(spokenText(result, trust));
    });
    body.append(question);
  }

  // "I think this website is fine": the way to undo a wrong warning about the WEBSITE.
  const siteCheck =
    trust && trust.level !== "safe" && !trust.reasons.some((r) => r.code === "LOCAL")
      ? buildSiteCheck(trust.domain, trust.level, trust.domain_age_days, () => analyze({ quiet: true }))
      : null;
  body.append(buildVerdict(trust, result.warnings, result.decision, familyName, siteCheck));
  if (result.mode === "bedrock") body.append(el("p", "summary", result.summary)); // the mock summary adds nothing

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
  // Say who chose these: the AI, or Nudi's own offline rules.
  body.append(el("p", "ai-note", AI_NAMES[result.mode] ? `Choices picked with help from ${AI_NAMES[result.mode]}.` : "Choices picked by Nudi's offline rules."));
  // Some websites change without reloading (or were still loading): let the person ask again.
  const readAgain = el("button", "link-btn", "Read this page again");
  readAgain.onclick = () => analyze({ fresh: true });
  body.append(readAgain);

  // 2. Fixes: shown open, because they are something Nudi can DO for you.
  read.fixes.forEach((message, index) =>
    body.append(
      buildFix(
        message,
        () => sendToPage({ type: "nudi:fix", index }),
        () => {
          speak("Done. I removed the extra. Please check the new total.");
          setTimeout(() => analyze({ quiet: true, fresh: true }), 2000); // the page changed: read it again
        },
      ),
    ),
  );

  // 3. Questions (folded)
  const askBox: AskBox = createAskBox(read.page);
  const askFold = buildFold("Ask a question", false);
  askFold.body.append(askBox.element);
  body.append(askFold.fold);

  // 4. What Nudi stopped (folded; kept on this computer only)
  body.append(buildHistorySection(() => analyze({ quiet: true })));

  // 5. Family (folded; it opens by itself when someone asks to connect)
  body.append(buildFamilySection(onFamilyChange));

  const controls = buildControls({
    app,
    readText: () => spokenText(result, trust),
    onHeard: (said) => {
      askFold.fold.open = true; // so a spoken question's answer is visible
      handleSpoken(said, result, askBox);
    },
  });

  panel.append(body, controls);
  app.replaceChildren(panel);
}

// ---------- "Explain this with Nudi" (right-click menu) ----------

/**
 * The background worker leaves the selected text in session storage. Show the
 * answer card at once, whether the panel was just opened (still reading the
 * page) or was already open.
 */
async function checkExplainRequest(): Promise<void> {
  const { nudiExplain } = await chrome.storage.session.get("nudiExplain");
  const request = nudiExplain as { text: string; title: string; at: number } | undefined;
  if (!request) return;
  await chrome.storage.session.remove("nudiExplain");
  if (Date.now() - request.at > 60_000) return; // old requests are ignored
  startExplain(request.text, request.title);
}

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.nudiExplain?.newValue) checkExplainRequest();
});

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
  familyName = state.status === "paired" ? state.familyName : null;
  const sharing = state.status === "paired" ? state.sharingOn : null;
  if (sharing === familySharing) return;
  familySharing = sharing;
  // Redraw only the header badge.
  const oldHeader = app.querySelector("header");
  oldHeader?.replaceWith(buildHeader(familySharing));
}

// ---------- Reading the page ----------

let analyzing = 0; // a newer analysis cancels an older one

/** Ask the backend about the page: the simple version, and how much to trust the website. */
async function askBackend(read: PageReadResult): Promise<{ result: SimplifyResponse; trust: TrustResult | null }> {
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
  // An older backend (for example an AWS deploy not updated yet) sends no decision.
  result.decision ??= { action: "watch", reasons: [], source: "rules" };
  return { result, trust };
}

/**
 * quiet: do not show "Reading this page…" or speak again (after a fix or a change).
 * fresh: ask the backend again even if this page is in the cache.
 */
async function analyze({ quiet = false, fresh = false } = {}): Promise<void> {
  const myRun = ++analyzing;
  await loadSettings();
  currentTabId = await activeTabId();
  // Show "Reading…" only if it takes a moment, so a cached page does not flash.
  const loading = quiet
    ? undefined
    : window.setTimeout(() => {
        if (myRun === analyzing) showMessage("Reading this page…", "One moment. I am making it simple for you.", true);
      }, 250);

  let read: PageReadResult;
  try {
    read = await readCurrentPage();
  } catch {
    window.clearTimeout(loading);
    showMessage("Nudi cannot help on this page", "Chrome does not let extensions work on its own pages. Open a normal website.");
    return;
  }

  try {
    const key = pageKey(read.page);
    const cached = fresh ? null : await getCachedPage(key);
    const answer = cached ?? (await askBackend(read));
    const trusted = await getTrusted();
    window.clearTimeout(loading);
    if (myRun !== analyzing) return; // the user already moved to another page
    if (!cached) cachePage(key, answer.result, answer.trust);

    // Work on copies, so the cached answer stays as the backend gave it.
    const result: SimplifyResponse = { ...answer.result, decision: { ...answer.result.decision } };
    const rawTrust = answer.trust;

    // A website someone marked as fine is shown as safe (with who said so).
    const trust = applyTrusted(rawTrust, trusted);
    // Marked fine also drops "ask family first" for this website. A clear scam
    // decision about the page ("block") still stands.
    if (trust !== rawTrust && result.decision.action === "ask_family") {
      result.decision = { action: "watch", reasons: [], source: "rules" };
    }

    await sendToPage({ type: "nudi:set-trust", trust, decision: result.decision }).catch(() => {});
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
    // "What Nudi stopped": a scam website is listed (once a day per website), with the reasons.
    if (trust?.level === "danger") {
      const reasons = trust.reasons.map((r) => r.message_simple);
      addHistory({ site: trust.domain, what: "scam_site", risk: "danger", amount: null, reasons }).catch(() => {});
    }

    // Speak once per page (not again after a fix refresh).
    if (!quiet && read.page.url !== lastSpokenUrl) {
      lastSpokenUrl = read.page.url;
      speak(spokenText(result, trust));
    }
  } catch {
    // The helper server is off: still help, with the simple rules inside the browser.
    window.clearTimeout(loading);
    if (myRun !== analyzing) return;
    const result = basicModeAnswer(read.page);
    await sendToPage({ type: "nudi:set-trust", trust: null, decision: result.decision }).catch(() => {});
    render(read, result, null, true);
    if (!quiet && read.page.url !== lastSpokenUrl) {
      lastSpokenUrl = read.page.url;
      speak(spokenText(result, null));
    }
  }
}

// Follow the user: re-read when they switch tabs or a page finishes loading.
// An explanation belongs to the page it was asked on, so it goes away too.
chrome.tabs.onActivated.addListener(() => {
  stopSpeaking();
  clearExplain();
  analyze();
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === currentTabId && info.status === "complete") {
    stopSpeaking();
    clearExplain();
    analyze();
  }
});

analyze();
checkExplainRequest(); // the panel may have been opened BY a right-click "Explain this"
