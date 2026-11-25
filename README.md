# Nudi

**Nudi** (ನುಡಿ, Kannada for "speak") is a Chrome extension with a small backend that helps elderly and low-tech people get things done on websites, safely.

Nudi opens in **Chrome's side panel, next to the website**, and:

- **Checks the website itself**: how old it is, whether it pretends to be a bank or brand (BESCOM, SBI, HDFC…), and whether it uses https
- **Shows a safety verdict**: "This website looks safe", "Be careful", or "This website looks like a scam", with the reasons in plain words
- **Turns the page into a few big, numbered choices**, each with **"Show me where it is"** (dims the page and points at the real button)
- **Warns about scams and dark patterns**: fake countdowns, prize scams, KYC tricks, items added without asking
- **"Remove it for me"**: unticks sneaky pre-ticked extras (protection plans, donations) in one tap
- **Ask Nudi**: "How much do I pay?", "When is it due?", "Is this page safe?" (typed, tapped or spoken)
- **"Explain this with Nudi"**: select confusing words on any page (KYC, convenience fee, auto-debit), right-click, and get a simple explanation
- **AI second opinion**: the AI can add scam warnings Nudi's rules missed (marked "AI noticed"), but it can never approve a payment or remove a warning
- **Talk to Nudi**: "option two", "pay the bill", "read again"
- **Reads everything aloud**, slowly, with bigger text on request
- **Always checks before any payment**, whether you tap Nudi's choice or the website's own "Pay" button. On a scam website, payment is **blocked**.
- **Family Link**: a family member can check payments from their phone. "Ask Sushant first" sends a request with a voice note; Sushant taps **Approve** or **Block**.
- **Weekly note for the family**: the dashboard shows a short, warm summary of the week ("Ajji used Nudi for 4 tasks; Nudi stopped 1 risky payment…"), written by the AI from the week's numbers
- **Never sends passwords, OTPs, card numbers or bank details.** Those fields are skipped inside the browser.

> This is a hackathon prototype, not a finished product.

## Designed for accessibility

- **Atkinson Hyperlegible** font, designed by the Braille Institute for people with low vision (shipped inside the extension, OFL licence)
- **18px or larger text**, with three sizes (Large / Larger / Largest) that are remembered across websites
- **At least 7:1 contrast** for all text (WCAG AAA)
- **Large targets**: every button is at least 56px tall and has a "pressable" bottom edge
- **Keyboard friendly**: a thick yellow focus highlight, **Alt+Shift+N** to open, **Escape** to close
- **Screen reader friendly**: real headings, labelled buttons, and spoken status updates (`role="status"`)
- **Calm by default**: no gradients or flashing; animations turn off when the computer asks for reduced motion
- **Safe default**: in the payment check, the big button is **"No, do not pay"**
- **Side panel, not an overlay**: Nudi never covers the website

---

## How it works

```
 Website tab                      Chrome side panel                Background worker        FastAPI backend
 ┌──────────────────┐  messages  ┌──────────────────┐  messages  ┌────────────────┐  HTTPS  ┌───────────────────────┐
 │ content script   │◄──────────►│ Nudi panel       │◄──────────►│ only part that │◄───────►│ /simplify  AI or mock  │
 │ - reads page     │            │ - verdict        │            │ calls backend  │         │ /trust     domain check│
 │   (no passwords, │            │ - big choices    │            └────────────────┘         │ /ask       questions   │
 │   no typing)     │            │ - ask, talk      │                                       │ /family/*  Family Link │
 │ - payment guard  │            │ - Family Link    │                                       │ /dashboard family page │
 └──────────────────┘            └──────────────────┘                                       └───────────────────────┘
```

| Part | Where | What it does |
|---|---|---|
| Side panel | `extension/src/sidepanel.ts` | Draws Nudi next to the page; follows tab changes |
| Page script | `extension/src/content.ts` | Reads the page when asked; runs choices; payment guard on every page |
| Page reader | `extension/src/lib/pageReader.ts` | Lists buttons, links and safe fields; leaves out ads |
| Privacy filter | `extension/src/lib/sanitize.ts` | Skips private fields, hides private numbers |
| Payment guard | `extension/src/lib/paymentGuard.ts` | "Check before you pay"; blocks on scam sites; "Ask Sushant first" |
| Family Link | `extension/src/lib/familyClient.ts`, `familyPanel.ts` | Pairing, sharing switch, events, approval requests |
| Panel parts | `extension/src/lib/panelParts.ts`, `controls.ts`, `askBox.ts` | Header, verdict, choices, notices, controls |
| Look and feel | `extension/src/lib/styles.ts`, `icons.ts`, `fonts.ts` | Design system, logo, icons, font |
| Backend address | `extension/src/config.ts` | The ONE place to switch between localhost and AWS |
| API | `backend/app/main.py` | All routes |
| Domain trust | `backend/app/domain_trust.py`, `backend/app/trust/` | Age (RDAP), lookalike brands, https, score |
| Family Link API | `backend/app/family.py`, `backend/app/storage.py` | Pairing, events, approvals, feed; SQLite or DynamoDB |
| Family dashboard | `family-dashboard/` | Plain HTML/CSS/JS, served at `/dashboard/` |
| AWS | `template.yaml`, `backend/app/lambda_handler.py` | SAM template and Lambda entry point |

