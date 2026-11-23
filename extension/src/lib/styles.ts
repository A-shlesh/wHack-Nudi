// All the CSS for what Nudi draws on a page: the panel, the floating
// bubble, the spotlight and the payment dialog. Colors are kept in
// variables at the top so the whole look can be changed in one place.
// --scale is changed by the A- / A+ buttons to make all text bigger.

export const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; }

  .app {
    --brand: #4f46e5; --brand-dark: #312e81; --brand-soft: #eef2ff;
    --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --bg: #ffffff; --bg-soft: #f8fafc;
    --safe: #047857; --safe-bg: #ecfdf5;
    --warn: #b45309; --warn-bg: #fffbeb;
    --danger: #b91c1c; --danger-bg: #fef2f2;
    --scale: 1;
    color: var(--ink);
  }

  /* ---------- Panel ---------- */
  .panel {
    position: fixed; top: 16px; right: 16px; z-index: 2147483646;
    width: 410px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg); border-radius: 22px;
    box-shadow: 0 24px 64px rgba(15, 23, 42, 0.30), 0 0 0 1px rgba(15, 23, 42, 0.06);
    font-size: calc(17px * var(--scale)); line-height: 1.5;
    animation: slide-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes slide-in { from { opacity: 0; transform: translateX(24px) scale(0.98); } }

  .header {
    display: flex; align-items: center; gap: 12px; padding: 16px 18px;
    background: linear-gradient(135deg, var(--brand-dark), var(--brand)); color: #fff;
  }
  .logo {
    flex: none; width: 42px; height: 42px; border-radius: 13px; display: grid; place-items: center;
    background: rgba(255, 255, 255, 0.16); font-size: 20px; font-weight: 700;
  }
  .brand { flex: 1; min-width: 0; }
  .brand-name { font-size: 20px; font-weight: 700; line-height: 1.15; }
  .brand-sub { font-size: 13px; opacity: 0.8; }
  .icon-btn {
    flex: none; width: 38px; height: 38px; border: 0; border-radius: 11px; cursor: pointer;
    display: grid; place-items: center; color: #fff; background: rgba(255, 255, 255, 0.14);
    transition: background 0.15s;
  }
  .icon-btn:hover { background: rgba(255, 255, 255, 0.26); }

  .body { padding: 16px 18px 8px; overflow-y: auto; }
  .summary { margin: 14px 0 4px; font-size: calc(18px * var(--scale)); }
  .muted { color: var(--muted); margin: 6px 0 0; }
  .loading-title { font-size: 20px; font-weight: 700; margin: 14px 0 0; }

  .section-title {
    margin: 20px 0 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--muted);
  }

  /* ---------- Safety meter ---------- */
  .safety { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; }
  .safety-icon { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
  .safety-label { font-weight: 700; font-size: calc(18px * var(--scale)); line-height: 1.2; }
  .safety-note { font-size: 14px; opacity: 0.85; }
  .safety.safe { background: var(--safe-bg); color: var(--safe); }
  .safety.safe .safety-icon { background: var(--safe); }
  .safety.careful { background: var(--warn-bg); color: var(--warn); }
  .safety.careful .safety-icon { background: var(--warn); }
  .safety.risky { background: var(--danger-bg); color: var(--danger); }
  .safety.risky .safety-icon { background: var(--danger); }

  /* ---------- Warning and fix cards ---------- */
  .card {
    display: flex; gap: 10px; padding: 12px 14px; margin-bottom: 8px; border-radius: 14px;
    font-size: calc(15px * var(--scale)); border: 1px solid var(--line); background: var(--bg-soft);
    animation: fade-up 0.3s ease both;
  }
  .card svg { flex: none; margin-top: 2px; }
  .card.danger { background: var(--danger-bg); border-color: #fecaca; color: #7f1d1d; }
  .card.caution { background: var(--warn-bg); border-color: #fde68a; color: #78350f; }
  .card.info { background: #f0f9ff; border-color: #bae6fd; color: #0c4a6e; }
  .card.fix { background: #f5f3ff; border-color: #ddd6fe; color: #4c1d95; flex-direction: column; }
  .card.done { background: var(--safe-bg); border-color: #a7f3d0; color: var(--safe); }
  @keyframes fade-up { from { opacity: 0; transform: translateY(6px); } }

  .small-btn {
    align-self: flex-start; border: 0; border-radius: 10px; padding: 8px 14px; cursor: pointer;
    font-size: calc(15px * var(--scale)); font-weight: 700; color: #fff; background: #7c3aed;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .small-btn:hover { background: #6d28d9; }

  /* ---------- Big action buttons ---------- */
  .action-row { display: flex; gap: 8px; margin-bottom: 10px; animation: fade-up 0.3s ease both; }
  .action {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; min-height: 64px;
    padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 16px; background: var(--bg);
    cursor: pointer; text-align: left; color: var(--ink);
    font-size: calc(18px * var(--scale)); font-weight: 600; line-height: 1.3;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  }
  .action:hover { border-color: var(--brand); box-shadow: 0 8px 20px rgba(79, 70, 229, 0.16); transform: translateY(-1px); }
  .badge {
    flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
    background: var(--brand-soft); color: var(--brand); font-weight: 700; font-size: 16px;
  }
  .action-label { flex: 1; min-width: 0; }
  .pill {
    display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 2px 8px;
    border-radius: 999px; font-size: 12px; font-weight: 700; background: var(--warn-bg); color: var(--warn);
  }
  .action.payment { border-color: #fcd34d; }
  .action.payment .badge { background: #fef3c7; color: var(--warn); }
  .show-me {
    flex: none; width: 64px; border: 1.5px solid var(--line); border-radius: 16px; background: var(--bg-soft);
    color: var(--muted); cursor: pointer; font-size: 12px; font-weight: 600;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  }
  .show-me:hover { color: var(--brand); border-color: var(--brand); }

  /* ---------- Ask box ---------- */
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .chip {
    border: 1px solid var(--line); background: var(--bg-soft); color: var(--ink); cursor: pointer;
    border-radius: 999px; padding: 6px 12px; font-size: calc(14px * var(--scale));
  }
  .chip:hover { border-color: var(--brand); color: var(--brand); }
  .ask-form { display: flex; gap: 8px; }
  .ask-input {
    flex: 1; min-width: 0; height: 48px; padding: 0 14px; border: 1.5px solid var(--line); border-radius: 14px;
    font-size: calc(16px * var(--scale)); color: var(--ink); background: var(--bg); outline: none;
  }
  .ask-input:focus { border-color: var(--brand); box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.15); }
  .send-btn {
    flex: none; width: 48px; height: 48px; border: 0; border-radius: 14px; cursor: pointer;
    background: var(--brand); color: #fff; display: grid; place-items: center;
  }
  .answer {
    margin-top: 10px; padding: 12px 14px; border-radius: 14px 14px 14px 4px;
    background: var(--brand-soft); color: #1e1b4b; font-size: calc(16px * var(--scale));
    animation: fade-up 0.25s ease both;
  }
  .answer.thinking { color: var(--muted); }

  /* ---------- Bottom toolbar ---------- */
  .toolbar {
    display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 8px; padding: 12px 18px 14px;
    border-top: 1px solid var(--line); background: var(--bg-soft);
  }
  .tool {
    height: 48px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--bg); cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px;
    font-size: 15px; font-weight: 600; color: var(--ink);
  }
  .tool:hover { border-color: var(--brand); color: var(--brand); }
  .tool.listening { background: var(--danger); border-color: var(--danger); color: #fff; animation: pulse 1.2s infinite; }
  @keyframes pulse { 50% { box-shadow: 0 0 0 8px rgba(185, 28, 28, 0.15); } }
  .footnote { padding: 0 18px 12px; background: var(--bg-soft); font-size: 12px; color: var(--muted); }

  button:focus-visible, input:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }

  /* ---------- Minimized bubble ---------- */
  .fab {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; width: 68px; height: 68px;
    border: 0; border-radius: 50%; cursor: pointer; color: #fff; font-size: 22px; font-weight: 700;
    background: linear-gradient(135deg, var(--brand-dark), var(--brand));
    box-shadow: 0 12px 30px rgba(79, 70, 229, 0.45); animation: pop 0.3s ease;
  }
  @keyframes pop { from { transform: scale(0.6); opacity: 0; } }

  /* ---------- Loading spinner ---------- */
  .spinner {
    width: 36px; height: 36px; border-radius: 50%; border: 4px solid var(--brand-soft);
    border-top-color: var(--brand); animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ---------- Spotlight ("Show me") ---------- */
  .spot-layer { position: fixed; inset: 0; z-index: 2147483647; cursor: pointer; }
  .spot {
    position: fixed; border-radius: 12px; pointer-events: none;
    box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.62); outline: 3px solid #fbbf24;
    animation: ring 1.4s ease-in-out infinite;
  }
  @keyframes ring { 50% { outline-offset: 6px; } }
  .tip {
    position: fixed; width: 300px; padding: 14px 16px; border-radius: 16px; background: #fff; color: var(--ink);
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.35); font-size: 18px; font-weight: 600; animation: fade-up 0.25s ease;
  }
  .tip-hint { font-size: 13px; font-weight: 400; color: var(--muted); margin-top: 6px; }

  /* ---------- Payment dialog ---------- */
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    padding: 16px; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(3px); animation: fade 0.2s ease;
  }
  @keyframes fade { from { opacity: 0; } }
  .dialog {
    width: min(460px, 100%); padding: 24px; border-radius: 24px; background: #fff; color: var(--ink);
    font-size: 18px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35); animation: pop 0.25s ease;
  }
  .dialog-icon { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: #fef3c7; color: var(--warn); }
  .dialog h2 { margin: 14px 0 4px; font-size: 26px; }
  .amount { margin: 12px 0; padding: 12px 16px; border-radius: 14px; background: var(--warn-bg); }
  .amount-label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--warn); }
  .amount-value { font-size: 34px; font-weight: 800; color: #78350f; }
  .checklist { margin: 12px 0; padding: 0; list-style: none; font-size: 16px; }
  .checklist li { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; }
  .dialog-buttons { display: grid; gap: 10px; margin-top: 16px; }
  .big-btn {
    min-height: 58px; border-radius: 16px; font-size: 20px; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .big-btn.no { border: 0; background: var(--safe); color: #fff; }
  .big-btn.no:hover { background: #065f46; }
  .big-btn.yes { border: 2px solid #f59e0b; background: #fff; color: #92400e; }
  .big-btn.yes:hover { background: var(--warn-bg); }
  .privacy-note { margin-top: 12px; font-size: 13px; color: var(--muted); display: flex; gap: 6px; align-items: center; }

  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
`;
