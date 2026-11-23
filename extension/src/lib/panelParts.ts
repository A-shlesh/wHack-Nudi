// The building blocks of the Nudi side panel: the header, the safety
// verdict, the big choices, and the "watch out" notices.
// actionView.ts puts these blocks together.

import type { Action, PageWarning, TrustResult } from "../types";
import { el, iconButton, iconSpan, logoSpan } from "./ui";

// ---------- Header ----------

/** sharing: null = no family connected, true = sharing ON, false = paused. */
export function buildHeader(sharing: boolean | null): HTMLElement {
  const header = el("header", "header");
  const wordmark = el("div", "wordmark");
  wordmark.append(el("div", "wordmark-name", "Nudi"), el("div", "wordmark-sub", "Here to help"));
  header.append(logoSpan(40), wordmark);
  if (sharing !== null) {
    const badge = el("div", sharing ? "share-badge on" : "share-badge", sharing ? "Sharing with family: ON" : "Sharing paused");
    header.append(badge);
  }
  return header;
}

// ---------- Verdict: is this website and page safe? ----------

type Level = "safe" | "careful" | "risky";

/** The worst of: the website trust check, and the warnings found on the page. */
function overallLevel(trust: TrustResult | null, warnings: PageWarning[]): Level {
  if (trust?.level === "danger" || warnings.some((w) => w.level === "danger")) return "risky";
  if (trust?.level === "caution" || warnings.some((w) => w.level === "caution")) return "careful";
  return "safe";
}

export function buildVerdict(trust: TrustResult | null, warnings: PageWarning[], onSeeWhy: () => void): HTMLElement {
  const level = overallLevel(trust, warnings);
  const scamSite = trust?.level === "danger";

  const [title, text] =
    level === "risky"
      ? scamSite
        ? ["This website looks like a scam", "Do not pay or share any details here. Nudi will block payments on this website."]
        : ["This page looks risky", "I found signs of a scam on this page. Please do not share any personal details."]
      : level === "careful"
        ? ["Be careful on this page", "Something here needs a second look. Take your time."]
        : ["This website looks safe", "I did not find any tricks. Still, never share your OTP."];

  const verdict = el("section", `verdict ${level}`);
  verdict.setAttribute("aria-label", "Safety check");
  const heading = el("div", "verdict-title");
  heading.setAttribute("tabindex", "-1"); // so we can move keyboard focus here
  heading.append(iconSpan(level === "safe" ? "shield" : "alert", 26), el("span", "", title));
  verdict.append(heading, el("p", "", text));

  // Website trust: the domain, a score bar, and the reasons in plain words.
  if (trust) {
    const site = el("div", "trust-site");
    site.append(el("span", "", "Website: "), el("strong", "", trust.domain));
    const meter = el("div", "meter");
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-label", "Website trust score");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(trust.trust_score));
    const fill = el("div", `meter-fill ${trust.level}`);
    fill.style.width = `${Math.max(4, trust.trust_score)}%`;
    meter.append(fill);
    const score = el("div", "meter-label", `Trust score: ${trust.trust_score} out of 100`);
    verdict.append(site, meter, score);

    if (trust.reasons.length > 0) {
      const list = el("ul", "trust-reasons");
      for (const reason of trust.reasons) list.append(el("li", "", reason.message_simple));
      verdict.append(list);
    }
  }

  if (warnings.length > 0) {
    const seeWhy = el("button", "link-btn", `See what I found on this page (${warnings.length})`);
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

/** A "Remove it for me" card for a sneaky extra. apply() does the fix in the page. */
export function buildFix(message: string, apply: () => void, onFixed: () => void): HTMLElement {
  const notice = el("div", "notice fix");
  const content = el("div", "");
  content.append(el("div", "notice-title", "Something extra was added for you"), el("div", "", message));
  const button = el("button", "btn primary", "Remove it for me");
  button.onclick = () => {
    apply();
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
