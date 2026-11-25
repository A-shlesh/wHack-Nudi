// "I think this website is fine": the way to undo a Nudi warning that is wrong.
//
//   Family Link on      the request goes to the family member, who taps
//                       "Yes, it is fine" or "No, keep warning" on their phone.
//   No Family Link      on a "Be careful" website, the person can mark it fine
//                       themself. A scam-level website needs a family member,
//                       because a caller can talk someone into tapping a button.
//
// Only the website name is sent to the family (the backend writes the reasons).

import type { ApprovalStatus, FamilyState } from "../types";
import { getPendingSiteRequest, setPendingSiteRequest, trustSite } from "./history";
import { askBackground } from "./messages";
import { el } from "./ui";
import { speak } from "./voice";

const POLL_EVERY_MS = 3000;

/**
 * site: the domain. level: how worried Nudi is. ageDays: helps the family decide.
 * onTrusted: called once the website is marked fine (to redraw the panel).
 */
export function buildSiteCheck(
  site: string,
  level: "caution" | "danger",
  ageDays: number | null,
  onTrusted: () => void,
): HTMLElement {
  const box = el("div", "site-check");
  let polling: number | undefined;

  const stopPolling = () => window.clearInterval(polling);

  function showStart(): void {
    const button = el("button", "link-btn", "I think this website is fine");
    button.onclick = showConfirm;
    box.replaceChildren(button);
  }

  async function showConfirm(): Promise<void> {
    const family = await askBackground<FamilyState>({ type: "family:state" }).catch(() => null);
    const familyReady = family?.status === "paired" && family.sharingOn;
    const familyName = family?.familyName ?? "your family";
    const cancel = el("button", "btn secondary", "Cancel");
    cancel.onclick = showStart;
    const buttons = el("div", "controls-row");

    if (familyReady) {
      const ask = el("button", "btn primary", `Ask ${familyName}`);
      ask.onclick = () => askFamily(familyName);
      buttons.append(ask, cancel);
      box.replaceChildren(el("p", "", `I will ask ${familyName} to check ${site}. I only send the website name.`), buttons);
    } else if (level === "caution") {
      const yes = el("button", "btn primary", "Yes, I trust it");
      yes.onclick = async () => {
        await trustSite(site, "you");
        speak("OK. I will not warn you about this website again.");
        onTrusted();
      };
      buttons.append(yes, cancel);
      box.replaceChildren(el("p", "", "Only do this if you have used this website before and you know it is real."), buttons);
    } else {
      box.replaceChildren(
        el("p", "", "This website looks like a scam, so only a family member can mark it as fine. Connect your family in the Family section below."),
        cancel,
      );
    }
  }

  async function askFamily(familyName: string): Promise<void> {
    try {
      const { approval_id } = await askBackground<{ approval_id: string }>({
        type: "family:ask-approval",
        kind: "site",
        site,
        amount: null,
        ageDays,
      });
      await setPendingSiteRequest(site, approval_id);
      speak(`I asked ${familyName} to check this website.`);
      waitFor(approval_id, familyName);
    } catch {
      box.replaceChildren(el("p", "", "I could not reach your family. Please try again later."));
    }
  }

  function waitFor(requestId: string, familyName: string): void {
    const waiting = el("div", "waiting small");
    waiting.setAttribute("role", "status");
    waiting.append(el("div", "spinner"), el("span", "", `Waiting for ${familyName} to check this website…`));
    box.replaceChildren(waiting);

    stopPolling();
    polling = window.setInterval(async () => {
      if (!box.isConnected) return stopPolling(); // the panel moved on to another page
      const status = await askBackground<ApprovalStatus>({ type: "family:approval-status", approvalId: requestId }).catch(
        () => "pending" as ApprovalStatus,
      );
      if (status === "pending") return;
      stopPolling();
      await setPendingSiteRequest(site, null);
      if (status === "approved") {
        await trustSite(site, familyName);
        speak(`${familyName} said this website is fine.`);
        onTrusted();
      } else {
        box.replaceChildren(el("p", "site-check-no", `${familyName} thinks this website is not safe. I will keep warning you.`));
        speak(`${familyName} thinks this website is not safe.`);
      }
    }, POLL_EVERY_MS);
  }

  // A request sent earlier may still be waiting (the panel was redrawn).
  showStart();
  Promise.all([getPendingSiteRequest(site), askBackground<FamilyState>({ type: "family:state" }).catch(() => null)]).then(
    ([pending, family]) => {
      if (pending && family?.status === "paired") waitFor(pending, family.familyName ?? "your family");
    },
  );
  return box;
}
