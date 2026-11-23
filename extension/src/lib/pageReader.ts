// Reads the current page into a small, safe summary (PageSnapshot).
// Each button, link and safe form field gets a "data-nudi-id" attribute so we
// can find and click it again later from the Action View.

import type { PageElement, PageSnapshot } from "../types";
import { isPrivateField, redactText } from "./sanitize";

const MAX_ELEMENTS = 150;
const MAX_TEXT_LENGTH = 6000;

/** True if the user can actually see the element. */
function isVisible(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

/** The words a person would read on (or next to) the element. */
function labelOf(element: HTMLElement): string {
  const text =
    element.getAttribute("aria-label") ||
    element.innerText ||
    (element as HTMLInputElement).value ||
    element.getAttribute("title") ||
    element.getAttribute("placeholder") ||
    "";
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Hint text for a form field (never its value). */
function fieldHint(element: HTMLElement): string {
  const hint =
    element.getAttribute("aria-label") ||
    element.getAttribute("placeholder") ||
    element.getAttribute("name") ||
    "";
  return hint.trim().slice(0, 200);
}

function kindOf(element: HTMLElement): PageElement["kind"] {
  if (element.tagName === "A") return "link";
  if (element.tagName === "SELECT") return "select";
  if (element.tagName === "INPUT" && !["submit", "button"].includes((element as HTMLInputElement).type)) {
    return "input";
  }
  return "button";
}

export function readPage(): PageSnapshot {
  const selector = "button, a[href], input, select, [role=button]";
  const elements: PageElement[] = [];
  let counter = 0;

  for (const node of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    if (elements.length >= MAX_ELEMENTS) break;
    if (!isVisible(node)) continue;
    if (node.closest("#nudi-root")) continue; // skip our own overlay

    // Private fields are skipped completely: not even their label leaves the browser.
    if (isPrivateField(node)) continue;

    const kind = kindOf(node);
    // For text boxes we only send the hint text, NEVER what the user typed.
    const label = kind === "input" || kind === "select" ? fieldHint(node) : labelOf(node);
    if (!label) continue;

    const id = `n${counter++}`;
    node.dataset.nudiId = id;
    elements.push({ id, kind, label: redactText(label) });
  }

  return {
    url: location.href,
    title: document.title,
    text: redactText(document.body.innerText.replace(/\s+/g, " ")).slice(0, MAX_TEXT_LENGTH),
    elements,
  };
}

/** Find an element again by the id we gave it in readPage(). */
export function findElement(nudiId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-nudi-id="${nudiId}"]`);
}
