// Background service worker. It is the ONLY part of the extension that talks
// to the Nudi backend. Web pages and content scripts cannot always call
// http://localhost directly (browser security rules), but the extension can.

import type { BackgroundReply, BackgroundRequest } from "./types";

const BACKEND_URL = "http://localhost:8787";

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Turn binary audio into a "data:" URL that the content script can play. */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type || "audio/mpeg"};base64,${btoa(binary)}`;
}

async function handle(request: BackgroundRequest): Promise<unknown> {
  switch (request.type) {
    case "health": {
      const response = await fetch(`${BACKEND_URL}/health`);
      return response.json();
    }
    case "simplify": {
      const response = await postJson("/simplify", request.page);
      if (!response.ok) throw new Error(`Backend error ${response.status}`);
      return response.json();
    }
    case "ask": {
      const response = await postJson("/ask", { question: request.question, page: request.page });
      if (!response.ok) throw new Error(`Backend error ${response.status}`);
      return response.json();
    }
    case "speak": {
      const response = await postJson("/speak", { text: request.text });
      // 204 means "no cloud voice, use the browser voice" -> return null.
      if (response.status === 204 || !response.ok) return null;
      return blobToDataUrl(await response.blob());
    }
  }
}

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  handle(request)
    .then((data) => sendResponse({ ok: true, data } satisfies BackgroundReply<unknown>))
    .catch((error: Error) => sendResponse({ ok: false, error: error.message } satisfies BackgroundReply<unknown>));
  return true; // keeps the message channel open for the async reply
});
