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

/** Replace private-looking data with [hidden]. */
export function redactText(text: string): string {
  let result = text;
  for (const pattern of PRIVATE_TEXT_PATTERNS) {
    result = result.replace(pattern, "[hidden]");
  }
  return result;
}
