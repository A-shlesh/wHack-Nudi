// Reads text aloud. First tries the natural ElevenLabs voice (through the
// backend). If that is not set up, or fails, it uses the browser's own
// built-in voice (speechSynthesis), so narration always works.
// Follows the user's setting: read aloud on/off. Speaks at normal speed.
// Only ONE Nudi voice talks at a time: the side panel and the web page each
// have a voice, and when one starts it tells the other to stop.

import { askBackground } from "./messages";
import { getSettings } from "./settings";

let currentAudio: HTMLAudioElement | null = null;
// Goes up by one every time we start or stop speaking. A slow, older request
// that finishes late sees the number has changed and stays quiet.
let speechTurn = 0;

// Lets the panel show "Stop reading" while Nudi is talking.
let onSpeakingChange: (speaking: boolean) => void = () => {};
export function watchSpeaking(listener: (speaking: boolean) => void): void {
  onSpeakingChange = listener;
}

export function stopSpeaking(): void {
  speechTurn++;
  currentAudio?.pause();
  currentAudio = null;
  speechSynthesis.cancel();
  onSpeakingChange(false);
}

// ---------- One voice at a time ----------

// A random name for this voice (one in the side panel, one in each page).
const VOICE_ID = Math.random().toString(36).slice(2);
// When this voice last started talking. A "be quiet" message sent BEFORE that
// (it can arrive late) must not cut off the newer sentence.
let startedAt = 0;

/** Tell the other Nudi voices "be quiet now" (because this one starts, or the person clicked). */
function claimTheVoice(): void {
  try {
    chrome.runtime.sendMessage({ type: "voice:claim", id: VOICE_ID, at: Date.now() }).catch(() => {});
  } catch {
    /* the extension was reloaded: nothing to tell */
  }
}

// When another Nudi voice starts talking (or the person clicked there), this one stops.
chrome.runtime.onMessage.addListener((message: { type?: string; id?: string; at?: number }) => {
  if (message?.type === "voice:claim" && message.id !== VOICE_ID && (message.at ?? Date.now()) >= startedAt) {
    stopSpeaking();
  }
  return false;
});

// The person clicked a button or link: they are busy doing something, so all
// Nudi voices stop. The button can then say its own short reply ("Okay…").
// The Read aloud / Stop reading button is marked data-voice-control and
// handles itself, so it can still turn reading on and off.
document.addEventListener(
  "click",
  (event) => {
    const target = event.target as Element | null;
    const pressed = target?.closest?.("button, a, [role=button], input[type=submit], input[type=button], summary");
    if (!pressed || pressed.closest("[data-voice-control]")) return;
    stopSpeaking();
    claimTheVoice();
  },
  true, // "capture": runs before the button's own action, which may start a new sentence
);

// Clearest voices first. Chrome's "Google" voices sound the most natural (they
// need internet); the Microsoft ones work offline. "Microsoft Heera" (Indian
// English) sounds slow and robotic, so it is only used if nothing else exists.
const PREFERRED_VOICES = [
  "Google UK English Female",
  "Google US English",
  "Google UK English Male",
  "Microsoft Zira",
  "Microsoft Mark",
  "Microsoft David",
  "Microsoft Ravi",
];

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  for (const name of PREFERRED_VOICES) {
    const voice = voices.find((v) => v.name.startsWith(name));
    if (voice) return voice;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? null;
}

// Chrome loads its voice list a moment after the page starts; ask early.
speechSynthesis.getVoices();

function speakWithBrowser(text: string): void {
  const voice = pickVoice();
  // Say "₹1,339" as "1,339 rupees": many voices cannot read the ₹ sign.
  const spoken = text.replace(/₹\s?(\d[\d,]*(\.\d+)?)/g, "$1 rupees");
  // One sentence at a time: Chrome's Google voices can stop in the middle of long text.
  const sentences = spoken.match(/[^.!?]+[.!?]*/g) ?? [spoken];
  sentences.forEach((sentence, index) => {
    const utterance = new SpeechSynthesisUtterance(sentence.trim());
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-IN";
    // Normal speed. Heera sounds slow, so she gets a small push if she is the only voice.
    utterance.rate = voice?.name.includes("Heera") ? 1.15 : 1;
    if (index === sentences.length - 1) utterance.onend = () => onSpeakingChange(false);
    speechSynthesis.speak(utterance);
  });
}

/** Speak only if the user has the voice turned on. */
export async function speak(text: string): Promise<void> {
  if (getSettings().readAloud !== true) return; // off, or not asked yet
  await speakAlways(text);
}

/** Speak even if automatic voice is off (used by the "Read aloud" button). */
export async function speakAlways(text: string): Promise<void> {
  stopSpeaking();
  claimTheVoice();
  startedAt = Date.now();
  const myTurn = speechTurn;
  onSpeakingChange(true);
  try {
    const audioUrl = await askBackground<string | null>({ type: "speak", text });
    if (myTurn !== speechTurn) return; // something newer started, or the view was closed
    if (audioUrl) {
      currentAudio = new Audio(audioUrl);
      currentAudio.onended = () => onSpeakingChange(false);
      await currentAudio.play();
      return;
    }
  } catch {
    // Backend off, or the page blocked the audio: fall through to the browser voice.
  }
  if (myTurn === speechTurn) speakWithBrowser(text);
}
