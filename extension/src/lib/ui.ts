// Shared look-and-feel for everything Nudi draws on a page.
// We draw inside a "shadow root" so the website's CSS cannot change how
// Nudi looks, and Nudi's CSS cannot break the website.

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, sans-serif; }
  .panel {
    position: fixed; top: 16px; right: 16px; width: 380px; max-height: calc(100vh - 32px);
    overflow-y: auto; z-index: 2147483647; background: #fffdf7; color: #1a1a1a;
    border: 3px solid #1d4ed8; border-radius: 16px; padding: 20px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.35); font-size: 20px; line-height: 1.4;
  }
  h2 { margin: 0 0 8px; font-size: 26px; color: #1d4ed8; }
  .summary { margin: 0 0 16px; }
  .warning { padding: 12px; border-radius: 10px; margin: 0 0 10px; font-size: 18px; }
  .warning.danger { background: #fee2e2; border: 2px solid #b91c1c; }
  .warning.caution { background: #fef3c7; border: 2px solid #b45309; }
  .warning.info { background: #e0f2fe; border: 2px solid #0369a1; }
  button {
    display: block; width: 100%; min-height: 60px; margin: 10px 0; padding: 12px 16px;
    font-size: 22px; font-weight: 600; text-align: left; cursor: pointer;
    border-radius: 12px; border: 2px solid #1d4ed8; background: #eff6ff; color: #1e3a8a;
  }
  button:hover, button:focus { background: #dbeafe; outline: 3px solid #f59e0b; }
  button.payment { border-color: #b45309; background: #fffbeb; color: #78350f; }
  .row { display: flex; gap: 8px; }
  .row button { text-align: center; font-size: 18px; min-height: 48px; }
  .mode { font-size: 14px; color: #555; margin-top: 8px; }
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
  }
  .dialog {
    background: #fff; color: #1a1a1a; width: min(460px, 90vw); padding: 24px;
    border-radius: 16px; font-size: 22px; border: 4px solid #b45309;
  }
  .dialog .big { font-size: 30px; font-weight: 700; margin: 0 0 8px; }
  .dialog .small { font-size: 16px; color: #555; }
  .dialog .yes { background: #fef3c7; border-color: #b45309; color: #78350f; text-align: center; }
  .dialog .no { background: #dcfce7; border-color: #15803d; color: #14532d; text-align: center; }
`;

/** Make (or replace) a host element on the page with its own shadow root. */
export function createOverlayHost(id: string): { host: HTMLElement; root: ShadowRoot } {
  document.getElementById(id)?.remove();
  const host = document.createElement("div");
  host.id = id;
  document.documentElement.appendChild(host);
  // "closed" means the website's own scripts cannot reach inside (for example
  // to press our "Yes, pay" button for the user).
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${STYLES}</style>`;
  return { host, root };
}

/** Make an element from a tag, a CSS class, and plain text (text is never treated as HTML). */
export function el(tag: string, className: string, text = ""): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}
