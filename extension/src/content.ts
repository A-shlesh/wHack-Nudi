// Content script: injected into the current tab when the user clicks
// "Help me with this page" in the Nudi popup (or presses Alt+Shift+N).
// Steps: load the user's settings -> turn on the payment guard -> read the
// page safely -> ask the backend to simplify it -> show the side panel.

import { closeView, showActionView, showMessage } from "./lib/actionView";
import { askBackground } from "./lib/messages";
import { readPage } from "./lib/pageReader";
import { installPageGuard } from "./lib/paymentGuard";
import { loadSettings } from "./lib/settings";
import { closeSpotlight, isSpotlightOpen } from "./lib/spotlight";
import type { SimplifyResponse } from "./types";

// The script may be injected more than once; only add listeners once.
const nudiWindow = window as typeof window & { nudiReady?: boolean };
if (!nudiWindow.nudiReady) {
  installPageGuard();
  // Escape closes the "Show me" spotlight first, then the panel.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.getElementById("nudi-confirm")) return; // the payment question handles its own Escape
    if (isSpotlightOpen()) closeSpotlight();
    else if (document.getElementById("nudi-root")) closeView();
  });
  nudiWindow.nudiReady = true;
}

/** quiet = true when we refresh after a fix, so Nudi does not repeat everything aloud. */
async function start(quiet = false): Promise<void> {
  await loadSettings();
  if (!quiet) showMessage("Reading this page…", "One moment. I am making it simple for you.", true);
  try {
    const page = readPage();
    const result = await askBackground<SimplifyResponse>({ type: "simplify", page });
    showActionView(result, page, () => start(true), quiet);
  } catch (error) {
    showMessage("Nudi cannot connect", "The Nudi helper server is not running. Please start it, then try again.");
    console.error("Nudi:", error);
  }
}

start();
