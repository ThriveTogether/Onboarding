# Onboarding → MerakiPeople Testing Guide (for Account Management)

**Audience:** Account managers running guided demos with new founders.
**Goal of this test:** Confirm a founder can complete the 7-step Onboarding wizard and land in MerakiPeople **fully set up** — without manual handoffs, configuration calls, or "we'll get back to you" delays.

---

## 1. What this onboarding module does (the goal)

Until now, every new founder coming into MerakiPeople needed Team Meraki to manually:

- Set up their company profile + intelligence_data
- Configure target profiles, modules, channels, lead stages, roles
- Create company-specific AI prompts (16 of them, one per agent)
- Hunt the first batch of accounts and leads
- Generate the initial strategy docs (brand, nurture, lead scoring, knowledge base)
- Configure platform settings (timezone, auto-actions, etc.)

That was 4–8 hours of manual setup per founder, plus a series of follow-up calls.

**The new onboarding module replaces all of that with a self-service wizard:**

1. The founder walks a 15–20 minute guided flow at **`https://tie-onboarding.t2ai.live`**
2. They confirm their company info, lock a target profile, review AI-generated leads, edit message templates, and approve four strategy documents
3. When they hit **Launch**, the system **graduates** them — provisions their entire MerakiPeople workspace in the background
4. The Complete page shows them the admin sign-in URL + their email; they click through and log in with the **same password they used to sign up at onboarding** (the bridge mirrors the password hash automatically — no second registration)

By the time they sign in to `merakiadmin-staging.t2ai.ai`, they should feel like they've been a customer for weeks, not minutes.

---

## 2. Test environment

| Service | URL | Who logs in here |
|---|---|---|
| Onboarding wizard | https://tie-onboarding.t2ai.live | The founder being onboarded (signs up fresh) |
| MerakiPeople Admin | https://merakiadmin-staging.t2ai.ai | The founder, using the same email + password they used at onboarding signup |
| MerakiPeople Employee | https://merakiemployee-staging.t2ai.ai | Reps the founder adds in admin |

Each tester should use a **fresh email** (e.g. `am-test-<yourname>@example.com`) so test data stays isolated from real founders.

---

## 3. The full test flow

### Phase A — Founder onboarding (~15–20 min)

1. Open `https://tie-onboarding.t2ai.live` in a fresh browser session (incognito).
2. Click **Sign up**. Use a real-looking but fake company:
   - Email: `am-test-<yourname>+<company>@example.com`
   - Password: anything 8+ chars — **remember it, you'll use it to log into admin too**
   - Company name: e.g. *"Aurelio Diagnostics"*
   - Vertical: pick whichever fits — Manufacturing / BFSI / B2B SaaS / EdTech / etc.
3. Walk the 7 steps, paying attention to the data quality:

   | Step | What to verify |
   |---|---|
   | A1 — Welcome / company basics | Captures company name + LinkedIn or website + sales-team size |
   | A2 — Target Profile | Three AI-generated ICP variants. Pick one (or edit). Confirm reasoning makes sense |
   | A3 — Leads | ~10 leads generated. Each has a real-looking match %, decision-maker name + role, "why this account" rationale. Mark a few as **Pursue** |
   | B1 — Messaging | Cold/Warming/Hot × Email/LinkedIn/WhatsApp. Tweak any one with the sliders, save |
   | B2 — Channels & Stages | Default 5-stage funnel (Cold → Ready). Confirm score thresholds |
   | B3–B6 — Strategy docs | Approve all four (or skip): Brand Guidelines, Nurture Strategy, Lead Score Framework, Product Knowledge Base. **Optionally upload a real PDF brochure** on the Knowledge Base step to test the upload flow |
   | B7 — Preview | Shows how the AI will work for a real lead. Click through to confirm |
   | Launch | Set the 90-day metric (e.g. "Sales become 2x"), click **Launch** |

4. Watch the launch — it can take 30–60 seconds while the bridge writes to MerakiPeople.

### Phase B — Sign in to MerakiPeople admin

5. After Launch, you land on the **Complete** page with celebratory stats: account count, lead count, etc. Scroll to the bottom — you'll see a **Sign in to MerakiPeople** card with:
   - A primary button: **↗ Open MerakiPeople admin** (opens `merakiadmin-staging.t2ai.ai` in a new tab)
   - Your email displayed (with a Copy button)
   - A reminder: *"The password you set when signing up here."*

6. Click **Open MerakiPeople admin**. The admin sign-in page opens in a new tab.

7. Log in with:
   - **Email:** the same email you signed up with on onboarding
   - **Password:** the same password you set on onboarding

   The system bridges the bcrypt hash automatically when the founder graduates, so no separate registration is needed. If you mistyped at signup or forgot the password, use **Forgot password** on the admin sign-in page to reset.

### Phase C — Verify the founder's admin view (the prefit)

Inside MerakiPeople admin, click through these tabs and confirm everything is **already populated**:

| Admin tab | Expected state | What this proves |
|---|---|---|
| **Company Profile → Company Info** | Name, vertical/industry, website, intelligence_data (ICP, decision-makers, pain points) | Company overview bridged |
| **Company Profile → Roles & Responsibilities** | 11 roles with full responsibility descriptions; Marketing + Sales fields are *Selected* (others are unselected) | Roles + module fan-out works |
| **Company Profile → Knowledge Base** | 5 documents: Target Profile, Marketing & Nurture Strategy, Lead Score Framework, Brand Guidelines, Product Knowledge Base (+ uploaded brochure if you uploaded one). Each shows status **completed** | Strategy docs bridged |
| **Settings → Modules** | Lead Generation **ON**, Call Compass **ON**, all others off | Default modules enabled |
| **Settings → Channels** | Booleans match what the founder picked in onboarding (email, LinkedIn, WhatsApp, etc.) | Channel config bridged |
| **Settings → General** | Auto Lead Next Action: **ON**, Lead Research: **ON**, Time zone: **Asia/Kolkata (IST)** | Platform defaults applied |

