// Nudi family dashboard logic.
// 1. Pair: send the 6-digit code -> get a family token (kept in this phone's browser).
// 2. Wait until the elder taps "Allow" in Nudi.
// 3. Every 3 seconds, read the feed: payment requests on top, then activity.
// The backend address is this same website, so nothing needs configuring.

const POLL_MS = 3000;
const SAVE_KEY = "nudiFamilyDashboard";

// ---------- Small helpers ----------

const $ = (id) => document.getElementById(id);

function show(screenId) {
  for (const id of ["pair-screen", "wait-screen", "feed-screen"]) $(id).hidden = id !== screenId;
}

/** Make an element with plain text (never HTML, so nothing from the server can inject code). */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || null;
  } catch {
    return null; // storage blocked: the user just pairs again
  }
}

function save(value) {
  try {
    if (value) localStorage.setItem(SAVE_KEY, JSON.stringify(value));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* fine: kept in memory only */
  }
}

let session = loadSaved(); // { familyId, token, myName }

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    save(null);
    session = null;
    show("pair-screen");
    throw new Error("Not connected");
  }
  return response;
}

function timeAgo(seconds) {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// Small line icons for the activity list (fixed strings, safe to use as HTML).
const ICONS = {
  task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  danger: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  caution: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  saved: '<path d="M20 6 9 17l-5-5"/>',
  paid: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  blocked: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  ask: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
};

function iconEl(name) {
  const box = el("div", `event-icon i-${name}`);
  box.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.task}</svg>`;
  return box;
}

// ---------- Voice note ----------

async function playVoiceNote(approval) {
  if (approval.has_voice) {
    const response = await api(`/approvals/${approval.id}/voice`);
    if (response.status === 200) {
      const audio = new Audio(URL.createObjectURL(await response.blob()));
      audio.play();
      return;
    }
  }
  // Mock mode (no ElevenLabs key): the phone reads the note with its own voice.
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(approval.voice_text);
  utterance.lang = "en-IN";
  speechSynthesis.speak(utterance);
}

// ---------- Approvals ----------

const decided = new Map(); // approval id -> "approved" | "blocked" (shown for a while)
const announced = new Set(); // approvals we already buzzed / spoke for

async function decide(approval, decision) {
  const response = await api(`/approvals/${approval.id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
  if (response.ok) decided.set(approval.id, decision);
  refresh();
}

function approvalCard(approval, elderName) {
  const card = el("article", "approval");
  card.setAttribute("aria-label", "Payment request");
  card.append(
    el("h3", "", `${elderName} wants to pay`),
    el("div", "amount", approval.amount || "an amount"),
    el("div", "site", `to ${approval.site}`),
  );
  if (approval.reasons.length) {
    card.append(el("p", "muted", "Nudi is worried because:"));
    const list = el("ul");
    approval.reasons.forEach((reason) => list.append(el("li", "", reason)));
    card.append(list);
  }
  const voice = el("button", "btn voice", "▶ Play voice note");
  voice.onclick = () => playVoiceNote(approval);
  const approve = el("button", "btn approve", "Approve");
  const block = el("button", "btn block", "Block");
  approve.onclick = () => decide(approval, "approved");
  block.onclick = () => decide(approval, "blocked");
  const buttons = el("div", "buttons");
  buttons.append(approve, block);
  card.append(voice, buttons);
  return card;
}

// ---------- Drawing the feed ----------

function drawFeed(feed) {
  $("subtitle").textContent = `Helping ${feed.elder_name}`;
  const sharing = $("sharing");
  sharing.className = feed.sharing_on ? "pill on" : "pill off";
  sharing.textContent = feed.sharing_on ? `${feed.elder_name} is sharing with you` : `${feed.elder_name} paused sharing`;

  $("sum-tasks").textContent = feed.summary.tasks_done;
  $("sum-blocked").textContent = feed.summary.scams_blocked;
  $("sum-saved").textContent = rupees(feed.summary.money_saved);

  const approvals = $("approvals");
  approvals.replaceChildren();
  for (const [id, decision] of decided) {
    const text = decision === "approved" ? "You approved the payment. Nudi will still ask them to confirm." : "You blocked the payment. Nudi has stopped it.";
    approvals.append(el("div", `decided ${decision}`, text));
    setTimeout(() => decided.delete(id), 8000);
  }
  for (const approval of feed.pending) {
    approvals.append(approvalCard(approval, feed.elder_name));
    if (!announced.has(approval.id)) {
      announced.add(approval.id);
      navigator.vibrate?.([200, 100, 200]);
      playVoiceNote(approval).catch(() => {}); // may need a tap first on some phones
    }
  }

  const list = $("events");
  list.replaceChildren();
  for (const event of feed.events) {
    const item = el("li", "event");
    const words = el("div");
    words.append(el("div", "", event.text), el("div", "event-time", timeAgo(event.at)));
    item.append(iconEl(event.icon), words);
    list.append(item);
  }
  $("empty").hidden = feed.events.length > 0;
}

// ---------- Weekly note (AI-written, or from the numbers when offline) ----------

const DIGEST_EVERY_MS = 60_000; // the note changes slowly; this also saves the free AI limit
let lastDigestAt = 0;
let lastEventCount = -1;

const AI_NAMES = { gemini: "Gemini AI", groq: "Groq AI", bedrock: "AWS Bedrock AI" };

async function refreshDigest(eventCount) {
  const due = Date.now() - lastDigestAt > DIGEST_EVERY_MS || eventCount !== lastEventCount;
  if (!due) return;
  lastDigestAt = Date.now();
  lastEventCount = eventCount;
  try {
    const response = await api(`/family/${session.familyId}/digest`);
    if (!response.ok) return;
    const { digest, mode } = await response.json();
    $("digest-text").textContent = digest;
    $("digest-by").textContent = AI_NAMES[mode] ? `Written by Nudi with ${AI_NAMES[mode]}` : "Written by Nudi from this week's numbers";
  } catch {
    /* keep the last note */
  }
}

async function refresh() {
  if (!session) return show("pair-screen");
  try {
    const response = await api(`/family/${session.familyId}/feed`);
    if (!response.ok) return;
    const feed = await response.json();
    if (feed.status === "rejected") {
      save(null);
      session = null;
      $("pair-error").textContent = "They chose not to connect.";
      return show("pair-screen");
    }
    if (feed.status !== "paired") {
      $("wait-name").textContent = session.myName;
      $("wait-title").textContent = `Waiting for ${feed.elder_name} to allow…`;
      return show("wait-screen");
    }
    drawFeed(feed);
    show("feed-screen");
    refreshDigest(feed.events.length);
  } catch {
    /* offline for a moment: try again on the next tick */
  }
}

// ---------- Pairing ----------

$("pair-form").onsubmit = async (event) => {
  event.preventDefault();
  $("pair-error").textContent = "";
  const response = await fetch("/family/pair/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: $("code").value.trim(), family_name: $("name").value.trim() || "Sushant" }),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    $("pair-error").textContent = typeof problem.detail === "string" ? problem.detail : "Please check the 6 digits.";
    return;
  }
  const reply = await response.json();
  session = { familyId: reply.family_id, token: reply.family_token, myName: $("name").value.trim() || "Sushant" };
  save(session);
  refresh();
};

$("unlink").onclick = () => {
  save(null);
  session = null;
  show("pair-screen");
};

refresh();
setInterval(refresh, POLL_MS);
