# Career247 Growth OS — Change Log

Every change made from the moment we adopted **Career247 Growth OS (powered by MerakiPeople)** as the product brand. Earlier work (the original 7-step wizard, Phase A discovery, Serper integration, etc.) is captured upstream — this doc starts where the rebrand began.

---

## 0 · Brand transition: MerakiPeople → Career247 Growth OS

**Why**: Career247 is the parent company; Growth OS is the founder-facing product name; MerakiPeople remains the engine reference ("powered by MerakiPeople").

### Logo + identity
- **`Logo.tsx`** rewritten as inline SVG matching the Career247 wordmark from the supplied logo image:
  - "Career" in deep navy `#1A2961`, "247" in a rounded outlined badge `#2FB7F5` with a vertical separator between `24` and `7`
  - Optional `showTagline` prop renders *"An AddaEducation Company"* with a coral "A" in Adda
  - `light` variant for white surfaces, `dark` (white "Career") for navy surfaces (sidebar)
- **`BrandTag.tsx`** — new persistent identity pill mounted globally in `App.tsx`, fixed top-left of every authenticated screen:
  > [Career247 logo] · **Growth OS** · *powered by **MerakiPeople***
- Sidebar (`AppShell`) now shows the logo + "GROWTH OS" overline + "powered by MerakiPeople" subtext

### Copy swaps
- Browser tab title: `Career247 Growth OS — Onboarding`
- Welcome heading: *"Welcome to Career247 Growth OS."*
- Login footer: *"New to Career247 Growth OS?"*
- Complete-page CTA was *"Open Career247 Growth OS dashboard →"* (later changed — see §11)
- Every disclaimer / banner / locked-email tooltip refers to the **"Career247 Growth OS platform"** instead of MerakiPeople

---

## 1 · Account-first lead card

The leads-list card was contact-first; redesigned to be account-first since founders evaluate accounts, not contacts.

### Layout (top → bottom)
- **ACCOUNT BLOCK** (above horizontal rule):
  - Company name in large bold + city
  - Industry + sub-industry chips
  - Match % pill (right side)
  - Verified website link
  - One-line company description (soft gray bubble)
  - **"WHY THIS ACCOUNT"** rationale
- **DECISION-MAKER BLOCK** (below the rule):
  - Coral overline *"Likely decision-maker"* + Users icon
  - Contact name + title
  - Source citation: *"Found on 💼 LinkedIn"* (clickable to actual profile) OR honest *"AI-suggested role profile — no public LinkedIn match yet."*
  - **"WHY THIS ROLE"** rationale (why this title is the decision-maker)
  - 🔒 *Verified email — Deep Research (in platform)* locked pill
  - **"OPENING ANGLE"** suggested first move

### Honesty fix
- Stopped generating fake `firstname.lastname@domain` emails — `contactEmail` is now empty server-side; UI shows the locked pill instead
- Disclaimer banner rewritten to clearly state what's verified (companies, websites, LinkedIn) vs AI-suggested (names, titles, opening angles)

**Files**: `OnboardingLeadsPage.tsx`, `serperLeadHunter.ts`, `app.css` (mp-lead-card--account, mp-lead-card__contact, etc.)

---

## 2 · Per-channel message templates (Phase B step 1)

New wizard step between leads and docs: founder drafts the AI's first messages.

### New page: `/onboarding/messaging/:id`
- **Stage tiles** (top): Cold / Warming / Hot — clickable, show `N/3` saved-channels count
- **Channel tabs**: Email · LinkedIn · WhatsApp (per stage)
- **Controls** (initially segmented buttons, later upgraded — see §10):
  - Length: Tight ↔ Balanced ↔ Detailed
  - Tone: Direct ↔ Balanced ↔ Empathetic
  - Formality: Casual ↔ Professional ↔ Formal
- **Re-draft** button calls Claude with the chosen knobs
- **Subject + body editor** — char counter for LinkedIn (≤300)
- "Why this works" rationale callout from Claude
- "Edited by you" pill when user changes anything
- Save / Discard + re-draft buttons

### Backend
- **`OnboardingCompany.messageTemplates[]`** — `{ stage, channel, subject, body, length, tone, formality, edited, updatedAt }`
- **`OnboardingCompany.preferredChannels[]`** — auto-derived on Next click
- **`POST /company/:id/draft-message`** — Claude with channel-specific rules (LinkedIn ≤300 chars, email subject required, WhatsApp short + warm)
- **`PUT /company/:id/message-templates`** — upsert by (stage, channel) pair
- **`PUT /company/:id/preferred-channels`** — saves which channels were used