## AI: Gemini first, Groq as backup, offline rules last

Nudi tries the AI services in order and skips any without a key: **Gemini** (free tier), then **Groq** (free limits), then **AWS Bedrock** (optional). If none answer, Nudi uses its own offline rules. So the demo never breaks.

The AI is used for: page summaries and choices, extra scam warnings, Ask Nudi, "Explain this", and the family weekly note.

**Human-in-the-loop, rule-based safety.** The AI only *suggests*. The payment check, scam blocking, the website trust check and the privacy filter are fixed rules the AI cannot change: it cannot approve a payment, mark a Pay button as "not a payment", or remove a rule's warning. A person always makes the final call.

## Mock mode (works with no keys)

Every outside service has a mock. With an empty `.env`:

- **AI**: a rule-based simplifier picks the main buttons, simple rules answer questions, and a small glossary explains common words
- **Voice**: the browser's built-in voice (Windows voices work offline)
- **Family voice note**: the family member's phone reads the note aloud itself
- **Storage**: a local SQLite file (`backend/nudi.db`)

The domain age check uses the free RDAP service and needs internet. Offline, Nudi says "I couldn't check how old this website is".

---

## Run it

You need **Python 3.11+**, **Node 18+** and **Google Chrome 116+**.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
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
4. Pin Nudi to the toolbar. Clicking it (or **Alt+Shift+N**) opens Nudi in the side panel.

### 3. Try the demo

**Normal bill page**: http://localhost:8787/demo/
1. Open Nudi. The verdict says **Be careful on this page** (fake timer, pre-ticked extra). The website itself scores 100/100.
2. Tap **Show me where it is** under Pay. The page dims and the real PAY button glows.
3. Under **Things to watch out for**, tap **Remove it for me**. The ₹99 extra is removed, and the total becomes ₹1,240.
4. Tap **How much do I pay?**. Nudi answers "The total to pay is ₹1,240".
5. Tap **Pay**. The **Check before you pay** dialog shows ₹1,240 in large text. **No, do not pay** is the default.

**Scam lookalike**: http://localhost:8787/demo/bescom-scam.html (pretends to be `bescom-bill-pay-offer.co`, 9 days old)
1. Nudi says **This website looks like a scam**, trust score 0/100, with the reasons.
2. Tap Pay (in Nudi or on the page). **Nudi stopped this payment**, and there is no "Yes" button.

**Family Link** (the full story):
1. In the side panel, scroll to **Family** and tap **Connect family**. A 6-digit code appears.
2. On a phone or a second browser window, open the dashboard (see below), type a name and the code, and tap **Connect**.
3. Nudi asks **"Sushant wants to connect. Allow?"**. Tap **Allow**. The header shows **Sharing with family: ON**.
4. On the scam page tap Pay, then **Ask Sushant first**. Nudi shows and says **"Waiting for Sushant…"**.
5. The dashboard shows the request: amount, website, Nudi's reasons, **Play voice note**, **Approve** / **Block**.
6. Tap **Block**. Nudi says **"Sushant said no… No money was spent."** The dashboard's weekly strip shows the payment stopped and the money saved.

