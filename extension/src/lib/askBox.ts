// "Ask Nudi": a question box with ready-made question chips.
// The question and the (already cleaned) page summary go to the backend,
// and the answer is shown in a chat bubble and read aloud.

import type { AskResponse, PageSnapshot } from "../types";
import { askBackground } from "./messages";
import { redactText } from "./sanitize";
import { el, iconButton } from "./ui";
import { speak } from "./voice";

const SUGGESTIONS = ["How much do I pay?", "When is it due?", "Is this page safe?"];

export interface AskBox {
  element: HTMLElement;
  ask: (question: string) => Promise<void>;
}

export function createAskBox(page: PageSnapshot): AskBox {
  const wrapper = el("div", "");
  const chips = el("div", "chips");
  const form = el("form", "ask-form") as HTMLFormElement;
  const input = el("input", "ask-input") as HTMLInputElement;
  input.placeholder = "Type a question…";
  input.setAttribute("aria-label", "Ask Nudi a question about this page");
  const send = iconButton("send-btn", "send", "", "Ask");
  send.type = "submit";
  form.append(input, send);

  const answerBubble = el("div", "answer");
  answerBubble.hidden = true;

  async function ask(question: string): Promise<void> {
    const clean = redactText(question.trim());
    if (!clean) return;
    input.value = clean;
    answerBubble.hidden = false;
    answerBubble.className = "answer thinking";
    answerBubble.textContent = "Let me check…";
    try {
      const result = await askBackground<AskResponse>({ type: "ask", question: clean, page });
      answerBubble.className = "answer";
      answerBubble.textContent = result.answer;
      answerBubble.scrollIntoView({ behavior: "smooth", block: "nearest" });
      speak(result.answer);
    } catch {
      answerBubble.className = "answer";
      answerBubble.textContent = "Sorry, I cannot answer right now. Is the Nudi helper server running?";
    }
  }

  for (const suggestion of SUGGESTIONS) {
    const chip = el("button", "chip", suggestion);
    chip.onclick = () => ask(suggestion);
    chips.append(chip);
  }
  form.onsubmit = (event) => {
    event.preventDefault(); // do not reload the page
    ask(input.value);
  };

  wrapper.append(chips, form, answerBubble);
  return { element: wrapper, ask };
}
