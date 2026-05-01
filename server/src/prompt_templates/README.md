# Prompt Templates — runtime per-company system prompts

These templates power the **16 per-company AI features** in Meraki (nurture, calling, lead-gen, campaigns). One template per `prompt_type`. After a company is onboarded, the seeder reads these YAMLs, interpolates company-specific variables, and writes one row per prompt_type into `system_prompts` (MongoDB) scoped by `company_id`.

At runtime, services like `meraki-call-compass` and `meraki-sales-mcp` fetch the per-company prompt via the existing `system_prompts` collection.

> Distinct from `server/src/prompts/` — those are onboarding-time prompts that *generate* the 6 strategy docs once. These are runtime prompts that drive features after launch, scoped per company.

## Layout

```
prompt_templates/
  base/                   # default template per prompt_type (16 total when complete)
    nurture_email.yaml
    lead_call_preparation.yaml
    lead_score.yaml
    ...
  verticals/              # vertical-specific overrides — created only when needed
    manufacturing/
    bfsi/
    hr_recruitment/
    b2b_services/
    b2b_saas/
    edtech_b2c/
    other/
```

If a vertical override exists for a `prompt_type`, the seeder uses it. Otherwise it falls back to `base/`.

## Template schema

```yaml
prompt_type: <string>            # matches Meraki SuperAdmin's PROMPT_TYPE_DISPLAY map
template_version: "1.0"          # bump when the template materially changes
description: <string>            # one-line; surfaced in admin UI
required_variables: [<string>]   # missing any → seeding fails for this prompt
optional_variables: [<string>]   # missing → replaced with empty string
prompt: |                        # interpolated and stored as the company's system prompt
  <multi-line content with {{VARIABLE}} placeholders>
notes_for_authors: |             # human-only — not interpolated, not stored
  <context for whoever maintains this template>
```

## Variable interpolation

Use `{{VARIABLE_NAME}}`. The seeder replaces every occurrence with the value from the context map built from `OnboardingCompany` + the 6 generated `OnboardingDoc`s.

| Variable | Source |
|---|---|
| `COMPANY_NAME` | `OnboardingCompany.companyName` |
| `INDUSTRY` | derived from `vertical` (display name) |
| `WEBSITE` | `OnboardingCompany.websiteUrl` |
| `PRODUCTS_LIST` | `OnboardingDoc[knowledge-base].productsServices[]` |
| `ICP_DESCRIPTION` | `OnboardingCompany.targetProfile` (joined) + `OnboardingDoc[knowledge-base].targetMarket` |
| `BRAND_TONE` | `OnboardingDoc[brand-guidelines]` content |
| `COMMON_OBJECTIONS` | `OnboardingDoc[knowledge-base].commonObjections[]` |
| `COMPETITORS` | `OnboardingDoc[knowledge-base].competitors[]` |
| `PAIN_POINTS` | `OnboardingCompany.targetProfile.painSignals[]` |
| `SCORING_CRITERIA` | `OnboardingDoc[scoring-framework]` content |
| `CALL_SCRIPTS` | `OnboardingDoc[nurture-strategy]` (channel: voice section) |
| `DISCOVERY_QUESTIONS` | `OnboardingDoc[nurture-strategy]` (questions section) |

## Maintenance

- Edit a `.yaml` and bump `template_version`.
- Existing companies keep their previous version unless reseeded.
- Test changes via the in-app preview at `/app/prompt-templates` before rolling out to live companies.
