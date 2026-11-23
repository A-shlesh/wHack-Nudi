// "Show me": dims the whole page except one element, draws a glowing ring
// around it, and shows a note next to it. Tap anywhere (or press Escape)
// to close. This teaches the user WHERE the real button is.

import { createOverlayHost, el } from "./ui";

const HOST_ID = "nudi-spotlight";
const PADDING = 8; // space between the element and the ring
const TIP_WIDTH = 320;
const TIP_HEIGHT = 130; // rough height, used to decide above or below
const AUTO_CLOSE_MS = 10000;

export function closeSpotlight(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function isSpotlightOpen(): boolean {
  return document.getElementById(HOST_ID) !== null;
}

export function spotlight(target: HTMLElement, message: string): void {
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  // Wait for the smooth scroll to finish before measuring where the element is.
  setTimeout(() => draw(target, message), 450);
}

function draw(target: HTMLElement, message: string): void {
  const { app } = createOverlayHost(HOST_ID);
  const box = target.getBoundingClientRect();

  // Full-screen layer: catches the tap that closes the spotlight.
  const layer = el("div", "spot-layer");
  layer.onclick = closeSpotlight;

  const ring = el("div", "spot");
  ring.style.left = `${box.left - PADDING}px`;
  ring.style.top = `${box.top - PADDING}px`;
  ring.style.width = `${box.width + PADDING * 2}px`;
  ring.style.height = `${box.height + PADDING * 2}px`;

  const tip = el("div", "tip");
  tip.setAttribute("role", "status");
  const gotIt = el("button", "btn primary", "Got it");
  tip.append(el("div", "tip-title", message), gotIt);
  // Put the note below the element if there is room, otherwise above it.
  const roomBelow = window.innerHeight - box.bottom > TIP_HEIGHT + 24;
  tip.style.top = roomBelow ? `${box.bottom + 20}px` : `${Math.max(16, box.top - TIP_HEIGHT - 20)}px`;
  tip.style.left = `${Math.min(Math.max(16, box.left), window.innerWidth - TIP_WIDTH - 16)}px`;

  layer.append(ring, tip);
  app.append(layer);
  gotIt.focus();
  setTimeout(closeSpotlight, AUTO_CLOSE_MS);
}
