// Privacy filter. Runs in the browser BEFORE anything is sent to the backend.
// It decides which form fields are private (passwords, OTPs, card and bank
// details) so we never read their labels or values, and it blanks out
// private-looking data in the page text.

// Whole words that show a field is private. We look for them in the field's
// name, id, placeholder, autocomplete, aria-label and its <label> text.
const PRIVATE_FIELD_WORDS = new Set([
  "password", "passwd", "pwd", "otp", "pin", "cvv", "cvc", "card", "cc",
  "expiry", "iban", "ifsc", "account", "acct", "routing", "upi", "aadhaar",
  "aadhar", "pan", "ssn", "passcode",
]);

/** Split "cardNumber", "card_number" or "one-time-code" into lowercase words. */
function toWords(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2") // cardNumber -> card Number
    .toLowerCase()
    .split(/[^a-z0-9]+/);
}

/** True if this form field may hold a password, OTP, card or bank detail. */
export function isPrivateField(element: Element): boolean {
  if (element instanceof HTMLInputElement && element.type === "password") {
    return true;
  }
  const labelText =
    element instanceof HTMLInputElement || element instanceof HTMLSelectElement
      ? Array.from(element.labels ?? []).map((label) => label.textContent ?? "").join(" ")
      : "";
  const hints = [
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("placeholder"),
    element.getAttribute("autocomplete"),
    element.getAttribute("aria-label"),
    labelText,
  ].join(" ");

  if (hints.toLowerCase().includes("one-time-code")) return true;
  return toWords(hints).some((word) => PRIVATE_FIELD_WORDS.has(word));
}

// Same patterns as backend/app/privacy.py. Keep the two lists in sync.
const PRIVATE_TEXT_PATTERNS: RegExp[] = [
  /\b(?:\d[ -]?){13,19}\b/g, // card numbers
  /\b\d{4}[ -]\d{4}[ -]\d{4}\b/g, // Aadhaar written as 1234 5678 9012
  /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, // IFSC codes
  /\b[A-Z]{5}\d{4}[A-Z]\b/g, // PAN card numbers
  /\b\d{9,}\b/g, // bank account / Aadhaar-like numbers
  /\b(?:otp|cvv|pin|passcode)\b[^\d\n]{0,20}\d{3,8}/gi, // "Your OTP is 481516"
  /\b\d{4,8}\b(?=[^\d\n]{0,20}\b(?:otp|one[- ]time)\b)/gi, // "481516 is your OTP"
  /\bpassword\s*[:=]\s*\S+/gi, // "password: secret"
];

// Phone and helpline numbers are NOT private: they are public contact details
// on a page, and Nudi needs them to answer "what is the helpline number?".
// So we protect them from the patterns above (which would hide any 9+ digit
// run) and put them back afterwards. Keep in sync with backend/app/privacy.py.
const PHONE_NUMBER =
  // Not part of a longer number: no digit (or digit + space/dash) before it,
  // and no space/dash + digit after it.
  /(?<!\d)(?<!\d[ -])(?:(?:(?:\+91[ -]?|91 |0)?[6-9]\d{4}[ -]?\d{5})|(?:0\d{2,4}[ -]\d{6,8})|(?:1800[ -]?\d{3}[ -]?\d{4}))(?![ -]?\d)/g;

// If one of these words sits just before a number, it is an account, card or
// similar private number, not a phone number.
const PRIVATE_NUMBER_CONTEXT =
  /(?<![A-Za-z0-9])(?:account|a\/c|acct|card|aadhaar|aadhar|otp|pin|cvv|ifsc|upi|pan|password)(?![A-Za-z0-9])/i;
const CONTEXT_CHARS = 25;

/** a, b, ... z, ba, bb ... (letters only, so no pattern above can match it). */
function lettersFor(index: number): string {
  let out = "";
  let n = index;
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  } while (n > 0);
  return out;
}

/** Replace private-looking data with [hidden]. Phone numbers are kept. */
export function redactText(text: string): string {
  const phones: string[] = [];
  let result = text.replace(PHONE_NUMBER, (match: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - CONTEXT_CHARS), offset);
    if (PRIVATE_NUMBER_CONTEXT.test(before)) return match;
    phones.push(match);
    return `\u0000PHONE${lettersFor(phones.length - 1)}\u0000`;
  });
  for (const pattern of PRIVATE_TEXT_PATTERNS) {
    result = result.replace(pattern, "[hidden]");
  }
  return result.replace(/\u0000PHONE([a-z]+)\u0000/g, (whole: string, letters: string) => {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 97);
    return phones[n] ?? whole;
  });
}
