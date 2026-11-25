// "Basic mode": what Nudi can still do when its helper server is off.
// The same simple rules as the backend's offline mode, run inside the browser:
//   - pick up to 5 choices from the page (form boxes and buttons first)
//   - find pressure and scam phrases in the page text
// Keep these in sync with backend/app/services/mock_ai.py and backend/app/risk_rules.py.
// The payment guard does not need any of this: it always runs in the page.

import type { Action, Decision, PageElement, PageSnapshot, PageWarning, SimplifyResponse } from "../types";
import { looksLikePayment } from "./paymentGuard";

const MAX_CHOICES = 5;
const ENOUGH_BUTTONS = 3;
const SKIP_WORDS = ["cookie", "privacy", "terms", "newsletter", "advert", "sponsored", "share", "no, i don't", "no thanks", "search"];

// (phrases to look for, level, message) — same as backend/app/risk_rules.py
const TEXT_RULES: Array<[string[], PageWarning["level"], string]> = [
  [["hurry", "only a few left", "offer ends in", "expires in", "last chance", "act now"], "caution",
    "This page is rushing you. Take your time. Real offers do not disappear in minutes."],
  [["you have won", "lottery", "lucky winner", "claim your prize", "free gift"], "danger",
    "This looks like a prize scam. You cannot win something you did not enter."],
  [["kyc", "account will be blocked", "account suspended", "verify your account immediately"], "danger",
    "Banks never ask you to update KYC through a link. Call your bank on its official number."],
  [["share otp", "tell us the otp", "enter otp to receive"], "danger",
    "Never share an OTP to RECEIVE money. An OTP is only for sending money."],
  [["remote access", "anydesk", "teamviewer", "quick support"], "danger",
    "Never install screen-sharing apps because a website or caller tells you to."],
  [["protection plan added", "insurance added", "donation added", "tip added"], "caution",
    "Something extra may have been added to your order. Check the total before paying."],
  [["no, i don't want to save", "no thanks, i prefer paying more"], "info",
    "This page uses guilt words to push you. It is fine to say no."],
];

function isFormBox(element: PageElement): boolean {
  return element.kind === "input" || element.kind === "select";
}

/** Higher = more likely to be what the person came to do. */
function score(element: PageElement): number {
  let points = 0;
  if (isFormBox(element)) points += 2.5;
  else if (element.kind === "button") points += 2;
  if (looksLikePayment(element.label)) points += 3;
  return points;
}

function friendlyLabel(element: PageElement): string {
  let clean = element.label.replace(/\s+/g, " ").trim();
  if (clean === clean.toUpperCase()) clean = clean.charAt(0) + clean.slice(1).toLowerCase();
  if (element.kind === "input") return `Type your ${clean.toLowerCase()}`;
  if (element.kind === "select") return `Choose: ${clean}`;
  return clean;
}

function localChoices(page: PageSnapshot): Action[] {
  const buttons = page.elements.filter((e) => e.kind === "button").length;
  const allowLinks = buttons < ENOUGH_BUTTONS; // with enough buttons, menu links are noise
  // Best first; equal scores keep page order.
  const ranked = page.elements
    .map((element, index) => ({ element, index }))
    .sort((a, b) => score(b.element) - score(a.element) || a.index - b.index)
    .map((item) => item.element);

  const choices: Action[] = [];
  for (const element of ranked) {
    const label = element.label.trim();
    if (!label || !/[a-z]/i.test(label)) continue; // "+91", "→"
    if (element.kind === "link" && !allowLinks) continue;
    if (SKIP_WORDS.some((word) => label.toLowerCase().includes(word))) continue;
    choices.push({ element_id: element.id, label: friendlyLabel(element), is_payment: looksLikePayment(label) });
    if (choices.length >= MAX_CHOICES) break;
  }
  return choices;
}

function localWarnings(page: PageSnapshot): PageWarning[] {
  const text = `${page.title} ${page.text}`.toLowerCase();
  const warnings: PageWarning[] = [];
  for (const [phrases, level, message] of TEXT_RULES) {
    if (phrases.some((phrase) => text.includes(phrase))) warnings.push({ level, message, source: "rules" });
  }
  return warnings;
}

/** A full answer built only in the browser, shaped like the backend's answer. */
export function basicModeAnswer(page: PageSnapshot): SimplifyResponse {
  const warnings = localWarnings(page);
  const danger = warnings.filter((w) => w.level === "danger").map((w) => w.message);
  const decision: Decision = danger.length
    ? { action: "ask_family", reasons: danger.slice(0, 3), source: "rules" }
    : { action: "watch", reasons: [], source: "rules" };
  return { summary: "", actions: localChoices(page), warnings, decision, mode: "mock" };
}
