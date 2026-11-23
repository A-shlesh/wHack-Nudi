// The building blocks of the Nudi side panel: the header, the safety
// verdict, the big choices, and the "watch out" notices.
// actionView.ts puts these blocks together.

import type { Action, PageWarning } from "../types";
import type { Fix } from "./fixes";
import { el, iconButton, iconSpan, logoSpan } from "./ui";

// ---------- Header ----------

export function buildHeader(onHide: (() => void) | null, onClose: () => void): HTMLElement {
  const header = el("header", "header");
  const wordmark = el("div", "wordmark");
  wordmark.append(el("div", "wordmark-name", "Nudi"), el("div", "wordmark-sub", "Here to help"));
  header.append(logoSpan(40), wordmark);

  if (onHide) {
    const hide = iconButton("header-btn", "hide", "Hide", "Hide Nudi for now");
    hide.onclick = onHide;
    header.append(hide);
  }
  const close = iconButton("header-btn", "close", "Close", "Close Nudi");
  close.onclick = onClose;
  header.append(close);
  return header;
}

// ---------- Verdict: is this page safe? ----------

export function buildVerdict(warnings: PageWarning[], onSeeWhy: () => void): HTMLElement {
  const dangers = warnings.filter((w) => w.level === "danger").length;
  const cautions = warnings.filter((w) => w.level === "caution").length;

  const [level, title, text] =
    dangers > 0
      ? ["risky", "This page looks risky", "I found signs of a scam. Please do not share any personal details here."]
      : cautions > 0
        ? ["careful", "Be careful on this page", "This page uses tricks to rush or push you. Take your time."]
        : ["safe", "This page looks safe", "I did not find any tricks. Still, never share your OTP."];

  const verdict = el("section", `verdict ${level}`);
  verdict.setAttribute("aria-label", "Safety check");
  const heading = el("div", "verdict-title");
  heading.setAttribute("tabindex", "-1"); // so we can move keyboard focus here when the panel opens
  heading.append(iconSpan(level === "safe" ? "shield" : "alert", 26), el("span", "", title));
  verdict.append(heading, el("p", "", text));

  if (warnings.length > 0) {
    const seeWhy = el("button", "link-btn", `See why (${warnings.length})`);
    seeWhy.onclick = onSeeWhy;
    verdict.append(seeWhy);
  }
  return verdict;
}

// ---------- Big choices ----------

export function buildChoice(
  action: Action,
  index: number,
  onChoose: () => void,
  onShowMe: () => void,
): HTMLElement {
  const item = el("li", "choice");
  item.style.animationDelay = `${index * 50}ms`;

  const button = el("button", action.is_payment ? "choice-btn payment" : "choice-btn");
  const text = el("span", "", action.label);
  if (action.is_payment) {
    const note = el("span", "choice-note");
    note.append(iconSpan("lock", 16), el("span", "", "Nudi will check with you before paying"));
    text.append(note);
  }
  button.append(el("span", "choice-num", String(index + 1)), text);
  button.onclick = onChoose;

  const showMe = iconButton("link-btn", "eye", "Show me where it is", `Show me where "${action.label}" is on the page`);
  showMe.onclick = onShowMe;

  item.append(button, showMe);
  return item;
}

// ---------- Watch out ----------

export function buildWarning(warning: PageWarning): HTMLElement {
  const notice = el("div", `notice ${warning.level}`);
  notice.append(iconSpan(warning.level === "info" ? "info" : "alert", 22), el("div", "", warning.message));
  return notice;
}

const LEVEL_ORDER = { danger: 0, caution: 1, info: 2 };
const SHOWN_AT_FIRST = 2;

/** Warnings, most serious first. Only the first two are shown until "Show more" is tapped. */
export function buildWarningList(warnings: PageWarning[]): HTMLElement {
  const list = el("div", "");
  const sorted = [...warnings].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  sorted.slice(0, SHOWN_AT_FIRST).forEach((w) => list.append(buildWarning(w)));

  const hidden = sorted.slice(SHOWN_AT_FIRST);
  if (hidden.length > 0) {
    const more = el("button", "link-btn", `Show ${hidden.length} more`);
    more.onclick = () => more.replaceWith(...hidden.map(buildWarning));
    list.append(more);
  }
  return list;
}

/** A "Remove it for me" card for a sneaky extra. onFixed runs after the fix. */
export function buildFix(fix: Fix, onFixed: () => void): HTMLElement {
  const notice = el("div", "notice fix");
  const content = el("div", "");
  content.append(el("div", "notice-title", "Something extra was added for you"), el("div", "", fix.message));
  const button = el("button", "btn primary", "Remove it for me");
  button.onclick = () => {
    fix.apply();
    notice.className = "notice done";
    notice.replaceChildren(
      iconSpan("checkCircle", 22),
      el("div", "", "Done. I removed the extra. Please check the new total."),
    );
    onFixed();
  };
  content.append(button);
  notice.append(iconSpan("info", 22), content);
  return notice;
}
