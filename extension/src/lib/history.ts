// Two small lists Nudi keeps ON THIS COMPUTER ONLY (chrome.storage.local).
// Nothing here is sent anywhere.
//
//   History        "What Nudi stopped": each scam website seen, each payment
//                  stopped, each "pay anyway", with the reasons and a risk level,
//                  so the person can see WHY Nudi acted and undo a mistake.
//   Trusted sites  websites marked "this website is fine" (by family, or by the
//                  person themself on a "Be careful" website). Nudi stops warning there.

import type { TrustResult } from "../types";

// ---------- History ----------

export interface HistoryItem {
  at: number; // time in ms
  site: string; // domain only
  what: "scam_site" | "stopped" | "family_no" | "paid_anyway";
  risk: "danger" | "caution";
  amount: string | null;
  reasons: string[];
}

const HISTORY_KEY = "nudiHistory";
const MAX_ITEMS = 30;
const DAY_MS = 24 * 3600 * 1000;

export async function getHistory(): Promise<HistoryItem[]> {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  return (stored[HISTORY_KEY] as HistoryItem[] | undefined) ?? [];
}

/** Add one item (newest first). The same scam website is listed once a day, not on every page. */
export async function addHistory(item: Omit<HistoryItem, "at">): Promise<void> {
  const items = await getHistory();
  const repeat = items.some((old) => old.what === item.what && old.site === item.site && Date.now() - old.at < DAY_MS);
  if (item.what === "scam_site" && repeat) return;
  const reasons = item.reasons.slice(0, 4).map((r) => r.slice(0, 200));
  await chrome.storage.local.set({ [HISTORY_KEY]: [{ ...item, reasons, at: Date.now() }, ...items].slice(0, MAX_ITEMS) });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove(HISTORY_KEY);
}

// ---------- Trusted sites ----------

export interface TrustedSite {
  by: string; // who said it is fine: the family member's name, or "you"
  at: number;
}

const TRUSTED_KEY = "nudiTrustedSites";

export async function getTrusted(): Promise<Record<string, TrustedSite>> {
  const stored = await chrome.storage.local.get(TRUSTED_KEY);
  return (stored[TRUSTED_KEY] as Record<string, TrustedSite> | undefined) ?? {};
}

export async function trustSite(site: string, by: string): Promise<void> {
  const trusted = await getTrusted();
  await chrome.storage.local.set({ [TRUSTED_KEY]: { ...trusted, [site]: { by, at: Date.now() } } });
}

export async function untrustSite(site: string): Promise<void> {
  const trusted = await getTrusted();
  delete trusted[site];
  await chrome.storage.local.set({ [TRUSTED_KEY]: trusted });
}

/**
 * A website someone marked as fine is shown as safe, with the reason saying who
 * checked it. The original reasons stay listed under "Why?", so nothing is hidden.
 */
export function applyTrusted(trust: TrustResult | null, trusted: Record<string, TrustedSite>): TrustResult | null {
  const mark = trust ? trusted[trust.domain] : undefined;
  if (!trust || !mark || trust.level === "safe") return trust;
  // Marked fine by the person alone only counts for "Be careful". A scam-level
  // website needs a family member (a caller can talk someone into tapping a button).
  if (mark.by === "you" && trust.level === "danger") return trust;
  const who = mark.by === "you" ? "You" : mark.by;
  return {
    ...trust,
    level: "safe",
    reasons: [{ code: "MARKED_FINE", message_simple: `${who} checked this website and said it is fine.` }, ...trust.reasons],
  };
}

/** Requests to family ("is this website fine?") still waiting for an answer: site -> request id. */
const PENDING_KEY = "nudiSiteRequests";

export async function getPendingSiteRequest(site: string): Promise<string | null> {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  return (stored[PENDING_KEY] as Record<string, string> | undefined)?.[site] ?? null;
}

export async function setPendingSiteRequest(site: string, requestId: string | null): Promise<void> {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  const pending = { ...((stored[PENDING_KEY] as Record<string, string> | undefined) ?? {}) };
  if (requestId) pending[site] = requestId;
  else delete pending[site];
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
}