Drafts use placeholders (`<FirstName>`, `<CompanyName>`, `<YourName>`) — true templates, but Claude is given a real "pursue" lead as context for realism.

**Files**: `OnboardingMessagingPage.tsx`, `messageDrafter.ts`, `OnboardingCompany.ts` schema additions

---

## 3 · Channel + stage config (Phase B step 2)

New wizard step: confirm channel preferences per stage + score thresholds.

### New page: `/onboarding/channels-stages/:id`
5-row table:

| Stage | Score range | Channels |
|-------|-------------|----------|
| ❄ Cold · *AI starts the conversation* | `0–35` | [Email] [LinkedIn] |
| ⚡ Warming · *They opened / clicked* | `36–50` | [Email] [LinkedIn] |
| ⭐ Warm · *Active replies, real interest* | `51–75` | [Email] [WhatsApp] |
| 🔥 Hot · *Pricing / timeline questions* | `76–90` | [WhatsApp] [Calling] |
| ✅ Ready · *Rep takes the meeting* | `91–100` | [Calling] |

- Channel chips toggle (multi-select)
- Score range = two number inputs per stage with **non-overlap validation**
- Hydrates from `preferredChannels` saved during Messaging step

### Backend
- **`OnboardingCompany.channelStrategy: { cold, warming, warm, hot, ready }`**
- **`OnboardingCompany.stageThresholds: { cold: [0,35], … }`**
- **`PUT /company/:id/channel-stages`** — saves both atomically + stamps `channelsConfiguredAt`

**Files**: `OnboardingChannelStagePage.tsx`, schema + route additions

---

## 4 · Brand Guidelines auto-extraction

Brand-voice doc now ingests **real** brand identity, not generated placeholders.

### `brandExtractor.ts` (new service)
- **Logo via Clearbit**: `https://logo.clearbit.com/<domain>?size=256` — no API key, just URL composition. Frontend has graceful `onError` fallback.
- **Colors via HTML scrape**:
  1. `<meta name="theme-color">` (heavy weight)
  2. `msapplication-TileColor`
  3. All hex codes in inline `<style>`, frequency-ranked
  4. Filters near-white / near-black / near-gray, dedupes by perceptual distance > 60
  5. Returns up to 3 unique brand colors

### Doc generator changes (`docGenerators.ts`)
- Brand-guidelines generation now passes `MESSAGE_TEMPLATES_JSON` + `CHANNEL_STRATEGY_JSON` to Claude — voice grounds in actual templates the founder edited
- After generation: `extractBranding(websiteUrl)` injects `logoUrl + brandColors` into `parsed.branding`
- Replaces fabricated `samples.coldWhatsApp` placeholder with `savedMessageSamples` (cold/warming/hot from messageTemplates)

### Renderer (`BrandGuidelinesRenderer`)
- New top section "Brand identity": company logo in 120×120 framed box + colour swatches with role labels (Primary / Secondary / Accent) + hex codes
- "Sample messages" section reads from `savedMessageSamples` — labeled e.g. *"Cold · Email"*, *"Warming · LinkedIn"*, *"Hot · WhatsApp"*

---

## 5 · Nurture flow diagram

Replaced text-heavy stage panels with an interactive swim-lane board.

### `NurtureFlowDiagram.tsx` (new component)
- **5 stage columns** connected by `→` arrows
- Each column = a lane with stage colour border-top
- **Touch cards** within each lane: channel icon, day number, channel label
- Wait connectors between cards: dashed pill `🕐 2d`
- Click any card → opens the saved message template inline below the diagram with channel + stage label, subject (for emails), body in quoted bubble
- **Amber pause callout** at the bottom: *"If no reply after 3 cold touches: pause + re-engage in 30 days."*

### Server-side (`docGenerators.ts`)
- Nurture-strategy generation injects `channelStrategy + stageThresholds + messageTemplates` into the doc content so the renderer is self-sufficient

---

## 6 · Lead scoring framework as tables

Replaced themed cards with proper tables.

### Layout
1. **"How this works" callout** (kept)
2. **Category weights bar** (kept) + 4-card legend with one-line explanations
3. **Signal catalogue table**: Category · Signal · Weight (sorted by category, then weight). Coloured category dot, ± weights in green/red.
4. **Stage progression table**: Stage · Score · What happens · Channels. Each row has a 3px coloured left-border matching the stage. Channel chips pull from `channelStrategy`.
5. **Red-flag signals** + **AI rationale** (collapsibles)

### Server-side
- `docGenerators.ts` injects `channelStrategy` + overrides Claude's `stages` with founder-confirmed `stageThresholds` so the table is always authoritative

---

## 7 · Product catalogue upload

