// Privacy filter. Runs in the browser BEFORE anything is sent to the backend.
// It decides which form fields are private (passwords, OTPs, card and bank
// details) so we never read their labels or values, and it blanks out
// private-looking numbers in the page text.

// Words that show a field is private. We check the field's name, id,
// placeholder, autocomplete and label.
const PRIVATE_FIELD_WORDS = [
  "password", "passwd", "pwd", "otp", "one-time", "pin", "cvv", "cvc",
  "card", "cc-", "expiry", "iban", "ifsc", "account", "acct", "routing",
  "upi", "aadhaar", "pan", "ssn",
];

/** True if this form field may hold a password, OTP, card or bank detail. */
export function isPrivateField(element: Element): boolean {
  if (element instanceof HTMLInputElement && element.type === "password") {
    return true;
  }
  const hints = [
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("placeholder"),
    element.getAttribute("autocomplete"),
    element.getAttribute("aria-label"),
  ]
    .join(" ")
    .toLowerCase();
  return PRIVATE_FIELD_WORDS.some((word) => hints.includes(word));
}

// Same idea as backend/app/privacy.py: find private numbers in free text.
const PRIVATE_TEXT_PATTERNS: RegExp[] = [
  /\b(?:\d[ -]?){13,19}\b/g, // card numbers
  /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, // IFSC codes
  /\b\d{9,}\b/g, // bank account / Aadhaar-like numbers
  /\b(?:otp|cvv|pin|password)\s*[:=-]?\s*\S+/gi, // "OTP: 123456"
];

/** Replace private-looking numbers with [hidden]. */
export function redactText(text: string): string {
  let result = text;
  for (const pattern of PRIVATE_TEXT_PATTERNS) {
    result = result.replace(pattern, "[hidden]");
  }
  return result;
}
