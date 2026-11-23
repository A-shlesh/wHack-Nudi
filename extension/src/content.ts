// Content script: injected into the current tab when the user clicks
// "Help me with this page" in the Nudi popup.
// Steps: turn on the payment guard -> read the page safely -> ask the
// backend to simplify it -> show the Action View and read it aloud.

import { showActionView, showMessage } from "./lib/actionView";
import { askBackground } from "./lib/messages";
import { readPage } from "./lib/pageReader";
import { installPageGuard } from "./lib/paymentGuard";
import type { SimplifyResponse } from "./types";

// The popup may inject this script more than once; only add the guard once.
const nudiWindow = window as typeof window & { nudiGuardInstalled?: boolean };
if (!nudiWindow.nudiGuardInstalled) {
  installPageGuard();
  nudiWindow.nudiGuardInstalled = true;
}

async function start(): Promise<void> {
  showMessage("Nudi", "One moment, I am reading this page for you…");
  try {
    const page = readPage();
    const result = await askBackground<SimplifyResponse>({ type: "simplify", page });
    showActionView(result);
  } catch (error) {
    showMessage(
      "Nudi cannot connect",
      "The Nudi helper server is not running. Please start it and try again.",
    );
    console.error("Nudi:", error);
  }
}

start();
