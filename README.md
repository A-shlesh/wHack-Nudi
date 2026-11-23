# Nudi

**Nudi** (ನುಡಿ, Kannada for "speak") is a Chrome extension with a small backend that helps elderly and low-tech people get things done on websites.

One click turns a busy page into a calm **Action View**:

- **Big, simple buttons** for the few things you actually came to do
- **Scam and dark-pattern warnings** (fake countdowns, prize scams, KYC tricks, items added without asking)
- **Reads everything aloud**, slowly
- **Always asks before any payment**, whether you tap Nudi's button or the website's own "Pay" button
- **Never sends passwords, OTPs, card numbers or bank details.** Those fields are skipped inside the browser.

> This is a hackathon prototype, not a finished product.

---

## How it works

```
 Web page ──► content script ──► background worker ──► FastAPI backend
 (Chrome)     reads page,        only part that        Bedrock AI (or mock)
              strips private     calls the backend     scam rules
              fields                                   ElevenLabs voice (or mock)
                 ▲                                          │
                 └───────── Action View + voice ◄───────────┘
```

| Part | Where | What it does |
|---|---|---|
| Popup | `extension/src/popup.ts` | "Help me with this page" button |
| Page reader | `extension/src/lib/pageReader.ts` | Lists buttons, links and safe fields |
| Privacy filter | `extension/src/lib/sanitize.ts` | Skips private fields, hides private numbers |
| Action View | `extension/src/lib/actionView.ts` | The big-button panel |
| Payment guard | `extension/src/lib/paymentGuard.ts` | Yes/No question before money is spent |
| Voice | `extension/src/lib/voice.ts` | ElevenLabs audio, or the browser's own voice |
| API | `backend/app/main.py` | `/health`, `/simplify`, `/speak`, `/demo/` |
| Scam rules | `backend/app/risk_rules.py` | Phrase rules that always run |
| AI | `backend/app/services/bedrock_ai.py` / `mock_ai.py` | Real Bedrock or offline mock |

## Mock mode (works with no keys)

Every outside service has a mock. With an empty `.env`:

- **AI**: a rule-based simplifier picks the main buttons (`mock_ai.py`)
- **Voice**: the browser's built-in `speechSynthesis`

`GET /health` shows which mode is active, and so does the popup.

---

## Run it

You need **Python 3.11+**, **Node 18+** and **Google Chrome**.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8787
```

On macOS/Linux use `source .venv/bin/activate` and `cp .env.example .env`.

Check it: open http://localhost:8787/health. You should see `{"status":"ok","ai":"mock","voice":"browser"}`.

### 2. Extension

```powershell
cd extension
npm install
npm run build
```

1. Open `chrome://extensions` in Chrome
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose the `extension/dist` folder
4. Pin Nudi to the toolbar

### 3. Try the demo

1. Open http://localhost:8787/demo/ (a fake, cluttered bill-payment page)
2. Click the Nudi icon, then **Help me with this page**
3. You should see:
   - Warnings about the countdown, the prize-scam ad, the pre-ticked protection plan and the guilt link
   - Big buttons: **Pay ₹1,339 now 🔒**, **Download bill**, **See past bills**…
   - Nudi reading it all aloud
4. Tap **Pay**. A big **"This will spend money"** question appears. **No, stop** cancels.
5. Close Nudi and click the page's own **PAY** button. Nudi still stops and asks.

### 4. Tests

```powershell
cd backend
.venv\Scripts\python -m pytest -q
```

```powershell
cd extension
npm run typecheck
```

---

## Turning on real services (optional)

Edit `backend/.env`:

| Service | Settings | Notes |
|---|---|---|
| AWS Bedrock | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, **or** `AWS_BEARER_TOKEN_BEDROCK`; `AWS_REGION`; `BEDROCK_MODEL_ID` | Uses the Converse API. Default model: `us.anthropic.claude-haiku-5-5`. Turn on model access in the Bedrock console first. |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, optional `ELEVENLABS_MODEL_ID` | Default model `eleven_v4_turbo` (fast, supports Kannada and Hindi). Pick a voice ID from your Voice Library. |

If a real service fails at runtime, Nudi quietly falls back to mock mode, so the demo keeps running.

## Privacy

- Password, OTP, PIN, CVV, card, account, IFSC, UPI and Aadhaar fields are **skipped**. Not even their labels are sent.
- Nothing a user types is ever sent. Text boxes are described only by their hint text.
- Long numbers, card-like numbers and IFSC codes in page text become `[hidden]`, in the browser **and** again on the server.
- The backend stores nothing.

## Limits (prototype)

- English UI and voice only for now (ElevenLabs model supports Kannada)
- The backend runs on `localhost`, and CORS is open for local use
- Scam detection is phrase-based, plus the AI when Bedrock is on
