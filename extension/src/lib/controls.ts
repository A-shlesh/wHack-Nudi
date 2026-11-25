// The bottom of the Nudi panel: "Read aloud" and "Talk" buttons, the
// text-size switch, the voice on/off switch, and the privacy promise.

import { listenOnce, canListen } from "./listen";
import { getSettings, saveSettings, TEXT_SCALES, TEXT_SIZE_NAMES } from "./settings";
import { el, iconButton, iconSpan } from "./ui";
import { speakAlways, stopSpeaking, watchSpeaking } from "./voice";

export interface ControlsOptions {
  app: HTMLElement; // the panel's root box, where the text size is applied
  readText: () => string; // what "Read aloud" should say
  onHeard: (said: string) => void; // what to do with words the user spoke
}

/** Make all text in Nudi bigger or smaller. */
export function applyTextSize(app: HTMLElement): void {
  app.style.setProperty("--scale", String(TEXT_SCALES[getSettings().textSize]));
}

function setLabel(button: HTMLElement, iconHtml: HTMLElement, text: string): void {
  button.replaceChildren(iconHtml, el("span", "", text));
}

export function buildControls(options: ControlsOptions): HTMLElement {
  const controls = el("footer", "controls");

  // --- Read aloud / Stop reading ---
  const read = iconButton("btn primary", "speaker", "Read aloud");
  let speaking = false;
  watchSpeaking((isSpeaking) => {
    speaking = isSpeaking;
    setLabel(read, iconSpan(isSpeaking ? "stop" : "speaker"), isSpeaking ? "Stop reading" : "Read aloud");
  });
  read.onclick = () => (speaking ? stopSpeaking() : speakAlways(options.readText()));

  // --- Talk (voice commands and questions) ---
  const talk = iconButton("btn secondary", "mic", "Talk to Nudi");
  talk.onclick = () => {
    if (!canListen()) {
      speakAlways("Sorry, talking to me does not work in this browser.");
      return;
    }
    stopSpeaking();
    talk.classList.add("listening");
    setLabel(talk, iconSpan("mic"), "Listening…");
    listenOnce(
      options.onHeard,
      () => {
        talk.classList.remove("listening");
        setLabel(talk, iconSpan("mic"), "Talk to Nudi");
      },
      () => {
        // Chrome cannot ask for the microphone inside the side panel, so we open
        // a small Nudi page in a tab that asks once. After that, Talk works here.
        speakAlways("Please allow the microphone in the new tab, then come back and tap Talk again.");
        chrome.tabs.create({ url: chrome.runtime.getURL("mic-permission.html") });
      },
    );
  };

  const mainRow = el("div", "controls-row");
  mainRow.append(read, talk);

  // --- Text size: three buttons, the chosen one is dark ---
  const sizeGroup = el("div", "");
  sizeGroup.append(el("span", "setting-label", "Text size"));
  const segmented = el("div", "segmented");
  segmented.setAttribute("role", "group");
  segmented.setAttribute("aria-label", "Text size");
  TEXT_SIZE_NAMES.forEach((name, size) => {
    const button = el("button", "", "A");
    button.style.fontSize = `${15 + size * 4}px`;
    button.setAttribute("aria-label", name);
    button.title = name;
    button.setAttribute("aria-pressed", String(getSettings().textSize === size));
    button.onclick = async () => {
      await saveSettings({ textSize: size as 0 | 1 | 2 });
      applyTextSize(options.app);
      segmented.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === size)));
    };
    segmented.append(button);
  });
  sizeGroup.append(segmented);

  // --- Voice on/off switch ---
  const voiceToggle = el("button", "toggle");
  voiceToggle.append(el("span", "track"), el("span", "", "Voice"));
  voiceToggle.setAttribute("aria-pressed", String(getSettings().readAloud === true));
  voiceToggle.title = "Read things aloud automatically";
  voiceToggle.onclick = async () => {
    const settings = await saveSettings({ readAloud: getSettings().readAloud !== true });
    voiceToggle.setAttribute("aria-pressed", String(settings.readAloud));
    if (!settings.readAloud) stopSpeaking();
  };

  const settingsRow = el("div", "settings-row");
  settingsRow.append(sizeGroup, voiceToggle);

  const privacy = el("div", "privacy-line");
  privacy.append(iconSpan("shield", 18), el("span", "", "Nudi never reads passwords, OTPs or card numbers."));

  controls.append(mainRow, settingsRow, privacy);
  return controls;
}
