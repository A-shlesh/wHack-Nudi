// Nudi's logo and small line icons (24x24 SVG).
// They are fixed strings written here, never page text, so it is safe to
// put them into innerHTML.

const PATHS = {
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  hide: '<path d="m9 18 6-6-6-6"/>',
  speaker: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  minus: '<path d="M5 12h14"/>',
};

export type IconName = keyof typeof PATHS;

/** SVG markup for one icon. Colour follows the text colour around it. */
export function icon(name: IconName, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

/**
 * Nudi's logo: a speech bubble with "ನು" (the first letter of ನುಡಿ, "speak").
 * bubble = bubble colour, letter = letter colour.
 */
export function logo(size = 40, bubble = "#ffffff", letter = "#0f5257"): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M9 3h22a7 7 0 0 1 7 7v13a7 7 0 0 1-7 7H19l-8.5 7.2a.8.8 0 0 1-1.3-.6V30H9a7 7 0 0 1-7-7V10a7 7 0 0 1 7-7z" fill="${bubble}"/>
    <text x="20" y="22.5" text-anchor="middle" dominant-baseline="middle" font-size="17" font-weight="700"
      font-family="Nirmala UI, Noto Sans Kannada, Tunga, sans-serif" fill="${letter}">ನು</text>
  </svg>`;
}
