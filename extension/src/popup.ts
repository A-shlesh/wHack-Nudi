// Popup logic: shows whether the backend is running, lets the user change
// their settings, and opens Nudi on the current tab.

import { askBackground } from "./lib/messages";
import { loadSettings, saveSettings, TEXT_SIZE_NAMES, type Settings } from "./lib/settings";

const status = document.getElementById("status")!;
const dot = document.getElementById("dot")!;
const helpButton = document.getElementById("help")!;
const sizes = document.getElementById("sizes")!;
const voiceSwitch = document.getElementById("voice")!;
const slowSwitch = document.getElementById("slow")!;

async function showStatus(): Promise<void> {
  try {
    const health = await askBackground<{ ai: string; voice: string }>({ type: "health" });
    const ai = health.ai === "bedrock" ? "AWS Bedrock AI" : "offline demo AI";
    dot.className = "dot on";
    status.textContent = `Ready · using ${ai}`;
  } catch {
    dot.className = "dot off";
    status.textContent = "Helper server is off. Please start the backend.";
  }
}

/** Draw the settings controls to match the saved settings. */
function showSettings(settings: Settings): void {
  sizes.querySelectorAll("button").forEach((button, size) => {
    button.setAttribute("aria-pressed", String(settings.textSize === size));
  });
  voiceSwitch.setAttribute("aria-checked", String(settings.voiceOn));
  slowSwitch.setAttribute("aria-checked", String(settings.slowVoice));
}

async function setUpSettings(): Promise<void> {
  let settings = await loadSettings();

  TEXT_SIZE_NAMES.forEach((name, size) => {
    const button = document.createElement("button");
    button.textContent = "A";
    button.style.fontSize = `${15 + size * 4}px`;
    button.setAttribute("aria-label", name);
    button.title = name;
    button.onclick = async () => showSettings((settings = await saveSettings({ textSize: size as 0 | 1 | 2 })));
    sizes.append(button);
  });
  voiceSwitch.onclick = async () => showSettings((settings = await saveSettings({ voiceOn: !settings.voiceOn })));
  slowSwitch.onclick = async () => showSettings((settings = await saveSettings({ slowVoice: !settings.slowVoice })));

  showSettings(settings);
}

helpButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    window.close();
  } catch {
    // Chrome does not allow extensions on its own pages (chrome://, the Web Store).
    status.textContent = "Nudi cannot work on this page. Try a normal website.";
  }
});

setUpSettings();
showStatus();
