// Shared data shapes. These match backend/app/schemas.py.

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
}

export interface SimplifyResponse {
  summary: string;
  actions: Action[];
  warnings: PageWarning[];
  mode: "bedrock" | "mock";
}

export interface AskResponse {
  answer: string;
  mode: "bedrock" | "mock";
}

// Messages sent from the content script / popup to the background worker.
export type BackgroundRequest =
  | { type: "simplify"; page: PageSnapshot }
  | { type: "ask"; question: string; page: PageSnapshot }
  | { type: "speak"; text: string }
  | { type: "health" };

// Every reply from the background worker has this shape.
export interface BackgroundReply<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
