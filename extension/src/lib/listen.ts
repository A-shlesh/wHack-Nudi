// Listens to the user's voice ONE time and returns the words as text.
// Uses the browser's built-in speech recognition (Chrome). The microphone
// is only used while the "Talk" button is active.

// Chrome's speech recognition has no TypeScript types built in, so we
// describe the few parts we use.
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
type RecognitionClass = new () => Recognition;

function getRecognitionClass(): RecognitionClass | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function canListen(): boolean {
  return getRecognitionClass() !== undefined;
}

let active: Recognition | null = null;

/**
 * Start listening. Calls onText with what the user said, then onDone when
 * listening stops (after speech, silence, an error, or stopListening()).
 */
export function listenOnce(
  onText: (text: string) => void,
  onDone: () => void,
  onBlocked: () => void = () => {}, // the microphone was not allowed
): void {
  const RecognitionClass = getRecognitionClass();
  if (!RecognitionClass) {
    onDone();
    return;
  }
  stopListening();
  const recognition = new RecognitionClass();
  recognition.lang = "en-IN"; // English as spoken in India
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => onText(event.results[0][0].transcript);
  recognition.onerror = (event) => {
    console.warn("Nudi voice:", event.error);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") onBlocked();
  };
  recognition.onend = () => {
    active = null;
    onDone();
  };
  active = recognition;
  recognition.start();
}

export function stopListening(): void {
  active?.stop();
  active = null;
}
