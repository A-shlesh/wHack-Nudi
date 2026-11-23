// Turns what the user SAID into a command for the Action View.
// Examples:
//   "option two" / "second" / "2"  -> press big button 2
//   "pay the bill"                 -> press the payment button (still asks first!)
//   "read again"                   -> read the page aloud again
//   "close"                        -> close Nudi
//   anything else                  -> treated as a question for "Ask Nudi"

export type Command =
  | { type: "action"; index: number }
  | { type: "pay" }
  | { type: "read" }
  | { type: "close" }
  | { type: "ask"; text: string };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, first: 1, "1": 1,
  two: 2, second: 2, "2": 2, to: 2, too: 2,
  three: 3, third: 3, "3": 3,
  four: 4, fourth: 4, "4": 4, for: 4,
  five: 5, fifth: 5, "5": 5,
};

// Starting words that show the user is asking, not commanding.
const QUESTION_START = /^(how|what|when|where|why|who|which|is|are|can|should|do|does|will)\b/;

export function parseCommand(spoken: string, actionCount: number): Command {
  const text = spoken.toLowerCase().trim().replace(/[.!?]+$/, "");

  if (/\b(read|repeat|again)\b/.test(text)) return { type: "read" };
  if (/^(close|stop|exit|bye|goodbye)\b/.test(text)) return { type: "close" };
  if (QUESTION_START.test(text)) return { type: "ask", text: spoken };

  // "option two", "number 3", or just "two".
  const words = text.split(/\s+/);
  const isShort = words.length <= 3;
  for (const word of words) {
    const number = NUMBER_WORDS[word];
    // Small words like "to" and "for" only count in very short phrases.
    if (number && number <= actionCount && (isShort || /^\d$/.test(word))) {
      return { type: "action", index: number - 1 };
    }
  }

  if (/\b(pay|payment|buy|checkout)\b/.test(text)) return { type: "pay" };
  return { type: "ask", text: spoken };
}
