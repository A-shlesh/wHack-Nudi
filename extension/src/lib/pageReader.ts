// Reads the current page into a small, safe summary (PageSnapshot).
// Each button, link and safe form field gets a "data-nudi-id" attribute so we
// can find and click it again later from the Action View.

import type { PageElement, PageSnapshot } from "../types";
import { isPrivateField, redactText } from "./sanitize";

const MAX_ELEMENTS = 150;
const MAX_LABEL_LENGTH = 200;
const MAX_TEXT_LENGTH = 6000;

/** True if the user can actually see the element. */
function isVisible(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

/** The words a person reads on a button or link. Also used by the payment guard. */
export function visibleLabel(element: HTMLElement): string {
  const text =
    element.innerText ||
    (element as HTMLInputElement).value ||
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    "";
  return text.replace(/\s+/g, " ").trim();
}

/** Hint text for a form field (NEVER the value the user typed). */
function fieldHint(element: HTMLElement): string {
  return (element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.getAttribute("name") || "").trim();
}

/** True for things you type into or choose from (not submit buttons). */
export function isFormField(element: HTMLElement): boolean {
  if (element.tagName === "SELECT" || element.tagName === "TEXTAREA") return true;
  if (element.tagName !== "INPUT") return false;
  return !["submit", "button", "image", "reset"].includes((element as HTMLInputElement).type);
}

function kindOf(element: HTMLElement): PageElement["kind"] {
  if (element.tagName === "A") return "link";
  if (element.tagName === "SELECT") return "select";
  if (isFormField(element)) return "input";
  return "button";
}

/**
 * The visible page text, WITHOUT anything the user typed.
 * We copy the page and delete text boxes and editable areas (draft emails,
 * chat boxes) from the copy before reading it.
 */
function safePageText(): string {
  const copy = document.body.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll("input, textarea, select, [contenteditable], script, style, noscript, #nudi-root, #nudi-confirm")
    .forEach((node) => node.remove());
  const text = (copy.textContent || "").replace(/\s+/g, " ");
  return redactText(text).slice(0, MAX_TEXT_LENGTH);
}

export function readPage(): PageSnapshot {
  // Remove ids from an earlier run (or planted by the page) so every id is unique.
  document.querySelectorAll("[data-nudi-id]").forEach((node) => node.removeAttribute("data-nudi-id"));

  const selector = "button, a[href], input, select, textarea, [role=button]";
  const elements: PageElement[] = [];
  let counter = 0;

  for (const node of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    if (elements.length >= MAX_ELEMENTS) break;
    if (!isVisible(node)) continue; // also skips <input type="hidden">

    const kind = kindOf(node);
    // Private fields are skipped completely: not even their label leaves the browser.
    if ((kind === "input" || kind === "select") && isPrivateField(node)) continue;

    // For form fields we only send the hint text, never what the user typed.
    const rawLabel = kind === "input" || kind === "select" ? fieldHint(node) : visibleLabel(node);
    // Redact FIRST, then cut to length, so the label always fits the backend's limit.
    const label = redactText(rawLabel).slice(0, MAX_LABEL_LENGTH);
    if (!label) continue;

    const id = `n${counter++}`;
    node.dataset.nudiId = id;
    elements.push({ id, kind, label });
  }

  return {
    // Only origin + path: query strings and #fragments can hold login tokens.
    url: location.origin + location.pathname,
    title: redactText(document.title),
    text: safePageText(),
    elements,
  };
}

/** Find an element again by the id we gave it in readPage(). */
export function findElement(nudiId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-nudi-id="${CSS.escape(nudiId)}"]`);
}