Knowledge base is now upload-first — founder uploads their real source material.

### `CatalogueUploader.tsx` (new component)
**Two states**:
- **Pre-upload**: indigo "We see you might sell:" callout with detected product chips + drop zone (PDF / DOCX / TXT / MD, max 20 MB) + "PPT support coming soon" hint
- **Post-upload**: green-tinted card with ✓ + filename + metadata + Replace button + extracted-text preview

### Backend
- **multer** in-memory storage (no temp files), 20 MB cap
- **`catalogueParser.ts`** service: pdf-parse v2 (`PDFParse.getText()`) + mammoth + utf-8 fallback. PPTX returns clear "export as PDF" error.
- **`POST /company/:id/product-catalogue`** route — parses, stores `doc.content.uploadedCatalogue` ({ filename, sizeBytes, format, pageCount, text, truncated, uploadedAt }), auto-marks doc approved
- Generator no longer auto-approves knowledge_base — waits for upload (status `ready_for_review`)

**Files**: `catalogueParser.ts`, `CatalogueUploader.tsx`, route additions

---

## 8 · Resume-from-anywhere

Founder can log out mid-flow and pick up exactly where they left off, on any device.

### New schema timestamps (`OnboardingCompany`)
- `messagingCompletedAt: Date | null`
- `channelsConfiguredAt: Date | null`
- `previewSeenAt: Date | null`

### Server-computed `resumeUrl`
`computeResumeUrl(company, docs, leadCount)` walks every wizard step in order, returns the first one that hasn't been completed:
1. No company → `/onboarding`
2. Target profile not locked → `/onboarding/profile/:id`
3. Zero leads → `/onboarding/leads/:id`
4. No saved message templates → `/onboarding/messaging/:id`
5. No `channelsConfiguredAt` → `/onboarding/channels-stages/:id`
6. Not all 4 reviewable docs resolved → `/onboarding/docs/:id`
7. No `previewSeenAt` → `/onboarding/preview/:id`
8. Phase not complete → `/onboarding/launch/:id`
9. Phase complete → `/app/target-profile`

### Client wiring
- `/state` endpoint returns `resumeUrl`
- `OnboardingContext` exposes `resumeUrl`
- `RootRouter` + `ResumeRouter` simplified to `<Navigate to={resumeUrl} replace />`
- **Welcome page resume guard**: bounces forward if `company.companyName + vertical` exist and `resumeUrl !== '/onboarding'`
- **`POST /company/:id/mark-preview-seen`** stamps the timestamp when user lands on preview page

---

## 9 · Preview page (`/onboarding/preview/:id`)

New step between docs and launch — *"See your AI in action"*.

### Two sections (initial version)
1. **How Career247 Growth OS works** — 5 horizontal step cards (Find / Score / Reach / Nurture / Hand off) with arrows between
2. **See it on a real lead** — pick a "pursue" lead via chips, vertical day-by-day timeline shows the AI's plan with channel icons + stage colours + wait connectors

### Deck-inspired redesign (later iteration)
After reading the MerakiPeople sales deck PDF, the "How it works" section was rebuilt with three deck-style sections:

**THE PLAYBOOK** — numbered 7-stage process (expanded from 5 — see §12):
```
01 FIND · Real companies, not lists
02 SCORE · Categorise before you act
03 REACH · Reference their world, not yours
04 NURTURE · Right message, right time
05 HAND OFF · Rep takes the call — warm, not cold
06 COACH · Real-time + post-call
07 IMPROVE · Practice on simulated leads
```
Big 38px bold numerals in stage colour, italic taglines, 1-line body.

**THE TRANSFORMATION** — paired Before → After rows (see §12)

**WHAT CHANGES FOR YOU** — 4 big-numeral outcome metrics (100×, 6 wks, 47%, 70%) pulled from the deck

Section structure follows the deck's signature pattern: coral uppercase overline + bold navy 26px title + muted lede paragraph + content card.

---

## 10 · Sliding controls + prettier brochure extract

