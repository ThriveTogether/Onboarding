# Local end-to-end: onboarding → graduation → SSO into MerakiPeople admin

This is a one-time setup guide to run the full handoff loop on your laptop:

```
[onboarding client :3000]            [admin app :5173]
        │                                  ▲
        │ /api proxy                       │ navigate to /sso#token=
        ▼                                  │
[onboarding server :5001]  ───────►  [MerakiBackend :5000]
        │                                  │
        └──── meraki_admin DB ─────────────┘
                       (same local Mongo)
```

---

## 0. Prerequisites

- **Node 20+** and **Python 3.11+**
- **MongoDB** running locally on `mongodb://localhost:27017` (Atlas works too — just substitute the URI in step 2)
- A copy of all four repos checked out side-by-side under `MerakiPeople Code/`:
  - `Onboarding/`
  - `MerakiBackend/`
  - `meraki-admin-app/`
  - (You won't need others for the handoff loop)

If you don't have local Mongo, the fastest option is Docker:

```bash
docker run -d --name meraki-mongo -p 27017:27017 mongo:7
```

---

## 1. Generate the shared SSO secret

The onboarding server signs the handoff JWT with this secret; MerakiBackend verifies with the **same value**. Anything goes as long as it's identical on both sides.

```bash
# generates 64 hex chars; on Windows PowerShell use [System.Web.Security.Membership]::GeneratePassword(64,0)
openssl rand -hex 32
```

Save the output. We'll call it `<HANDOFF_SECRET>` below.

---

## 2. Configure the four `.env` files

### 2a. `Onboarding/server/.env`

```env
PORT=5001
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/meraki_onboarding

ANTHROPIC_API_KEY=sk-ant-...        # required for AI doc generation
SERPER_API_KEY=...                   # optional; lead hunt falls back to Claude

JWT_SECRET=any-dev-string

# Bridge target — same Mongo cluster, different DB
MERAKI_ADMIN_MONGODB_URI=
MERAKI_ADMIN_DB=meraki_admin

# SSO handoff
ONBOARDING_HANDOFF_SECRET=<HANDOFF_SECRET>
ONBOARDING_HANDOFF_TTL_SECONDS=120
MERAKI_ADMIN_APP_URL=http://localhost:5173
```

> Leaving `MERAKI_ADMIN_MONGODB_URI` empty makes the onboarding server reuse its own Mongo connection but write to the `meraki_admin` DB — the easiest local setup.

### 2b. `MerakiBackend/.env`

You can copy from `.env.example` then change/add:

```env
PORT=5000
FLASK_ENV=development
MONGO_URI=mongodb://localhost:27017
MONGODB_URI=mongodb://localhost:27017
DB_NAME=meraki_admin

JWT_SECRET_KEY=anything-dev

# SSO handoff — MUST MATCH the onboarding side
ONBOARDING_HANDOFF_SECRET=<HANDOFF_SECRET>

# Required by app.py boot guard. For local dev, pass any non-empty placeholder
# unless you actually want vector search / Azure storage to work — those
# features aren't on the SSO handoff path.
PINECONE_API_KEY=local-dev-placeholder
AZURE_STORAGE_CONNECTION_STRING=local-dev-placeholder
AZURE_STORAGE_CONTAINER_NAME=local-dev-placeholder

# Other keys — leave existing values from .env.example or your own
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
```

### 2c. `meraki-admin-app/.env`

```env
VITE_NODE_API_URL=http://localhost:5000/api
VITE_MCP_API_URL=http://localhost:5002/api
```

The MCP one isn't needed for SSO — leave the default unless you'll exercise lead-research features.

### 2d. `Onboarding/client` — no env file needed; the dev proxy handles it.

---

## 3. Install + start each service (4 terminals)

### Terminal 1 — onboarding (server + client together)

```bash
cd Onboarding
npm install            # only needed once
npm run dev
```

Boots client on **http://localhost:3000** and server on :5001. You should see `[env]` warnings if any required vars are missing.

### Terminal 2 — MerakiBackend (Flask)

```bash
cd MerakiBackend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Listens on **http://localhost:5000**. Boot will fail loudly if `PINECONE_API_KEY` / `AZURE_STORAGE_*` are missing — that's the placeholder env values above; the SSO route doesn't actually call those services so any non-empty string is fine.

### Terminal 3 — meraki-admin-app

```bash
cd meraki-admin-app
npm install            # only needed once
npm run dev
```

Listens on **http://localhost:5173**. Open it once now and confirm the sign-in page renders — that proves the Flask backend at :5000 is reachable.

### Terminal 4 — (optional) tail Mongo to watch the bridge fire

```bash
mongosh
> use meraki_admin
> db.companies.find().pretty()
> db.users.find({onboarding_source: 'meraki_onboarding'}).pretty()
> db.knowledgebase.find({source: 'meraki_onboarding'}).pretty()
```

---

## 4. Walk the founder flow

1. Open **http://localhost:3000** → click **Sign up** → create an account (e.g. `founder@example.com` / any password / "Acme Co" / pick a vertical).
2. Walk the wizard end-to-end — Welcome → ICP → Leads → Messaging → Channels & Stages → 4 docs → Preview → Launch. Each step is forgiving; you can skip the AI-heavy bits if you've left `ANTHROPIC_API_KEY` empty (it falls back to template content).
3. Hit **Launch**. Watch the onboarding server logs — you should see:
   ```
   [bridge] graduated company=Acme Co → meraki_admin (company_id=…, prompts seeded=16)
   ```
4. Land on the **Complete** page. After ~1 second, the **Open MerakiPeople →** button activates.

## 5. The SSO redirect itself

5. Click **Open MerakiPeople →**. The browser navigates to `http://localhost:5173/sso#token=<jwt>`.
6. The landing page reads the token from the URL hash, POSTs it to `http://localhost:5000/api/auth/sso/onboarding-handoff`, MerakiBackend verifies + issues a normal access_token, and the page routes you into `/dashboard` already logged-in.
7. From there, hit:
   - **Company Profile** — name + intelligence_data prefilled
   - **General Settings → Modules** — Lead Generation + Call Compass toggled on
   - **General Settings → Roles & Responsibilities** — Administrator / Manager / User seeded with full responsibilities arrays
   - **Settings → Channels** — booleans match what you picked in onboarding
   - **Settings → General** — auto next action ON, lead research ON, time zone IST
   - **Knowledge Base** — your 4 strategy docs + uploaded brochure as separate entries

---

## 6. Things that commonly go wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| `/sso` page errors with "Token expired" | TTL is 120s and you sat on Complete page > 2 min | Click **Open MerakiPeople →** again — the page re-mints the token |
| `/sso` says "SSO handoff not configured on this server" | `ONBOARDING_HANDOFF_SECRET` not set in MerakiBackend `.env` | Set it, restart Flask |
| `/sso` says "Token signature invalid" | Different secrets in onboarding vs MerakiBackend | Make sure they're literally identical |
| Complete page never enables the button | `ONBOARDING_HANDOFF_SECRET` or `MERAKI_ADMIN_APP_URL` missing on the onboarding side | Set both in `Onboarding/server/.env`, restart `npm run dev` |
| `/sso` succeeds but lands on `/signin` | The user account was created the normal way (with a password), not via graduation. The SSO route refuses non-SSO accounts as a security gate | Sign up fresh in onboarding, walk to Launch, then try SSO |
| MerakiBackend won't boot — "PINECONE_API_KEY is not set" | `.env` missing the boot-guard env vars | Set all three placeholders in step 2b — they don't have to be real |
| Admin app shows blank page after redirect | Open DevTools → Console. Likely a CORS error from MerakiBackend | MerakiBackend `app.py` has `CORS(app)` — should already be permissive in dev |

---

## 7. To re-run the bridge without resetting onboarding state

```bash
# Get the OnboardingCompany _id (e.g. from the Mongo shell, db.onboardingcompanies.findOne())
curl -X POST http://localhost:5001/api/onboarding/company/<companyId>/graduate
```

Idempotent — won't dupe anything. Useful when iterating on the bridge code.

## 8. To wipe a test founder and start over

```bash
cd Onboarding/server
npx tsx scripts/cleanup-user.ts --query "founder@example.com" --delete
```

Drops the onboarding rows; combine with `MERAKI_ADMIN_MONGODB_URI=mongodb://localhost:27017 MERAKI_ADMIN_DB=meraki_admin` to also sweep the bridged meraki_admin records (the script handles both).
