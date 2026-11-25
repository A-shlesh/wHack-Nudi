// Shared data shapes. The backend ones match backend/app/schemas.py.

export interface PageElement {
  id: string;
  kind: "button" | "link" | "input" | "select";
  label: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
  elements: PageElement[];
}

export interface Action {
  element_id: string;
  label: string;
  is_payment: boolean;
}

export interface PageWarning {
  level: "info" | "caution" | "danger";
  message: string;
  source?: "rules" | "ai"; // "ai" = an extra warning from the AI, on top of Nudi's rules
}

/** Which AI answered. "mock" = Nudi's offline rules. */
export type AiMode = "gemini" | "groq" | "bedrock" | "mock";

export interface SimplifyResponse {
  summary: string;
  actions: Action[];
  warnings: PageWarning[];
  mode: AiMode;
}

export interface AskResponse {
  answer: string;
  mode: AiMode;
}

export interface ExplainResponse {
  explanation: string;
  mode: AiMode;
}

// ---------- Domain trust check ----------

export interface TrustReason {
  code: string;
  message_simple: string;
}

export interface TrustResult {
  domain: string;
  trust_score: number; // 0 (very risky) to 100 (very safe)
  level: "safe" | "caution" | "danger";
  reasons: TrustReason[];
  domain_age_days: number | null;
  lookalike_of: string | null;
  https: boolean;
}

export interface TrustRequest {
  url: string;
  has_payment: boolean;
  has_login: boolean;
  demo_domain: string | null; // only used on localhost demo pages
  demo_age_days: number | null;
}

// ---------- Family Link ----------

export interface FamilyState {
  familyId: string | null;
  elderToken: string | null;
  elderName: string;
  familyName: string | null; // e.g. "Sushant", once paired
  status: "none" | "waiting" | "request" | "paired";
  sharingOn: boolean;
  pairCode: string | null; // the 6-digit code shown while waiting
}

export type ApprovalStatus = "pending" | "approved" | "blocked";

// ---------- Messages to the background worker ----------

export type BackgroundRequest =
  | { type: "simplify"; page: PageSnapshot }
  | { type: "ask"; question: string; page: PageSnapshot }
  | { type: "explain"; text: string; pageTitle: string }
  | { type: "trust"; request: TrustRequest }
  | { type: "speak"; text: string }
  | { type: "health" }
  | { type: "family:state" }
  | { type: "family:start"; elderName: string }
  | { type: "family:answer"; allow: boolean }
  | { type: "family:sharing"; on: boolean }
  | { type: "family:disconnect" }
  | { type: "family:event"; event: FamilyEvent }
  | { type: "family:ask-approval"; site: string; amount: string | null; reasons: string[]; ageDays: number | null }
  | { type: "family:approval-status"; approvalId: string };

/** The ONLY kinds of things Nudi may share with family. No pages, no typing, no history. */
export type FamilyEvent =
  | { kind: "task_started" }
  | { kind: "warning_shown"; level: "caution" | "danger" }
  | { kind: "addon_removed"; amount_saved: number }
  | { kind: "payment_confirmed"; amount: number | null }
  | { kind: "payment_blocked"; amount: number | null };

// Every reply from the background worker has this shape.
export interface BackgroundReply<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ---------- Messages from the side panel to the page (content script) ----------

export interface PageReadResult {
  page: PageSnapshot;
  fixes: string[]; // messages for "Remove it for me" cards, in order
  hasPayment: boolean;
  hasLogin: boolean;
  demoDomain: string | null;
  demoAgeDays: number | null;
}

/** Things the side panel can tell the page to do. */
export type TabRequest =
  | { type: "nudi:read" }
  | { type: "nudi:run"; action: Action }
  | { type: "nudi:show-me"; elementId: string; label: string }
  | { type: "nudi:fix"; index: number }
  | { type: "nudi:set-trust"; trust: TrustResult | null };
