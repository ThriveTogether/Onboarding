# MerakiPeople Onboarding Module

Founder + sales-rep onboarding module built on the **MerakiPeople Design System**.
Implements the JTBD / User Journeys / PRD spec in `docs/` — Phase A (Get Me Selling),
Phase B (Make My AI Smart), rep first-login Morning Playbook, re-engagement nudges,
doc versioning with impact analysis.

## Stack
- **Client** — React 18 + Vite + TypeScript. Styled with the design system's
  `colors_and_type.css` (CSS custom properties), Outfit variable font, Lucide icons.
- **Server** — Node.js + Express + TypeScript + Mongoose.
- **AI** — Anthropic Claude for doc generation (5 agents), YAML-templated prompts.

## Running locally

```bash
# 1. Install deps
npm install

# 2. Configure env
cp server/.env.example server/.env
# set ANTHROPIC_API_KEY and MONGODB_URI in server/.env

# 3. Run dev (client on :3000, server on :5001)
npm run dev
```

## Structure

```
client/                    React + Vite
  src/
    styles/
      colors_and_type.css  Design system tokens (imported from MerakiPeople DS)
    assets/fonts/          Outfit variable font
    components/            DS primitives (Button, Input, Card, Badge, ...)
    pages/                 Onboarding + Rep pages
    contexts/              OnboardingContext
    api/                   Server API client
server/                    Express
  src/
    models/                Mongoose models
    services/
      onboarding/          Research, profile prediction, lead gen, doc gen,
                           nudges, impact analysis, funnel tracking
      ai/                  Claude client + agent orchestrator
    prompts/               YAML prompt templates for the 5 doc agents
    routes/                /api/onboarding/*
```

## Design System

The client imports `src/styles/colors_and_type.css` globally. All UI uses DS tokens
(`--mp-indigo`, `--mp-coral`, `--mp-cloud`, type scale, spacing, radii, shadows).
No Tailwind, no ad-hoc color values. See the DS handoff bundle for the full palette,
type scale, and preview pages.
