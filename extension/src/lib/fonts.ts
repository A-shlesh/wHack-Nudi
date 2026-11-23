// Loads the Atkinson Hyperlegible font (shipped inside the extension) so
// Nudi's text is easy to read for people with low vision.
// We load the font file ourselves and hand it to the page's font list, so
// the website's own security rules cannot block it. If anything fails,
// Nudi simply uses the computer's normal font.

export const FONT_FAMILY = "NudiAtkinson";

let started = false;

export function loadNudiFont(): void {
  if (started) return;
  started = true;

  for (const weight of ["400", "700"]) {
    const url = chrome.runtime.getURL(`fonts/atkinson-${weight}.woff2`);
    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => new FontFace(FONT_FAMILY, data, { weight }).load())
      // document.fonts works like a Set of fonts; TypeScript's types miss .add().
      .then((font) => (document.fonts as unknown as Set<FontFace>).add(font))
      .catch(() => {
        /* keep the fallback font */
      });
  }
}
