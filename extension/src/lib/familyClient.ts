// Family Link, extension side (runs in the background worker).
// Keeps the pairing state in Chrome's storage and talks to the backend.
//
// Privacy: the ONLY things ever sent are the small events in FamilyEvent
// (types.ts) and requests to family: "may I pay?" (site name, amount) and
// "is this website fine?" (site name). The backend writes the reasons itself.
// Never page text, never what was typed, never browsing history.
// If sharing is paused, events are not sent at all.

import type { ApprovalStatus, BackgroundRequest, FamilyEvent, FamilyState } from "../types";
import { getJson, postForJson } from "./api";

const STORAGE_KEY = "nudiFamily";
const DEFAULT_STATE: FamilyState = {
  familyId: null,
  elderToken: null,
  elderName: "Ajji",
  familyName: null,
  status: "none",
  sharingOn: true,
  pairCode: null,
};

async function load(): Promise<FamilyState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_STATE, ...(stored[STORAGE_KEY] as Partial<FamilyState> | undefined) };
}

async function save(state: FamilyState): Promise<FamilyState> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  return state;
}

/** Ask the backend whether someone has entered our code yet. */
async function refresh(state: FamilyState): Promise<FamilyState> {
  if (!state.elderToken || state.status === "none") return state;
  try {
    const reply = await getJson<{ status: string; family_name: string | null; sharing_on: boolean }>(
      "/family/pair/status",
      state.elderToken,
    );
    if (reply.status === "expired" || reply.status === "rejected" || reply.status === "unpaired") return save({ ...DEFAULT_STATE, elderName: state.elderName });
    return save({
      ...state,
      status: reply.status as FamilyState["status"],
      familyName: reply.family_name,
      sharingOn: reply.sharing_on,
      pairCode: reply.status === "paired" ? null : state.pairCode,
    });
  } catch {
    return state; // backend offline: keep what we know
  }
}

function canShare(state: FamilyState): boolean {
  return state.status === "paired" && state.sharingOn && state.elderToken !== null;
}

/** Copy ONLY the allowed fields of an event, nothing else. */
function eventBody(event: FamilyEvent): Record<string, unknown> {
  const body: Record<string, unknown> = { kind: event.kind };
  if ("level" in event) body.level = event.level;
  if ("amount" in event) body.amount = event.amount;
  if ("amount_saved" in event) body.amount_saved = event.amount_saved;
  return body;
}

export async function handleFamily(request: BackgroundRequest): Promise<unknown> {
  const state = await load();

  switch (request.type) {
    case "family:state":
      return refresh(state);

    case "family:start": {
      const reply = await postForJson<{ family_id: string; code: string; elder_token: string }>(
        "/family/pair/start",
        { elder_name: request.elderName },
      );
      return save({
        ...DEFAULT_STATE,
        elderName: request.elderName,
        familyId: reply.family_id,
        elderToken: reply.elder_token,
        pairCode: reply.code,
        status: "waiting",
      });
    }

    case "family:answer": {
      await postForJson("/family/pair/answer", { allow: request.allow }, state.elderToken ?? "");
      return refresh(state);
    }

    case "family:sharing": {
      await postForJson("/family/sharing", { on: request.on }, state.elderToken ?? "");
      return save({ ...state, sharingOn: request.on });
    }

    case "family:disconnect":
      // Tell the backend first, so the family member's access really ends.
      if (state.elderToken) await postForJson("/family/unpair", {}, state.elderToken).catch(() => {});
      return save({ ...DEFAULT_STATE, elderName: state.elderName });

    case "family:event":
      if (!canShare(state)) return { stored: false };
      return postForJson("/events", eventBody(request.event), state.elderToken!).catch(() => ({ stored: false }));

    case "family:ask-approval": {
      if (state.status !== "paired" || !state.sharingOn) throw new Error("Family is not connected");
      return postForJson<{ approval_id: string }>(
        "/approvals",
        // The backend writes the reasons itself from the site and its age.
        { kind: request.kind, site: request.site, amount: request.amount, age_days: request.ageDays },
        state.elderToken!,
      );
    }

    case "family:approval-status": {
      const reply = await getJson<{ status: ApprovalStatus }>(`/approvals/${request.approvalId}`, state.elderToken ?? "");
      return reply.status;
    }
  }
  return null;
}