If any of these is empty or wrong, **flag the row** with a short note + screenshot.

### Phase D — Add an employee, verify their view

This tests that the prefit data fans out to reps the founder adds later.

8. Inside MerakiPeople admin, **add a test employee**:
   - Settings → Employees → Add Employee
   - Email: `am-test-<yourname>+rep@example.com`
   - Position: e.g. *Content Marketer* (any "Marketing" role)
   - Save. The employee app sends them a welcome email with a temporary password — for the test, copy the password from your inbox or have the dev team reset it.

9. Open `https://merakiemployee-staging.t2ai.ai` in a **different browser** (incognito or another browser entirely so it doesn't conflict with the founder session).

10. Sign in as the new rep.

11. Verify the rep sees:

| Employee app tab | Expected state |
|---|---|
| **Target Profile** | The locked ICP variant the founder picked, with full description, industry, decision-makers, pain points |
| **Accounts** | The accounts that were hunted during onboarding (typically 9 unique companies grouped from the leads). Each shows match % (e.g. "87.0%", **not** "8700%"), industry, location, and links back to the Target Profile |
| **Leads** | Every lead from onboarding (~10–16 leads). Each links to its account and shows decision-maker info |
| **Home / dashboard** | Lead Generation + Call Compass module tiles visible |

> **Heads up:** If the founder added the employee AFTER onboarding completed, the rep might not see the bridged data automatically. In that case, ask the dev team to re-run the bridge once via:
> ```
> POST https://tie-onboarding.t2ai.live/api/onboarding/company/<company-id>/graduate
> ```

### Phase E — Sanity checks (what would break a real customer)

Now stress-test the founder's experience:

- **Edit a strategy doc** in admin Knowledge Base — does the change save?
- **Move a lead** through the funnel (Cold → Warming → Warm) in the Lead Gen module — does the stage update?
- **Send a test message** from the rep's lead view — does the channel config respect the founder's choices?
- **Re-launch onboarding** with the same email — does it resume mid-flow correctly, or does it bounce you to the Complete page?
- **Refresh** the Onboarding URL after Launch — does it land you back on the Complete page (with the sign-in card visible)?

---

## 4. Sign-off checklist

Tester: _________________________ Date: _________________

- [ ] Wizard completed end-to-end without errors
- [ ] Launch returned within 60 seconds
- [ ] Complete page shows the **Sign in to MerakiPeople** card with email + URL
- [ ] **Open MerakiPeople admin** button opens the admin sign-in page in a new tab
- [ ] Logged into admin with onboarding email + password (no second registration needed)
- [ ] Company Profile → Company Info populated
- [ ] Company Profile → Roles & Responsibilities populated (11 roles, Marketing + Sales selected)
- [ ] Company Profile → Knowledge Base shows 5 documents (or 6 with uploaded brochure)
- [ ] Settings → Modules: Lead Gen + Call Compass ON
- [ ] Settings → Channels: matches onboarding choices
- [ ] Settings → General: Auto Next Action ON, Lead Research ON, Time zone IST
- [ ] Added a test employee successfully
- [ ] Employee sees Target Profile
- [ ] Employee sees Accounts (with match % displayed correctly, e.g. "87.0%" not "8700%")
- [ ] Employee sees Leads, each linked to its account
- [ ] Edit-doc / move-lead sanity checks passed
- [ ] Resume / refresh from Onboarding URL behaves correctly

---

## 5. Reporting bugs

For each issue:

1. **Step number** (e.g. "Phase D, step 11 — Accounts tab")
2. **What you expected** (e.g. "9 accounts")
3. **What you saw** (e.g. "Empty list, error toast: 'Couldn't fetch accounts'")
4. **Screenshot** (browser DevTools Network tab if it's an API error)
5. **Email + company name** of the test founder you used (so dev can repro)

File these in the team Slack channel `#meraki-onboarding-test` or as GitHub issues on `ThriveTogether/Onboarding`.

---

## 6. What's still pending (don't flag these as bugs)

These are known and being tracked separately:

- **Bulk Batch Jobs page** in admin — pre-existing tenant-leak (admin sees other tenants' data). Fix is already in `meraki-admin-app` `main`; deploys with the next pipeline run.
- **"Add Employee → auto-bridge"** is not yet wired — when an admin adds a new rep AFTER the founder graduated, the bridge needs to be re-run manually for the new rep to see prefit data. The fix is to hook the bridge call into the admin's Add-Employee flow; not yet done.
- **Account brochure → vector embedding** — the uploaded brochure shows in Knowledge Base list but isn't yet indexed in Pinecone. Vectorization is async and runs on first AI use.

---

## 7. Quick reference: key URLs + creds

| | URL | Credentials |
|---|---|---|
| Onboarding wizard | https://tie-onboarding.t2ai.live | Sign up fresh per tester |
| Admin (founder logs in here) | https://merakiadmin-staging.t2ai.ai | Same email + password used on onboarding signup |
| Employee (rep logs in) | https://merakiemployee-staging.t2ai.ai | Use email from "Add Employee" + password from welcome email |

---

**Questions during testing → ping the dev team in `#meraki-onboarding-test`. Have fun breaking it.**
