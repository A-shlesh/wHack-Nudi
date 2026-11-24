// The user's Nudi preferences, remembered in Chrome's storage so they stay
// the same on every website and after a restart.
//   textSize: 0 = large, 1 = larger, 2 = largest
//   voiceOn:  read things aloud automatically

export interface Settings {
  textSize: 0 | 1 | 2;
  voiceOn: boolean;
}

const DEFAULTS: Settings = { textSize: 0, voiceOn: true };

// How much bigger each text size makes everything.
export const TEXT_SCALES = [1, 1.15, 1.3];
export const TEXT_SIZE_NAMES = ["Large", "Larger", "Largest"];

// A copy kept in memory so other files can read it instantly.
let current: Settings = { ...DEFAULTS };

export function getSettings(): Settings {
  return current;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get("nudiSettings");
    current = { ...DEFAULTS, ...(stored.nudiSettings as Partial<Settings> | undefined) };
  } catch {
    current = { ...DEFAULTS }; // storage not available: use defaults
  }
  return current;
}

export async function saveSettings(changes: Partial<Settings>): Promise<Settings> {
  current = { ...current, ...changes };
  try {
    await chrome.storage.local.set({ nudiSettings: current });
  } catch {
    /* still works for this page, just not remembered */
  }
  return current;
}
