// Reads the current page into a small, safe summary (PageSnapshot).
// Each button, link and safe form field gets a "data-nudi-id" attribute so we
// can find and click it again later from the Action View.

import type { PageElement, PageSnapshot } from "../types";
import { BACKEND_URL } from "../config";
import { isPrivateField, redactText } from "./sanitize";

const MAX_ELEMENTS = 150;
const MAX_LABEL_LENGTH = 200;
const MAX_TEXT_LENGTH = 15000; // long pages (e.g. a "Contact us" at the bottom); the AI sees only the parts it needs

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
    // Icon-only buttons: the picture's description, or the icon's title.
    element.querySelector("img[alt]")?.getAttribute("alt") ||
    element.querySelector("svg title")?.textContent ||
    (element as HTMLInputElement).alt ||
    "";
  return text.replace(/\s+/g, " ").trim();
}

/** Hint text for a form field (NEVER the value the user typed). */
function fieldHint(element: HTMLElement): string {
  const field = element as HTMLInputElement;
  // The <label> tags joined to this field, and any element it names with aria-labelledby.
  const labels = Array.from(field.labels ?? []).map((label) => label.innerText).join(" ");
  const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => (id ? document.getElementById(id)?.innerText ?? "" : ""))
    .join(" ");
  // Many sites show the name as plain text next to the box (no <label>).
  // innerText never includes what was typed into a box, so this stays private.
  const nearby = element.parentElement?.innerText ?? "";
  const byType = FIELD_TYPE_NAMES[element.getAttribute("autocomplete") ?? ""] ?? FIELD_TYPE_NAMES[field.type] ?? "";

  const candidates = [
    element.getAttribute("aria-label"),
    labelledBy,
    labels,
    element.getAttribute("placeholder"),
    nearby.length <= 40 ? nearby : "",
    byType,
    element.getAttribute("name"),
  ];
  return (candidates.map((text) => (text ?? "").replace(/\s+/g, " ").trim()).find((text) => text) ?? "").slice(0, 200);
}

// Plain names for common kinds of boxes, from their "autocomplete" or "type".
const FIELD_TYPE_NAMES: Record<string, string> = {
  tel: "Phone number",
  "tel-national": "Phone number",
  email: "Email",
  username: "Username",
  name: "Name",
  "postal-code": "PIN code",
  "address-line1": "Address",
  search: "Search",
};

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

// Things we leave out of the page text:
//   - anything the user can type into (privacy)
//   - code and Nudi's own parts
//   - adverts: an ad saying "You won a prize!" does not make the BILL page a scam
const SKIP_IN_TEXT = [
  "input", "textarea", "select", "[contenteditable]", "script", "style", "noscript",
  "#nudi-root", "#nudi-confirm", "#nudi-spotlight",
  ".ad", ".ads", ".advert", "[class*='advert']", "[class*='sponsor']", "[id^='ad-']", "[id*='google_ads']",
  "ins.adsbygoogle", "iframe", "[aria-label*='advert' i]",
].join(", ");

/**
 * The visible page text, WITHOUT anything the user typed and without adverts.
 * We copy the page and delete those parts from the copy before reading it.
 */
function safePageText(): string {
  const copy = document.body.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(SKIP_IN_TEXT).forEach((node) => node.remove());
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

/** True if the page asks for a password (a login form). */
export function pageHasLogin(): boolean {
  return document.querySelector("input[type=password]") !== null;
}

/**
 * Demo pages run on localhost, which cannot be looked up on the internet.
 * They pretend to be a real website with two tags:
 *   <meta name="nudi-demo-domain" content="bescom-bill-pay-offer.co">
 *   <meta name="nudi-demo-domain-age-days" content="9">
 * We ONLY read these on localhost or on the Nudi backend's own demo pages
 * (for the AWS demo). A real website could otherwise use them to pretend to
 * be a trusted bank. The backend checks this again.
 */
export function readDemoDomain(): { domain: string | null; ageDays: number | null } {
  const demoHosts = ["localhost", "127.0.0.1", "[::1]", new URL(BACKEND_URL).hostname];
  if (!demoHosts.includes(location.hostname)) return { domain: null, ageDays: null };
  const domain = document.querySelector<HTMLMetaElement>('meta[name="nudi-demo-domain"]')?.content || null;
  const age = document.querySelector<HTMLMetaElement>('meta[name="nudi-demo-domain-age-days"]')?.content;
  return { domain, ageDays: age ? Number(age) : null };
}

/** Find an element again by the id we gave it in readPage(). */
export function findElement(nudiId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-nudi-id="${CSS.escape(nudiId)}"]`);
}