**Dashboard on a phone (same Wi-Fi)**: start the backend so other devices can reach it, then open `http://<your-laptop-IP>:8787/dashboard/` on the phone. Find the IP with `ipconfig` (IPv4 Address). Windows may ask to allow Python through the firewall: allow it for **Private** networks.

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8787
```

Or use a second browser window on the laptop: http://localhost:8787/dashboard/

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
| Gemini | `GEMINI_API_KEY`, optional `GEMINI_MODEL` | Key from https://aistudio.google.com/apikey. Default model `gemini-3.5-flash-lite`; check which models your free tier includes. |
| Groq | `GROQ_API_KEY`, optional `GROQ_MODEL` | Key from https://console.groq.com/keys. Default model `openai/gpt-oss-20b`; check your limits at console.groq.com/settings/limits. |
| Order | `AI_ORDER` | Default `gemini,groq,bedrock`. |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, **or** `AWS_BEARER_TOKEN_BEDROCK`; `AWS_REGION`; `BEDROCK_MODEL_ID` | Uses the Converse API. In the US use `us.anthropic.claude-haiku-5-5`; from Mumbai use `global.anthropic.claude-haiku-5-5`. Turn on model access in the Bedrock console first. |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, optional `ELEVENLABS_MODEL_ID` | Default model `eleven_v4_turbo`. Pick a voice ID from your Voice Library. Also makes the family voice notes. |

If a real service fails at runtime, Nudi quietly falls back to mock mode, so the demo keeps running.

---

## Deploy to AWS

Runs the backend on **AWS Lambda** behind **API Gateway**, with **DynamoDB** for Family Link and optional **Bedrock**. Defined in `template.yaml` (AWS SAM).

**Region: `ap-south-1` (Mumbai)**, close to users in India. Claude Haiku is not hosted in Mumbai itself, but it can be called from Mumbai through the **global inference profile** `global.anthropic.claude-haiku-5-5` (the template's default). Requests may be served from another AWS region; if that is not acceptable, set `BedrockModelId` to empty to use the mock AI.

### You need
- An AWS account, the **AWS CLI** (run `aws configure`, region `ap-south-1`) and the **AWS SAM CLI**
- **Python 3.13** installed (the Lambda runtime), or Docker to build with `--use-container`
- Optional: Bedrock model access for Anthropic Claude Haiku (Bedrock console → Model access)

### Deploy

```powershell
python backend/scripts/copy_static.py
```

```powershell
sam build
```

```powershell
sam deploy --guided --region ap-south-1
```

Answers for `--guided`: stack name `nudi`, region `ap-south-1`, leave `ElevenLabsApiKey` empty (or paste your key: it is hidden and not stored in the repo), say **Y** to "NudiFunction has no authentication. Is this okay?" (the Family Link routes check their own tokens, and the API is rate-limited), and **Y** to save the settings. The settings file `samconfig.toml` is git-ignored because it can contain your key.

When it finishes it prints **ApiUrl** and **DashboardUrl**.

### Point the extension at AWS (one line)

In `extension/src/config.ts` set `BACKEND_URL` to the **ApiUrl**, then `npm run build` and reload the extension. The family dashboard and demo pages are served from the same address: **DashboardUrl** and `<ApiUrl>/demo/`.

```powershell
curl <ApiUrl>/health
```

### Tear it down (stop all costs)

```powershell
sam delete --stack-name nudi --region ap-south-1
```

This deletes the Lambda function, the API, the logs and the three tables (with their data).

**Costs:** with no traffic, Lambda, HTTP API and on-demand DynamoDB cost nothing. Bedrock and ElevenLabs are billed per use.

---

## Privacy

- Password, OTP, PIN, CVV, card, account, IFSC, UPI and Aadhaar fields are **skipped**. Not even their labels are sent.
- Nothing a user types is ever sent. Text boxes are described only by their hint text.
- Long numbers, card-like numbers and IFSC codes in page text become `[hidden]`, in the browser **and** again on the server.
- The address sent to the backend has no query string or `#` part (they can hold login tokens).
- **Domain check:** only the website's domain name is sent to `rdap.org` to look up its age.
- **AI:** only text that already went through the privacy filter is sent. On Gemini's **free tier, Google may use what is sent to improve its products**; for real users, use a paid tier or Bedrock.
- **"Explain this"** sends only the words you selected (up to 500 characters), with private numbers hidden.
- **Family Link** shares only: a task was started, a warning level was shown, an extra was removed (and the amount saved), a payment help request (website domain, amount, Nudi's reasons), and whether a payment was made or stopped. **Never** the pages visited, page text, or anything typed. The elder must tap **Allow** before anything is shared, sees **Sharing with family: ON**, and can pause sharing at any time.
- Family Link uses separate secret tokens for the elder and the family member. Pairing codes work once, expire after 10 minutes, and wrong guesses are limited.
- **Talk** uses Chrome's built-in speech recognition, which sends the audio to Google to turn it into text. It only listens while the Talk button is red.

## Limits (prototype)

- English only
- Scam detection is phrase-based plus the domain check (and the AI when Bedrock is on)
- The brand list in `backend/app/trust/brands.json` is short and should be checked against each brand's real websites
- Demo pages pretend to be other websites with `<meta name="nudi-demo-domain">`; this only works on localhost or the Nudi backend's own address