### Message controls upgraded to colour-gradient sliders
- Three sliders for Length / Tone / Formality
- Coloured gradient track per axis (Length: blue→purple→coral; Tone: coral→orange→green; Formality: orange→blue→navy)
- Animated 24px indigo thumb with `left` transition
- **Three ways to interact** (after the user reported clicks weren't registering):
  1. Click any pole label (padded button hit-area)
  2. Click anywhere on the colored track
  3. Click + drag the thumb (native browser drag UX via invisible `<input type="range">` overlay)

### Brochure extract prettified
Replaced the raw monospace `<pre>` with a real document view:
- Auto-detects headings (ALL CAPS or short capitalised lines) → renders as `<h4>`
- Auto-detects bullet lines (`•`, `-`, `*`) → real `<ul>`
- Blank lines between paragraphs → real spacing
- Shows first ~1500 chars with **"Show full extract"** toggle

---

## 11 · Nurture upgrade — condensed + uploadable

### Condensed renderer
- Verbose stage-detail panels removed
- 3-card compact summary (one card per stage with channel chips + cadence + tone)
- Long-form prose tucked behind a single **"See the long-form playbook"** disclosure
- AI rationale stays as magic-themed collapsible

### Upload existing playbook
- New **"Upload existing playbook"** button in nurture doc header
- Accepts PDF / DOCX / TXT / MD
- **`POST /company/:id/docs/nurture/upload`** — parses with catalogue parser, then Claude maps prose → structured nurture_strategy JSON shape
- Original AI-generated content replaced with founder's actual playbook
- Channel strategy + saved templates preserved

---

## 12 · Post-handoff stages + paired transformations + lede fix

User pushed back: *"there is no Handoff — Meraki then records the calls coaches while the rep calls, provides call analysis and tutorials and also does Simulated AI Sales Coaching"*

### Lede copy
~~*"Two short looks before launch — how the system works overall, and exactly what happens for one of your real leads."*~~
→ *"A quick preview before you go live. First, how the system works end-to-end. Then, exactly what it'll do for one of your real leads."*

### Playbook expanded 5 → 7 stages
- Added **06 COACH** (Headphones icon, blue) — *"Real-time + post-call"* — AI listens, prompts on objections live, grades the call afterward
- Added **07 IMPROVE** (GraduationCap icon, amber) — *"Practice on simulated leads"* — between live calls, reps practice on AI-simulated leads tuned to their weak spots

Section subtitle now: *"Stages 1–4 run on autopilot. Stage 5 is your rep — but they're never alone: Stages 6 + 7 are AI coaching during and after the call, plus simulated practice between calls."*

### BEFORE / AFTER redesigned as paired transformations
Old: two parallel columns of plain text rows.
New: each row is a **paired transformation** with:
- **Coral uppercase category** label (Speed / Context / Cadence / Coaching / Practice / Recovery)
- **Red ✗ circle** + before pain (coral-tinted bubble, muted text)
- **Indigo `→` arrow** in the middle (rotates 90° on mobile)
- **Green ✓ circle** + after win (indigo-tinted bubble, bold text)

Six pairs now (added Practice row about simulated AI coaching).

---

## 13 · Rep invite cards + final CTA

### Rep invites — one card per rep
Old: ugly mash-up of `email: http://...` strings on one line.
New: per-rep card with:
- **Avatar circle** (first letter, indigo background)
- **Email** prominently at the top
- **Read-only URL field** (click to select, monospace font)
- **📋 Copy** button — uses `navigator.clipboard.writeText`, swaps to *"✓ Copied"* for 2s, falls back to manual select+execCommand
- **✉ Email** button (primary indigo) — `mailto:` with pre-filled subject + body containing the invite link

### Final CTA
~~*"Open Career247 Growth OS dashboard →"*~~ → **"Open MerakiPeople →"** (the destination after onboarding is the parent platform)

**Files**: `OnboardingCompletePage.tsx`, `app.css` (mp-rep-invite, mp-rep-invite__btn)

---

## 14 · Repository setup

Project copied to a standalone location: `C:\Users\ahams\OneDrive\Documents\Claude\Projects\MerakiPeople-Onboarding`

- **112 files / 921 KB** copied via robocopy
- Excluded: `node_modules`, `dist`, `.vite`, `.turbo`, `build`, `.next`, log files
- `.env` (with Anthropic + Serper API keys) preserved — and correctly ignored by `.gitignore`
- **Git initialised** at the new location, branch `master`, **111 trackable files**, no commits yet
- Original folder at `C:\Users\ahams\OneDrive\Documents\MerakiPeople-Onboarding` left intact (with `node_modules`)

---

## Wizard flow — final shape

```
Welcome (A1)
  ↓
Profile / ICP candidates (A2)
  ↓
Leads + feedback (A3)
  ↓
Messaging — 3 stages × 3 channels with sliders (B1)
  ↓
Channels & Stages — 5-stage funnel config (B2)
  ↓
Strategy docs — 4 reviewable (Nurture / Scoring / Brand / Product Knowledge) (B3-B6)
  ↓
Preview — How it works + Lead timeline (B7)
  ↓
Launch — invite reps, hit go
  ↓
Complete — sales engine live
```

Total: 7 numbered steps in the wizard. Resume-from-anywhere works at every step boundary.
