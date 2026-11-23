// Popup logic: shows whether the backend is running, and injects the
// content script into the current tab when the big button is clicked.

import { askBackground } from "./lib/messages";

const status = document.getElementById("status")!;
const helpButton = document.getElementById("help")!;

async function showStatus(): Promise<void> {
  try {
    const health = await askBackground<{ ai: string; voice: string }>({ type: "health" });
    status.textContent = `Helper server: on (AI: ${health.ai}, voice: ${health.voice})`;
  } catch {
    status.textContent = "Helper server is OFF. Start the backend first.";
  }
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

showStatus();
