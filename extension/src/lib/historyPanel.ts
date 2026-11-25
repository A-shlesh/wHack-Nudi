// "What Nudi stopped": the side panel section that lists what Nudi blocked or
// warned about, WHY, and how risky it was, with a way to undo a mistake.
// Everything here comes from this computer only (see history.ts).

import { clearHistory, getHistory, getTrusted, untrustSite, type HistoryItem } from "./history";
import { buildFold } from "./panelParts";
import { buildSiteCheck } from "./siteCheck";
import { el } from "./ui";

const WHAT_TEXT: Record<HistoryItem["what"], string> = {
  scam_site: "Nudi warned you about this website",
  stopped: "Nudi stopped a payment",
  family_no: "Your family said no to a payment",
  paid_anyway: "You chose to pay after a warning",
};

function when(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} hours ago`;
  return new Date(at).toLocaleDateString();
}

/** onChange: something was trusted or un-trusted, so the page verdict should be redrawn. */
export function buildHistorySection(onChange: () => void): HTMLElement {
  const { fold, body } = buildFold("What Nudi stopped", false);
  fold.classList.add("history");

  async function draw(): Promise<void> {
    const [items, trusted] = await Promise.all([getHistory(), getTrusted()]);
    const summary = fold.querySelector("summary");
    if (summary) summary.firstChild!.textContent = `What Nudi stopped (${items.length})`;
    body.replaceChildren();

    if (items.length === 0) body.append(el("p", "muted", "Nothing yet. When Nudi warns you or stops a payment, it is listed here with the reason."));

    const list = el("ul", "history-list");
    const offered = new Set<string>(); // one "this website is fine" per website
    for (const item of items) {
      const row = el("li", `history-item ${item.risk}`);
      const top = el("div", "history-top");
      top.append(
        el("span", `risk-badge ${item.risk}`, item.risk === "danger" ? "High risk" : "Some risk"),
        el("span", "history-when", when(item.at)),
      );
      row.append(top, el("div", "history-what", WHAT_TEXT[item.what]));
      row.append(el("div", "history-site", item.amount ? `${item.site} · ${item.amount}` : item.site));
      if (item.reasons.length) {
        const reasons = el("ul", "history-reasons");
        item.reasons.forEach((reason) => reasons.append(el("li", "", reason)));
        row.append(reasons);
      }
      // Undo a mistake: the newest entry for each website gets the button.
      if (trusted[item.site]) {
        row.append(el("p", "history-fine", `Marked as fine by ${trusted[item.site].by === "you" ? "you" : trusted[item.site].by}.`));
      } else if (!offered.has(item.site) && item.what !== "paid_anyway") {
        offered.add(item.site);
        row.append(buildSiteCheck(item.site, item.risk, null, () => { draw(); onChange(); }));
      }
      list.append(row);
    }
    body.append(list);

    // Websites marked as fine, with a way to take it back.
    const sites = Object.entries(trusted);
    if (sites.length) {
      body.append(el("h3", "history-heading", "Websites marked as fine"));
      const marked = el("ul", "history-list");
      for (const [site, mark] of sites) {
        const row = el("li", "history-item trusted");
        const stop = el("button", "link-btn", "Warn me again");
        stop.onclick = async () => {
          await untrustSite(site);
          draw();
          onChange();
        };
        row.append(el("div", "history-site", site), el("div", "muted", `Marked by ${mark.by === "you" ? "you" : mark.by}, ${when(mark.at)}`), stop);
        marked.append(row);
      }
      body.append(marked);
    }

    if (items.length) {
      const clear = el("button", "link-btn", "Clear this list");
      clear.onclick = async () => {
        await clearHistory();
        draw();
      };
      body.append(clear);
    }
    body.append(el("p", "ai-note", "This list stays on this computer. It is never sent to anyone."));
  }

  draw();
  return fold;
}
