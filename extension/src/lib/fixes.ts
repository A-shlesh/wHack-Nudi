// "Fix it for me": finds sneaky extras that a website ticked for you
// (protection plans, insurance, donations, tips) and lets the user untick
// them with one tap. Everything happens in the browser; nothing is sent.

import { isPrivateField, redactText } from "./sanitize";

// Whole words that usually mean "an extra you did not ask for".
const EXTRA_WORDS = /\b(protection|insurance|warranty|donation|donate|tip|add-?on|priority|express|extended)\b/i;

export interface Fix {
  message: string; // what we tell the user
  apply: () => void; // what happens when they tap "Fix it for me"
}

/** The text written next to a checkbox. */
function checkboxText(box: HTMLInputElement): string {
  const text = box.labels?.[0]?.textContent || box.parentElement?.textContent || "";
  return redactText(text.replace(/\s+/g, " ").trim()).slice(0, 80);
}

export function findFixes(): Fix[] {
  const fixes: Fix[] = [];
  const ticked = document.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked");

  for (const box of Array.from(ticked)) {
    if (box.closest("#nudi-root") || isPrivateField(box)) continue;
    const text = checkboxText(box);
    if (!EXTRA_WORDS.test(text)) continue;

    fixes.push({
      message: `This extra was already ticked for you: "${text}"`,
      // .click() (not .checked = false) so the website notices and updates its total.
      apply: () => {
        if (box.checked) box.click();
      },
    });
  }
  return fixes;
}
