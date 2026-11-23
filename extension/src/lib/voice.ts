// Reads text aloud. First tries the natural ElevenLabs voice (through the
// backend). If that is not set up, or fails, it uses the browser's own
// built-in voice (speechSynthesis), so narration always works.

import { askBackground } from "./messages";

let currentAudio: HTMLAudioElement | null = null;

export function stopSpeaking(): void {
  currentAudio?.pause();
  currentAudio = null;
  speechSynthesis.cancel();
}

function speakWithBrowser(text: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85; // a little slower than normal, easier to follow
  speechSynthesis.speak(utterance);
}

export async function speak(text: string): Promise<void> {
  stopSpeaking();
  try {
    const audioUrl = await askBackground<string | null>({ type: "speak", text });
    if (audioUrl) {
      currentAudio = new Audio(audioUrl);
      await currentAudio.play();
      return;
    }
  } catch {
    // Backend off, or the page blocked the audio: fall through to the browser voice.
  }
  speakWithBrowser(text);
}
