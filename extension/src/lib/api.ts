// Tiny helpers for calling the Nudi backend from the background worker.
// A token (when given) proves which family member is calling.

import { BACKEND_URL } from "../config";

function headers(token?: string): Record<string, string> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

export async function postJson(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${BACKEND_URL}${path}`, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
}

/** POST and read the JSON reply. Throws if the backend says no. */
export async function postForJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await postJson(path, body, token);
  if (!response.ok) throw new Error(`Backend error ${response.status}`);
  return response.json() as Promise<T>;
}

/** GET and read the JSON reply. Throws if the backend says no. */
export async function getJson<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, { headers: headers(token) });
  if (!response.ok) throw new Error(`Backend error ${response.status}`);
  return response.json() as Promise<T>;
}
