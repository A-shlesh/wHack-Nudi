// Nudi's design system: all the CSS for the side panel, the "Open Nudi" tab,
// the spotlight and the payment dialog.
//
// Accessibility choices (on purpose, not decoration):
//   - Atkinson Hyperlegible font, made for people with low vision
//   - text is 18px or bigger, and can be made 15% / 30% bigger
//   - every text color has at least 7:1 contrast (WCAG AAA)
//   - every button is at least 56px tall and looks pressable (bottom edge)
//   - keyboard focus is a thick yellow highlight that is hard to miss
//   - animations are switched off if the computer asks for less motion

import { FONT_FAMILY } from "./fonts";

export const STYLES = `
  :host { all: initial; }

  .app {
    --ink: #1a1a1a;          /* main text */
    --ink-2: #48443c;        /* secondary text, still 9:1 */
    --paper: #ffffff;
    --canvas: #f7f4ee;       /* warm panel background */
    --line: #d6d0c4;
    --line-strong: #8c8579;
    --brand: #0f5257;        /* deep teal, 8.9:1 on white */
    --brand-dark: #0a3a3e;
    --brand-tint: #e3efee;
    --focus: #ffbf47;        /* keyboard focus yellow */
    --danger: #a4161a;  --danger-tint: #fcebeb;
    --warn: #6b4500;    --warn-tint: #fff3d6;  --warn-line: #d9a441;
    --safe: #1e6b3a;    --safe-tint: #e6f2e9;
    --scale: 1;
    font-family: "${FONT_FAMILY}", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
    font-size: calc(18px * var(--scale));
    line-height: 1.45;
    color: var(--ink);
  }
  .app * { box-sizing: border-box; font-family: inherit; }

  /* Every interactive thing gets the same, very visible focus style. */
  .app button:focus-visible, .app input:focus-visible {
    outline: 3px solid var(--ink); outline-offset: 2px; box-shadow: 0 0 0 6px var(--focus);
  }

  /* ================= Side panel ================= */
  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483646;
    width: 440px; max-width: 100vw; display: flex; flex-direction: column;
    background: var(--canvas); border-left: 1px solid var(--line);
    box-shadow: -16px 0 40px rgba(26, 26, 26, 0.16);
    animation: slide-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes slide-in { from { transform: translateX(40px); opacity: 0; } }

  .header {
    flex: none; display: flex; align-items: center; gap: 12px;
    padding: 14px 16px 14px 20px; background: var(--brand); color: #fff;
  }
  .wordmark { flex: 1; min-width: 0; }
  .wordmark-name { font-size: 24px; font-weight: 700; line-height: 1; letter-spacing: 0.01em; }
  .wordmark-sub { font-size: 14px; opacity: 0.9; margin-top: 4px; }
  .header-btn {
    min-height: 44px; padding: 0 14px; border-radius: 8px; cursor: pointer;
    border: 2px solid rgba(255, 255, 255, 0.7); background: transparent; color: #fff;
    font-size: 16px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;
  }
  .header-btn:hover { background: rgba(255, 255, 255, 0.12); border-color: #fff; }
  .header .header-btn:focus-visible { outline: 3px solid var(--focus); box-shadow: none; }

  .body { flex: 1; overflow-y: auto; padding: 20px 20px 28px; }
  .body h2 { font-size: calc(21px * var(--scale)); font-weight: 700; margin: 30px 0 12px; line-height: 1.25; }
  .summary { margin: 18px 0 0; }
  .muted { color: var(--ink-2); }

  /* ================= Verdict (is this page safe?) ================= */
  .verdict {
    padding: 16px 18px; border-radius: 10px; border-left: 8px solid; background: var(--paper);
    animation: fade-up 0.3s ease both;
  }
  .verdict-title { display: flex; align-items: center; gap: 10px; font-size: calc(21px * var(--scale)); font-weight: 700; line-height: 1.25; }
  .verdict p { margin: 6px 0 0; }
  .verdict.safe { border-color: var(--safe); background: var(--safe-tint); }
  .verdict.safe .verdict-title { color: var(--safe); }
  .verdict.careful { border-color: var(--warn-line); background: var(--warn-tint); }
  .verdict.careful .verdict-title { color: var(--warn); }
  .verdict.risky { border-color: var(--danger); background: var(--danger-tint); }
  .verdict.risky .verdict-title { color: var(--danger); }

  .link-btn {
    display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 2px;
    border: 0; background: none; cursor: pointer; color: var(--brand); font-size: calc(17px * var(--scale));
    font-weight: 700; text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px;
  }
  .link-btn:hover { color: var(--brand-dark); text-decoration-thickness: 3px; }

  /* ================= Big choices ================= */
  .choices { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
  .choice { animation: fade-up 0.3s ease both; }
  .choice-btn {
    width: 100%; min-height: 68px; display: grid; grid-template-columns: 44px 1fr; align-items: center; gap: 14px;
    padding: 12px 16px; text-align: left; cursor: pointer; color: var(--ink);
    background: var(--paper); border: 2px solid var(--line-strong); border-radius: 12px;
    box-shadow: 0 4px 0 var(--line-strong); transition: border-color 0.12s, box-shadow 0.12s, transform 0.12s;
    font-size: calc(20px * var(--scale)); font-weight: 700; line-height: 1.25;
  }
  .choice-btn:hover { border-color: var(--brand); box-shadow: 0 4px 0 var(--brand); }
  .choice-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--brand); }
  .choice-num {
    width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
    background: var(--brand); color: #fff; font-size: 20px; font-weight: 700;
  }
  .choice-note { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: calc(15px * var(--scale)); font-weight: 400; color: var(--warn); }
  .choice-btn.payment { border-color: var(--warn-line); box-shadow: 0 4px 0 var(--warn-line); }
  .choice-btn.payment .choice-num { background: var(--warn); }
  .choice .link-btn { margin-left: 60px; }

  /* ================= Watch out ================= */
  .notice {
    display: grid; grid-template-columns: 24px 1fr; gap: 12px; padding: 14px 16px; margin-bottom: 10px;
    background: var(--paper); border: 1px solid var(--line); border-left: 6px solid; border-radius: 8px;
    animation: fade-up 0.3s ease both;
  }
  .notice svg { margin-top: 2px; }
  .notice.danger { border-left-color: var(--danger); } .notice.danger svg { color: var(--danger); }
  .notice.caution { border-left-color: var(--warn-line); } .notice.caution svg { color: var(--warn); }
  .notice.info { border-left-color: var(--brand); } .notice.info svg { color: var(--brand); }
  .notice.fix { border-left-color: var(--brand); background: var(--brand-tint); border-color: #b9d5d3; }
  .notice.fix svg { color: var(--brand); }
  .notice.done { border-left-color: var(--safe); background: var(--safe-tint); } .notice.done svg { color: var(--safe); }
  .notice-title { font-weight: 700; margin-bottom: 2px; }

  .btn {
    min-height: 56px; padding: 0 20px; border-radius: 10px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    font-size: calc(18px * var(--scale)); font-weight: 700; transition: transform 0.12s, box-shadow 0.12s;
  }
  .btn:active { transform: translateY(3px); }
  .btn.primary { border: 0; background: var(--brand); color: #fff; box-shadow: 0 4px 0 var(--brand-dark); }
  .btn.primary:hover { background: var(--brand-dark); }
  .btn.primary:active { box-shadow: 0 1px 0 var(--brand-dark); }
  .btn.secondary { border: 2px solid var(--ink); background: var(--paper); color: var(--ink); box-shadow: 0 4px 0 var(--ink); }
  .btn.secondary:hover { background: var(--canvas); }
  .btn.secondary:active { box-shadow: 0 1px 0 var(--ink); }
  .notice .btn { margin-top: 12px; min-height: 52px; }

  /* ================= Ask ================= */
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .chip {
    min-height: 44px; padding: 0 16px; border-radius: 999px; cursor: pointer;
    border: 2px solid var(--line-strong); background: var(--paper); color: var(--ink);
    font-size: calc(16px * var(--scale)); font-weight: 700;
  }
  .chip:hover { border-color: var(--brand); color: var(--brand); }
  .ask-label { display: block; font-weight: 700; margin-bottom: 6px; }
  .ask-form { display: flex; gap: 8px; }
  .ask-input {
    flex: 1; min-width: 0; min-height: 56px; padding: 0 14px; border-radius: 10px;
    border: 2px solid var(--ink-2); background: var(--paper); color: var(--ink); font-size: calc(18px * var(--scale));
  }
  .ask-input::placeholder { color: #6b665c; }
  .answer {
    margin-top: 14px; padding: 14px 16px; border-radius: 10px; background: var(--paper);
    border: 1px solid var(--line); border-left: 6px solid var(--brand); animation: fade-up 0.25s ease both;
  }
  .answer-who { font-size: 14px; font-weight: 700; color: var(--brand); text-transform: none; margin-bottom: 2px; }

  /* ================= Bottom controls ================= */
  .controls { flex: none; padding: 14px 20px 16px; background: var(--paper); border-top: 1px solid var(--line); display: grid; gap: 12px; }
  .controls-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .controls .btn { width: 100%; font-size: 17px; padding: 0 12px; white-space: nowrap; } /* fixed size so the bar never wraps */
  .btn.listening { background: var(--danger); box-shadow: 0 4px 0 #6e0f12; color: #fff; border-color: var(--danger); }
  .settings-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .setting-label { font-size: 15px; font-weight: 700; color: var(--ink-2); margin-right: 8px; }
  .segmented { display: inline-flex; border: 2px solid var(--line-strong); border-radius: 10px; overflow: hidden; }
  .segmented button {
    min-width: 48px; min-height: 44px; border: 0; border-right: 2px solid var(--line-strong);
    background: var(--paper); color: var(--ink); cursor: pointer; font-weight: 700;
  }
  .segmented button:last-child { border-right: 0; }
  .segmented button[aria-pressed="true"] { background: var(--ink); color: #fff; }
  .toggle {
    display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px;
    border: 2px solid var(--line-strong); border-radius: 10px; background: var(--paper); color: var(--ink);
    cursor: pointer; font-size: 15px; font-weight: 700;
  }
  .toggle .track { width: 36px; height: 20px; border-radius: 999px; background: var(--line-strong); position: relative; transition: background 0.15s; }
  .toggle .track::after {
    content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%;
    background: #fff; transition: transform 0.15s;
  }
  .toggle[aria-pressed="true"] .track { background: var(--brand); }
  .toggle[aria-pressed="true"] .track::after { transform: translateX(16px); }
  .privacy-line { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink-2); }

  /* ================= Loading ================= */
  .loading { display: grid; gap: 14px; padding-top: 8px; }
  .loading-title { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 12px; }
  .spinner { width: 28px; height: 28px; border-radius: 50%; border: 4px solid var(--brand-tint); border-top-color: var(--brand); animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .skeleton { height: 68px; border-radius: 12px; background: linear-gradient(90deg, #ece7dd 0%, #f7f4ee 50%, #ece7dd 100%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
  @keyframes shimmer { to { background-position: -200% 0; } }

  /* ================= "Open Nudi" tab (panel hidden) ================= */
  .tab {
    position: fixed; right: 0; top: 40%; z-index: 2147483646; display: flex; align-items: center; gap: 10px;
    padding: 12px 18px 12px 14px; border: 0; border-radius: 12px 0 0 12px; cursor: pointer;
    background: var(--brand); color: #fff; font-size: 18px; font-weight: 700;
    box-shadow: -6px 6px 20px rgba(26, 26, 26, 0.25); animation: slide-in 0.25s ease;
  }
  .tab:hover { background: var(--brand-dark); }

  /* ================= Spotlight ("Show me") ================= */
  .spot-layer { position: fixed; inset: 0; z-index: 2147483647; cursor: pointer; }
  .spot {
    position: fixed; border-radius: 10px; pointer-events: none;
    box-shadow: 0 0 0 4px var(--focus), 0 0 0 9999px rgba(26, 26, 26, 0.66);
    animation: ring 1.4s ease-in-out infinite;
  }
  @keyframes ring { 50% { box-shadow: 0 0 0 10px var(--focus), 0 0 0 9999px rgba(26, 26, 26, 0.66); } }
  .tip {
    position: fixed; width: 320px; padding: 16px 18px; border-radius: 12px; cursor: default;
    background: var(--paper); color: var(--ink); border: 2px solid var(--ink);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35); animation: fade-up 0.25s ease;
  }
  .tip-title { font-size: 20px; font-weight: 700; margin-bottom: 12px; }

  /* ================= Payment check ================= */
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    padding: 16px; background: rgba(26, 26, 26, 0.7); animation: fade 0.2s ease;
  }
  @keyframes fade { from { opacity: 0; } }
  .dialog {
    width: min(480px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 28px;
    border-radius: 16px; background: var(--paper); color: var(--ink); border-top: 10px solid var(--warn-line);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.4); animation: rise 0.25s ease;
  }
  @keyframes rise { from { transform: translateY(16px); opacity: 0; } }
  .dialog h2 { margin: 0 0 6px; font-size: 28px; line-height: 1.2; }
  .amount { margin: 18px 0; padding: 14px 18px; border-radius: 10px; background: var(--warn-tint); border: 2px solid var(--warn-line); }
  .amount-label { font-size: 15px; font-weight: 700; color: var(--warn); }
  .amount-value { font-size: 40px; font-weight: 700; line-height: 1.1; color: var(--ink); }
  .checklist { margin: 0 0 22px; padding: 0; list-style: none; display: grid; gap: 8px; }
  .checklist li { display: grid; grid-template-columns: 24px 1fr; gap: 10px; }
  .checklist svg { color: var(--brand); margin-top: 2px; }
  .dialog-buttons { display: grid; gap: 14px; }
  .dialog .btn { width: 100%; min-height: 60px; font-size: 20px; }
  .dialog .privacy-line { margin-top: 16px; }

  /* ================= Side panel version ================= */
  /* In Chrome's side panel Nudi fills the panel instead of floating over the page. */
  .panel.docked {
    position: static; width: 100%; max-width: none; height: 100vh;
    border-left: 0; box-shadow: none; animation: none;
  }
  .share-badge {
    flex: none; padding: 6px 10px; border-radius: 999px; font-size: 13px; font-weight: 700;
    background: rgba(255, 255, 255, 0.16); border: 2px solid rgba(255, 255, 255, 0.7);
  }
  .share-badge.on { background: #fff; color: var(--brand); border-color: #fff; }

  /* Website trust inside the verdict */
  .trust-site { margin-top: 12px; font-size: calc(16px * var(--scale)); word-break: break-all; }
  .meter { height: 12px; margin-top: 8px; border-radius: 999px; background: rgba(26, 26, 26, 0.12); overflow: hidden; }
  .meter-fill { height: 100%; border-radius: 999px; }
  .meter-fill.safe { background: var(--safe); }
  .meter-fill.caution { background: var(--warn-line); }
  .meter-fill.danger { background: var(--danger); }
  .meter-label { margin-top: 4px; font-size: 14px; font-weight: 700; color: var(--ink-2); }
  .trust-reasons { margin: 10px 0 0; padding-left: 22px; }
  .trust-reasons li { margin: 4px 0; }

  /* Family */
  .family .fold-body > p:first-child { margin-top: 0; }

  /* Folded sections: a big tappable title row with an arrow; the content opens below. */
  .fold { margin-top: 14px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; }
  .fold > summary {
    list-style: none; cursor: pointer; min-height: 56px; padding: 0 16px;
    display: flex; align-items: center; gap: 10px;
    font-size: calc(19px * var(--scale)); font-weight: 700;
  }
  .fold > summary::-webkit-details-marker { display: none; }
  .fold > summary::after {
    content: ""; width: 10px; height: 10px; margin-left: 6px; flex: none;
    border-right: 3px solid var(--ink); border-bottom: 3px solid var(--ink);
    transform: rotate(45deg); transition: transform 0.15s;
  }
  .fold[open] > summary::after { transform: rotate(-135deg); }
  .fold > summary:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; box-shadow: 0 0 0 6px var(--focus); }
  .fold-extra { margin-left: auto; font-size: 14px; color: var(--ink-2); }
  .fold-body { padding: 4px 16px 16px; }
  .verdict .fold { margin-top: 12px; background: rgba(255, 255, 255, 0.6); }
  .verdict .fold > summary { font-size: calc(17px * var(--scale)); min-height: 48px; }
  .body > .notice.fix, .body > .notice.done { margin-top: 18px; }
  .family .btn { margin-top: 12px; }
  .family .ask-input { width: 100%; }
  .pair-code {
    margin: 12px 0; padding: 14px; border-radius: 12px; background: var(--paper); border: 2px dashed var(--brand);
    text-align: center; font-size: 38px; font-weight: 700; letter-spacing: 0.08em; color: var(--brand);
  }
  .request-text { font-size: calc(22px * var(--scale)); font-weight: 700; }
  .shared-details { margin: 14px 0 4px; }
  .shared-details summary { cursor: pointer; font-weight: 700; color: var(--brand); min-height: 44px; display: flex; align-items: center; }
  .shared-details ul { margin: 6px 0; padding-left: 22px; }
  .never-shared { font-weight: 700; color: var(--safe); }

  /* Payment dialog: blocked and waiting */
  .dialog.blocked { border-top-color: var(--danger); }
  .danger-list svg { color: var(--danger); }
  .waiting { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
  .waiting h2 { margin: 0; }

  /* First-time "read aloud?" question */
  .voice-question {
    margin-bottom: 16px; padding: 16px; border-radius: 12px;
    background: var(--brand-tint); border: 2px solid var(--brand);
  }
  .voice-question-title { display: flex; align-items: center; gap: 10px; font-size: calc(20px * var(--scale)); font-weight: 700; color: var(--brand); }
  .voice-question p { margin: 6px 0 12px; }

  /* AI features */
  .ai-note { margin: 10px 0 0; font-size: 14px; color: var(--ink-2); }
  .ai-tag {
    display: inline-block; margin-right: 8px; padding: 1px 8px; border-radius: 999px; vertical-align: 1px;
    font-size: 12px; font-weight: 700; background: var(--brand-tint); color: var(--brand);
  }
  .answer-quote { margin: 6px 0 8px; padding-left: 10px; border-left: 3px solid var(--line-strong); color: var(--ink-2); font-style: italic; }
  .ask-tip { margin: 12px 0 0; font-size: 14px; color: var(--ink-2); }

  @keyframes fade-up { from { opacity: 0; transform: translateY(6px); } }

  @media (prefers-reduced-motion: reduce) {
    .app *, .app { animation: none !important; transition: none !important; }
  }
  @media (prefers-contrast: more) {
    .app { --line: #1a1a1a; --line-strong: #1a1a1a; --ink-2: #1a1a1a; }
  }
`;
