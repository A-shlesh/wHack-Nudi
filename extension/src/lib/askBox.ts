// "Ask a question": ready-made question buttons plus a question box.
// The question and the (already cleaned) page summary go to the backend,
// and the answer is shown on screen and read aloud.

import type { AskResponse, ExplainResponse, PageSnapshot } from "../types";
import { askBackground } from "./messages";
import { redactText } from "./sanitize";
import { el } from "./ui";
import { speak } from "./voice";

const SUGGESTIONS = ["How much do I pay?", "When is it due?", "Is this page safe?"];

export interface AskBox {
  element: HTMLElement;
  ask: (question: string) => Promise<void>;
  explain: (text: string, pageTitle: string) => Promise<void>;
}

export function createAskBox(page: PageSnapshot): AskBox {
  const wrapper = el("div", "");
  const chips = el("div", "chips");

  const form = el("form", "") as HTMLFormElement;
  const label = el("label", "ask-label", "Or type your own question");
  const row = el("div", "ask-form");
  const input = el("input", "ask-input") as HTMLInputElement;
  input.placeholder = "For example: what is this page for?";
  input.id = "nudi-question";
  label.setAttribute("for", input.id);
  const send = el("button", "btn primary", "Ask") as HTMLButtonElement;
  send.type = "submit";
  row.append(input, send);
  form.append(label, row);

  // role="status" makes screen readers announce the answer when it appears.
  const answer = el("div", "answer");
  answer.setAttribute("role", "status");
  answer.hidden = true;

  function showAnswer(text: string, quote = ""): void {
    answer.hidden = false;
    answer.replaceChildren(el("div", "answer-who", "Nudi says"));
    if (quote) answer.append(el("blockquote", "answer-quote", quote));
    answer.append(el("div", "", text));
    answer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /** "Explain this with Nudi": explain words the user selected on the page. */
  async function explain(text: string, pageTitle: string): Promise<void> {
    const clean = redactText(text.trim()).slice(0, 500);
    if (!clean) return;
    const quote = clean.length > 120 ? `${clean.slice(0, 120)}…` : clean;
    showAnswer("Let me explain…", quote);
    try {
      const result = await askBackground<ExplainResponse>({ type: "explain", text: clean, pageTitle });
      showAnswer(result.explanation, quote);
      speak(result.explanation);
    } catch {
      showAnswer("Sorry, I cannot explain right now. Is the Nudi helper server running?", quote);
    }
  }

  async function ask(question: string): Promise<void> {
    const clean = redactText(question.trim());
    if (!clean) return;
    input.value = clean;
    showAnswer("Let me check…");
    try {
      const result = await askBackground<AskResponse>({ type: "ask", question: clean, page });
      showAnswer(result.answer);
      speak(result.answer);
    } catch {
      showAnswer("Sorry, I cannot answer right now. Is the Nudi helper server running?");
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

  const tip = el("p", "ask-tip", "Tip: select confusing words on the page, right-click, and choose \"Explain this with Nudi\".");
  wrapper.append(chips, form, answer, tip);
  return { element: wrapper, ask, explain };
}
