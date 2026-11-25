// "Explain this with Nudi" (right-click on selected words): the answer card.
//
// The card sits at the TOP of the side panel, so it is seen at once. It does
// not depend on the page being read first: the explanation starts straight
// away, even while the panel says "Reading this page…", and the card stays
// when the panel redraws. It goes away with "Close" or when you switch tabs.

import type { ExplainResponse } from "../types";
import { askBackground } from "./messages";
import { redactText } from "./sanitize";
import { el } from "./ui";
import { speak } from "./voice";

interface State {
  quote: string;
  answer: string;
  loading: boolean;
}

let state: State | null = null;
let slot: HTMLElement | null = null; // the card's place in the panel that is showing now
let run = 0; // a newer request replaces an older one

function draw(): void {
  if (!slot) return;
  if (!state) {
    slot.replaceChildren();
    return;
  }
  const card = el("section", "explain-card");
  card.setAttribute("aria-label", "Nudi explains");
  const answer = el("div", "explain-answer", state.answer);
  answer.setAttribute("role", "status");
  const close = el("button", "link-btn", "Close");
  close.onclick = clearExplain;
  const top = el("div", "explain-top");
  top.append(el("div", "answer-who", "You asked about"), close);
  card.append(top, el("blockquote", "answer-quote", state.quote));
  if (state.loading) {
    const waiting = el("div", "waiting small");
    waiting.append(el("div", "spinner"), answer);
    card.append(waiting);
  } else {
    card.append(el("div", "answer-who", "Nudi says"), answer);
  }
  slot.replaceChildren(card);
}

/** A fresh place for the card. Call this each time the panel is drawn. */
export function explainSlot(): HTMLElement {
  slot = el("div", "explain-slot");
  draw();
  return slot;
}

export function clearExplain(): void {
  run++;
  state = null;
  draw();
}

export async function startExplain(text: string, pageTitle: string): Promise<void> {
  const clean = redactText(text.trim()).slice(0, 500);
  if (!clean) return;
  const myRun = ++run;
  state = { quote: clean.length > 160 ? `${clean.slice(0, 160)}…` : clean, answer: "Let me explain…", loading: true };
  draw();
  slot?.scrollIntoView({ behavior: "smooth", block: "start" });

  let answer: string;
  try {
    answer = (await askBackground<ExplainResponse>({ type: "explain", text: clean, pageTitle })).explanation;
  } catch {
    answer = "Sorry, I cannot explain right now. Is the Nudi helper server running?";
  }
  if (myRun !== run) return; // closed, or a newer request came in
  state = { ...state!, answer, loading: false };
  draw();
  speak(answer);
}
