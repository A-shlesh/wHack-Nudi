// Background service worker.
//   - It is the ONLY part of the extension that talks to the Nudi backend.
//   - It makes the toolbar icon (and Alt+Shift+N) open Nudi in Chrome's side panel.
//   - It adds the right-click menu item "Explain this with Nudi".

import { BACKEND_URL } from "./config";
import { postForJson, postJson } from "./lib/api";
import { handleFamily } from "./lib/familyClient";
import { redactText } from "./lib/sanitize";
import type { BackgroundReply, BackgroundRequest } from "./types";

// Clicking the Nudi icon opens the side panel next to the page.
// A right-click menu item lets people ask Nudi to explain words they selected.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  chrome.contextMenus.create({ id: "nudi-explain", title: "Explain this with Nudi", contexts: ["selection"] });
});

// "Explain this with Nudi": open the side panel and leave the selected text for it.
// Private numbers (OTPs, card numbers) are hidden before anything is stored or sent.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "nudi-explain" || !info.selectionText || tab?.windowId === undefined) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  chrome.storage.session.set({
    nudiExplain: { text: redactText(info.selectionText).slice(0, 500), title: tab.title ?? "", at: Date.now() },
  });
});

// Keyboard shortcut (Alt+Shift+N) opens the side panel for the current window.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "open-nudi" && tab?.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  }
});

/** Turn binary audio into a "data:" URL that a page can play. */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type || "audio/mpeg"};base64,${btoa(binary)}`;
}

async function handle(request: BackgroundRequest): Promise<unknown> {
  if (request.type.startsWith("family:")) return handleFamily(request);

  switch (request.type) {
    case "health":
      return (await fetch(`${BACKEND_URL}/health`)).json();
    case "simplify":
      return postForJson("/simplify", request.page);
    case "ask":
      return postForJson("/ask", { question: request.question, page: request.page });
    case "explain":
      return postForJson("/explain", { text: request.text, page_title: request.pageTitle });
    case "trust":
      return postForJson("/trust", request.request);
    case "speak": {
      const response = await postJson("/speak", { text: request.text });
      // 204 means "no cloud voice, use the browser voice" -> return null.
      if (response.status === 204 || !response.ok) return null;
      return blobToDataUrl(await response.blob());
    }
  }
}

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  handle(request)
    .then((data) => sendResponse({ ok: true, data } satisfies BackgroundReply<unknown>))
    .catch((error: Error) => sendResponse({ ok: false, error: error.message } satisfies BackgroundReply<unknown>));
  return true; // keeps the message channel open for the async reply
});
