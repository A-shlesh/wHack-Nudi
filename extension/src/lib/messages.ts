// Small helper so the content script and popup can talk to the background
// worker with one simple, typed function call.

import type { BackgroundReply, BackgroundRequest } from "../types";

export async function askBackground<T>(request: BackgroundRequest): Promise<T> {
  const reply: BackgroundReply<T> = await chrome.runtime.sendMessage(request);
  if (!reply || !reply.ok) {
    throw new Error(reply?.error || "No reply from Nudi background worker");
  }
  return reply.data as T;
}
