// Small helpers for drawing Nudi's UI on a page.
// We draw inside a "shadow root" so the website's CSS cannot change how
// Nudi looks, and Nudi's CSS cannot break the website.

import { icon, type IconName } from "./icons";
import { STYLES } from "./styles";

/**
 * Make (or replace) a host element on the page with its own shadow root.
 * Returns the root and an ".app" box inside it to draw into.
 */
export function createOverlayHost(id: string): { host: HTMLElement; root: ShadowRoot; app: HTMLElement } {
  document.getElementById(id)?.remove();
  const host = document.createElement("div");
  host.id = id;
  document.documentElement.appendChild(host);
  // "closed" means the website's own scripts cannot reach inside (for example
  // to press our "Yes, pay" button for the user).
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${STYLES}</style>`;
  const app = el("div", "app");
  root.append(app);
  return { host, root, app };
}

/** Make an element from a tag, a CSS class, and plain text (text is never treated as HTML). */
export function el(tag: string, className: string, text = ""): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

/** Make a button with an icon and an optional text label. */
export function iconButton(className: string, iconName: IconName, label = "", title = label): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = className;
  button.innerHTML = icon(iconName); // fixed SVG, safe
  if (label) button.append(el("span", "", label));
  if (title) button.setAttribute("aria-label", title);
  if (title) button.title = title;
  return button;
}

/** Make a <span> holding one icon. */
export function iconSpan(iconName: IconName, size = 20): HTMLElement {
  const span = document.createElement("span");
  span.innerHTML = icon(iconName, size); // fixed SVG, safe
  span.style.display = "inline-flex";
  return span;
}
