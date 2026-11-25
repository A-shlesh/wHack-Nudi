// Remembers Nudi's answer for a page for 10 minutes, so going back to a page
// (or switching back to a tab) shows it at once, with no waiting and no new AI call.
//
// Stored in chrome.storage.session: it stays on this computer, survives
// closing and reopening the side panel, and is wiped when Chrome closes.
//
// The key is the page address plus its buttons and links (id + label). Nudi
// numbers buttons in page order, so the same key means the saved choices still
// point at the right buttons. Page TEXT is not in the key, because ticking
// timers ("offer ends in 04:59") would make every visit look new.

import type { PageSnapshot, SimplifyResponse, TrustResult } from "../types";

const KEY = "nudiPageCache";
const KEEP_MS = 10 * 60 * 1000;
const MAX_PAGES = 30;

interface Entry {
  at: number;
  result: SimplifyResponse;
  trust: TrustResult | null;
}

type Cache = Record<string, Entry>;

export function pageKey(page: PageSnapshot): string {
  return `${page.url}|${page.title}|${page.elements.map((e) => `${e.id}:${e.kind}:${e.label}`).join("|")}`;
}

async function load(): Promise<Cache> {
  const stored = await chrome.storage.session.get(KEY).catch(() => ({}) as Record<string, unknown>);
  return (stored[KEY] as Cache | undefined) ?? {};
}

export async function getCachedPage(key: string): Promise<Entry | null> {
  const entry = (await load())[key];
  return entry && Date.now() - entry.at < KEEP_MS ? entry : null;
}

export async function cachePage(key: string, result: SimplifyResponse, trust: TrustResult | null): Promise<void> {
  const cache = await load();
  cache[key] = { at: Date.now(), result, trust };
  // Keep only fresh entries, newest first, at most MAX_PAGES.
  const kept = Object.entries(cache)
    .filter(([, e]) => Date.now() - e.at < KEEP_MS)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, MAX_PAGES);
  await chrome.storage.session.set({ [KEY]: Object.fromEntries(kept) }).catch(() => {});
}
