// The "Family" section of the side panel.
//   not connected -> "Connect family" button
//   waiting       -> shows the 6-digit code to give to the family member
//   request       -> "Sushant wants to connect. Allow?"  [Allow] [Don't allow]
//   paired        -> "Sharing with family: ON", a pause switch, and exactly what is shared
// The elder must tap Allow: nothing is shared before that.

import type { FamilyState } from "../types";
import { askBackground } from "./messages";
import { buildFold } from "./panelParts";
import { el } from "./ui";
import { speak } from "./voice";

const CHECK_EVERY_MS = 3000;

// What Family Link shares, word for word. Shown to the elder before and after pairing.
const SHARED = [
  "When you start a task with Nudi",
  "When Nudi warns you about a scam",
  "When Nudi removes a sneaky extra, and how much you saved",
  "When you ask for help with a payment (website name and amount)",
  "Whether a payment was made or stopped",
];
const NEVER_SHARED = "Never shared: the pages you visit, what you type, passwords, OTPs or card numbers.";

function sharedList(): HTMLElement {
  const details = el("details", "shared-details");
  details.append(el("summary", "", "What does my family see?"));
  const list = el("ul", "");
  SHARED.forEach((item) => list.append(el("li", "", item)));
  details.append(list, el("p", "never-shared", NEVER_SHARED));
  return details;
}

/** Build the section. onChange is called when pairing state changes (to redraw the header badge). */
export function buildFamilySection(onChange: (state: FamilyState) => void): HTMLElement {
  // A folded section titled "Family"; the right side shows the status at a glance.
  const { fold, body } = buildFold("Family", false);
  fold.classList.add("family");
  const statusTag = el("span", "fold-extra");
  fold.querySelector("summary")!.append(statusTag);
  let timer: number | undefined;
  let lastStatus = "";

  async function call(request: Parameters<typeof askBackground>[0]): Promise<void> {
    try {
      const state = await askBackground<FamilyState>(request);
      draw(state);
    } catch {
      body.replaceChildren(el("p", "muted", "The Nudi helper server is not reachable right now."));
    }
  }

  function draw(state: FamilyState): void {
    window.clearTimeout(timer);
    statusTag.textContent =
      state.status === "paired" ? (state.sharingOn ? "Sharing ON" : "Paused")
      : state.status === "none" ? "Not connected" : "Connecting…";
    // Open by itself when the elder must act (show the code, or Allow / Don't allow).
    if (state.status === "waiting" || state.status === "request") fold.open = true;

    if (state.status === "none") {
      const nameLabel = el("label", "ask-label", "Your name (your family will see this)");
      const nameInput = el("input", "ask-input") as HTMLInputElement;
      nameInput.id = "nudi-elder-name";
      nameInput.value = state.elderName;
      nameLabel.setAttribute("for", nameInput.id);
      const connect = el("button", "btn secondary", "Connect family");
      connect.onclick = () => call({ type: "family:start", elderName: nameInput.value.trim() || "Ajji" });
      body.replaceChildren(
        el("p", "", "Let a family member help you check payments from their phone."),
        nameLabel,
        nameInput,
        connect,
        sharedList(),
      );
    } else if (state.status === "waiting") {
      const code = el("div", "pair-code", (state.pairCode ?? "").split("").join(" "));
      code.setAttribute("aria-label", `Code ${state.pairCode}`);
      const cancel = el("button", "link-btn", "Cancel");
      cancel.onclick = () => call({ type: "family:disconnect" });
      body.replaceChildren(
        el("p", "", "Ask your family member to open the Nudi family page and type this code:"),
        code,
        el("p", "muted", "The code works for 10 minutes."),
        cancel,
      );
    } else if (state.status === "request") {
      const who = state.familyName ?? "Someone";
      const allow = el("button", "btn primary", "Allow");
      const deny = el("button", "btn secondary", "Don't allow");
      allow.onclick = () => call({ type: "family:answer", allow: true });
      deny.onclick = () => call({ type: "family:answer", allow: false });
      const buttons = el("div", "controls-row");
      buttons.append(allow, deny);
      body.replaceChildren(el("p", "request-text", `${who} wants to connect. Allow?`), sharedList(), buttons);
      if (lastStatus !== "request") speak(`${who} wants to connect. Do you want to allow it?`);
    } else {
      const toggle = el("button", "toggle");
      toggle.append(el("span", "track"), el("span", "", "Share with family"));
      toggle.setAttribute("aria-pressed", String(state.sharingOn));
      toggle.onclick = () => call({ type: "family:sharing", on: !state.sharingOn });
      const disconnect = el("button", "link-btn", "Disconnect family");
      disconnect.onclick = () => call({ type: "family:disconnect" });
      const status = state.sharingOn
        ? `Connected to ${state.familyName}. ${state.familyName} can help you with payments.`
        : `Sharing is paused. ${state.familyName} sees nothing new until you turn it back on.`;
      body.replaceChildren(el("p", "", status), toggle, sharedList(), disconnect);
    }

    lastStatus = state.status;
    onChange(state);
    // While waiting for the family member, check every few seconds.
    if (state.status === "waiting" || state.status === "request") {
      timer = window.setTimeout(() => call({ type: "family:state" }), CHECK_EVERY_MS);
    }
  }

  call({ type: "family:state" });
  return fold;
}
