// Content script: loaded into every web page (see manifest.json).
// It does NOTHING with the page until the Nudi side panel asks. Then it can:
//   nudi:read       read the page safely (no passwords, no typed text, no ads)
//   nudi:run        do what a big choice says (payments always ask first)
//   nudi:show-me    dim the page and point at one button
//   nudi:fix        untick a sneaky extra
//   nudi:set-trust  remember the website's trust result and Nudi's decision for the payment guard
// The payment guard is always on: it stops ANY "Pay" click to ask first.

import { askBackground } from "./lib/messages";
import { runAction, showMe } from "./lib/pageActions";
import { findFixes } from "./lib/fixes";
import { pageHasLogin, readDemoDomain, readPage } from "./lib/pageReader";
import { amountToNumber, findAmount, installPageGuard, looksLikePayment, setPageTrust } from "./lib/paymentGuard";
import { loadSettings } from "./lib/settings";
import { closeSpotlight, isSpotlightOpen } from "./lib/spotlight";
import type { PageReadResult, PageSnapshot, TabRequest } from "./types";

// This file may be injected twice (for example after the extension reloads); set up once.
const nudiWindow = window as typeof window & { nudiReady?: boolean };

if (!nudiWindow.nudiReady) {
  nudiWindow.nudiReady = true;
  loadSettings();
  installPageGuard();

  // Escape closes the "Show me" spotlight. (The payment question handles its own Escape.)
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isSpotlightOpen()) closeSpotlight();
  });

  let fixes = findFixes();

  chrome.runtime.onMessage.addListener((request: TabRequest, _sender, sendResponse) => {
    switch (request.type) {
      case "nudi:read":
        loadSettings(); // pick up any change made in the side panel
        readWhenReady().then((page) => {
          const demo = readDemoDomain();
          fixes = findFixes();
          const result: PageReadResult = {
            page,
            fixes: fixes.map((fix) => fix.message),
            hasPayment: page.elements.some((e) => looksLikePayment(e.label)),
            hasLogin: pageHasLogin(),
            demoDomain: demo.domain,
            demoAgeDays: demo.ageDays,
          };
          sendResponse(result);
        });
        return true; // the reply comes later (after waiting for the page)
      case "nudi:run":
        runAction(request.action);
        sendResponse(true);
        break;
      case "nudi:show-me":
        showMe(request.elementId, request.label);
        sendResponse(true);
        break;
      case "nudi:fix": {
        const fix = fixes[request.index];
        if (fix) {
          fix.apply();
          const saved = amountToNumber(findAmount(fix.message)) ?? 0;
          askBackground({ type: "family:event", event: { kind: "addon_removed", amount_saved: saved } }).catch(() => {});
        }
        sendResponse(Boolean(fix));
        break;
      }
      case "nudi:set-trust":
        setPageTrust(request.trust, request.decision);
        sendResponse(true);
        break;
    }
    return false; // the other replies above are sent right away
  });
}

/**
 * Many modern websites (Flipkart, Amazon…) build their page with JavaScript
 * AFTER Chrome says "loaded". If the page still looks almost empty, wait a
 * little (up to about 3 seconds) and read it again.
 */
async function readWhenReady(): Promise<PageSnapshot> {
  const ENOUGH_ELEMENTS = 3;
  const WAIT_MS = 400;
  const MAX_TRIES = 8;
  let page = readPage();
  for (let tries = 0; page.elements.length < ENOUGH_ELEMENTS && tries < MAX_TRIES; tries++) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
    page = readPage();
  }
  return page;
}
