/**
 * Purpose specifications for the 16 per-company prompt types.
 *
 * The prompt-customizer agent uses these specs as the "what to build" input
 * when asking Claude to generate a bespoke system prompt for a given company.
 * Each spec describes the runtime job, expected output format, and quality
 * criteria — the company-specific context (name, products, voice, etc.) is
 * layered on top by the customizer.
 *
 * Adding a new prompt_type → add a spec here. The customizer iterates over
 * these.
 */

export interface PromptPurposeSpec {
  /** Must match the prompt_type stored in meraki_admin.system_prompts. */
  prompt_type: string;
  /** One-line summary surfaced in admin UI + the meta-prompt. */
  short_description: string;
  /** Paragraph describing what the AI does when this prompt fires at runtime. */
  purpose: string;
  /** What runtime variables/inputs the AI is given when this prompt is used. */
  runtime_inputs: string[];
  /** Expected output format — JSON schema, Markdown structure, or freeform. */
  output_format: string;
  /** Quality criteria the generated system prompt must satisfy (used by critique). */
  quality_criteria: string[];
  /** Approximate word range for the generated system prompt. */
  word_range: [number, number];
}

export const PROMPT_PURPOSE_SPECS: PromptPurposeSpec[] = [
  // ---------- Nurture (1:1 channel-specific outreach) ----------
  {
    prompt_type: 'nurture_email',
    short_description: 'AI-drafted nurture emails to leads',
    purpose:
      'Drafts cold or warm nurture emails sent 1:1 to a specific lead. Goal: book a meeting or get a substantive reply. Personal, brief, single-ask.',
    runtime_inputs: [
      'Lead profile (name, role, company, recent activity)',
      'Touchpoint number in the sequence (cold #1, cold #2, warm follow-up, re-engage)',
      'Prior context (their replies, web visits, content downloads)',
    ],
    output_format:
      'JSON: { subject: string (6-9 words), body: string (under 120 words), rationale: string (one sentence) }',
    quality_criteria: [
      'Hard word cap on email body (~120 words)',
      'Forbids generic openers ("I hope this finds you well")',
      'Forbids buzzwords (synergy, leverage, revolutionary, best-in-class)',
      'Requires referencing one specific signal about THIS lead',
      'One ask per email',
      'Embeds the company\'s actual voice/tone',
    ],
    word_range: [250, 450],
  },
  {
    prompt_type: 'nurture_whatsapp',
    short_description: 'Conversational WhatsApp nurture messages',
    purpose:
      'Writes short, conversational WhatsApp messages to leads — different register from email. Friendlier, mobile-first, expects quick reply.',
    runtime_inputs: [
      'Lead profile + relationship stage',
      'Last interaction context',
      '24-hour session window status',
    ],
    output_format: 'JSON: { message: string (under 60 words), rationale: string }',
    quality_criteria: [
      'Hard cap at 60 words — WhatsApp tolerates none of the email-y length',
      'Conversational, not formal',
      'No subject line, no formal sign-off',
      'Single specific ask or question',
      'Adheres to Meta WhatsApp Business policy (no aggressive sales language)',
    ],
    word_range: [200, 400],
  },
  {
    prompt_type: 'nurture_linkedin_connection_request',
    short_description: 'LinkedIn connection request notes',
    purpose:
      'Writes the short note attached to a LinkedIn connection request — first impression, needs to feel personal and non-salesy.',
    runtime_inputs: [
      'Lead profile (title, company, mutual connections, recent posts)',
    ],
    output_format: 'String, max 300 characters (LinkedIn limit)',
    quality_criteria: [
      'Hard cap of 300 characters — exceed and the request fails to send',
      'Mentions one specific thing from the lead\'s profile (post, role, company news)',
      'Does NOT pitch or sell — connection requests are relationship openers',
      'No "huge fan", "love your work" generic openers',
      'Conversational, not desperate',
    ],
    word_range: [200, 400],
  },
  {
    prompt_type: 'nurture_linkedin_dm',
    short_description: 'LinkedIn DMs after connection accepted',
    purpose:
      'Writes the first or follow-up direct message AFTER a connection request is accepted. Slightly more leeway than the request note, but still relationship-first.',
    runtime_inputs: [
      'Lead profile',
      'Whether connection was just accepted, or this is a follow-up DM',
      'Any signals from their feed (posts they liked, content they shared)',
    ],
    output_format: 'JSON: { message: string (under 100 words), rationale: string }',
    quality_criteria: [
      'Word cap ~100 words',
      'No links in the first message (kills deliverability)',
      'Anchors to a specific signal — recent post, role change, mutual interest',
      'Soft ask only on first DM (e.g., "open to a 15-min chat next week?")',
    ],
    word_range: [200, 400],
  },
  {
    prompt_type: 'nurture_calling_agent',
    short_description: 'Live AI co-pilot during sales calls',
    purpose:
      'Acts as a real-time co-pilot for a sales rep on a live call — listens to the conversation, surfaces objections, suggests next questions, flags buying signals. Whispers in the rep\'s ear, not the customer\'s.',
    runtime_inputs: [
      'Live call transcript (rolling window)',
      'Lead profile and pre-call brief',
      'Stage in the call (opener / discovery / pitch / objection / close)',
    ],
    output_format:
      'JSON: { suggestion: string (under 25 words), trigger: "objection" | "buying_signal" | "discovery_gap" | "close_attempt", priority: "low" | "medium" | "high" }',
    quality_criteria: [
      'Suggestions are SHORT — rep needs to read at a glance mid-call',
      'Trigger label tells the rep WHY this is being surfaced',
      'No generic advice — every suggestion ties to something just said',
      'Specific to this company\'s objection playbook',
    ],
    word_range: [250, 450],
  },

  // ---------- Campaigns (1:many) ----------
  {
    prompt_type: 'your_campaign_Wa_template',
    short_description: 'WhatsApp campaign template generator (1:many)',
    purpose:
      'Generates approval-ready WhatsApp Business campaign templates — the kind sent to many leads at once with placeholder variables. Different from 1:1 nurture: must comply with Meta\'s template policy.',
    runtime_inputs: [
      'Campaign goal (lead-magnet, event invite, content drop, re-engagement)',
      'Audience segment description',
      'Variables to inject ({{1}} = first name, {{2}} = company, etc.)',
    ],
    output_format:
      'JSON: { template_name: string (snake_case), category: "marketing" | "utility", body: string with {{N}} placeholders, footer: string, button_text?: string }',
    quality_criteria: [
      'Body under 1024 chars (Meta limit)',
      'Uses {{1}}, {{2}} placeholder syntax — Meta rejects raw variable names',
      'No promotional spam language (Meta auto-rejects)',
      'Includes opt-out hint in footer (compliance)',
    ],
    word_range: [250, 450],
  },
  {
    prompt_type: 'your_campaign_Wa_template_image_prompt',
    short_description: 'Image-gen prompts for WhatsApp campaign visuals',
    purpose:
      'Writes prompts for an image generation model (DALL-E / Imagen / Midjourney) to produce visuals for WhatsApp campaign templates. The PROMPT, not the image itself.',
    runtime_inputs: [
      'Campaign theme + audience',
      'Brand colors (hex)',
      'Brand voice/visual style',
    ],
    output_format: 'JSON: { image_prompt: string, aspect_ratio: "1:1" | "16:9" | "4:5", style_notes: string }',
    quality_criteria: [
      'Image prompt is concrete: subject, action, style, lighting, color palette',
      'References the company\'s brand colors',
      'No copyrighted elements, no logos of other brands',
      'Aspect ratio matches WhatsApp template requirements (1:1 most common)',
    ],
    word_range: [200, 400],
  },

  // ---------- Lead intelligence ----------
  {
    prompt_type: 'lead_next_action_planner',
    short_description: 'Recommends the single best next action per lead',
    purpose:
      'Looks at a lead\'s full state — score, stage, history, signals — and recommends the SINGLE next action the rep or the AI should take. Not a generic suggestion list; one decision.',
    runtime_inputs: [
      'Lead profile + score + stage',
      'Recent engagement history (last 5–10 touchpoints)',
      'Any active deal or opportunity context',
    ],
    output_format:
      'JSON: { next_action: string (concrete: "Send WhatsApp re-engagement message about pricing"), channel: string, urgency: "today" | "this_week" | "next_week", rationale: string (one sentence), expected_outcome: string }',
    quality_criteria: [
      'next_action is concrete — channel + content theme + asset (no "follow up")',
      'urgency is justified by signals',
      'rationale ties to specific recent activity',
      'expected_outcome sets a measurable bar (e.g., "reply within 48h")',
    ],
    word_range: [250, 450],
  },
  {
    prompt_type: 'lead_call_analysis',
    short_description: 'Post-call analysis: coaching, sentiment, next steps',
    purpose:
      'Analyses a finished sales call — gives the rep a coaching summary (what went well, what didn\'t), captures next steps, and produces a draft follow-up email.',
    runtime_inputs: [
      'Full call transcript',
      'Lead profile + pre-call brief',
      'Rep name (for second-person coaching)',
    ],
    output_format:
      'Markdown: ## Headline ## What went well ## What to improve ## Buying signals ## Objections raised ## Action items (with owners) ## Suggested follow-up email (subject + body)',
    quality_criteria: [
      'Coaching is SPECIFIC — quotes from the transcript, not generic advice',
      'Action items have owners (rep / lead / system)',
      'Follow-up email draft is ready-to-send (no placeholders)',
      'Honest about what didn\'t work — not just praise',
    ],
    word_range: [300, 500],
  },
  {
    prompt_type: 'lead_call_preparation',
    short_description: 'Pre-call brief: opener, questions, objections',
    purpose:
      'Generates a 2-minute-readable brief for a sales rep about to call a lead. Opener, 3 best discovery questions, likely objections + handling, what good outcome looks like.',
    runtime_inputs: [
      'Lead profile (name, title, company, industry, size, location, recent signals)',
      'Engagement history',
      'Stage in the funnel',
      'Notes from previous touchpoints',
    ],
    output_format:
      'Markdown: # Call Brief — <Lead Name> @ <Company> ## Why this call matters ## Your opener (literal first line) ## 3 questions to ask ## Likely objections + how to handle ## What "good" looks like ## Watch for',
    quality_criteria: [
      'Brief is ≤ 400 words — readable in under 2 min',
      '"Your opener" commits to a literal first sentence',
      'Specific to this lead, not generic',
      'Objections come from this company\'s playbook',
    ],
    word_range: [300, 500],
  },
  {
    prompt_type: 'target_profile',
    short_description: 'Refines + expands the company\'s ICP',
    purpose:
      'Helps the founder/admin refine and expand their ideal customer profile based on data + manual feedback. Suggests adjustments, identifies adjacent segments, flags ICP drift.',
    runtime_inputs: [
      'Current target profile',
      'Lead pipeline outcomes (which segments converted, which stalled)',
      'Founder feedback notes',
    ],
    output_format:
      'JSON: { primary: { ... target profile structure ... }, suggested_variants: [...], suggested_changes: [{field, from, to, reason}] }',
    quality_criteria: [
      'Suggestions are evidence-backed — reference pipeline data',
      'Variants are meaningfully different from primary, not noise',
      'Changes specify the field + before/after',
      'Aware of this company\'s vertical conventions',
    ],
    word_range: [250, 450],
  },
  {
    prompt_type: 'product_suggestion',
    short_description: 'Matches the company\'s products to a given prospect',
    purpose:
      'Given a prospect, recommends WHICH of the company\'s products best fits their context — and explains why. Crucial for multi-product companies.',
    runtime_inputs: [
      'Prospect profile (industry, size, signals)',
      'Company\'s product catalogue with positioning',
    ],
    output_format:
      'JSON: { primary_recommendation: string, secondary?: string, reasoning: string, evidence: string[], cross_sell_path?: string }',
    quality_criteria: [
      'Recommendation is ONE product — clear lead, not a "depends" hedge',
      'Reasoning ties to the prospect\'s specific signals',
      'evidence cites at least 2 specific data points',
      'cross_sell_path is honest — only suggested if natural, not forced',
    ],
    word_range: [200, 400],
  },
  {
    prompt_type: 'account_hunting',
    short_description: 'Finds + shortlists new accounts matching the ICP',
    purpose:
      'Builds search strategies and screens candidate companies against this company\'s ICP. Output is shortlisted accounts with rationale.',
    runtime_inputs: [
      'Target profile (ICP)',
      'Sources to search (web, LinkedIn, directories)',
      'Constraints (geography, exclusions)',
    ],
    output_format:
      'JSON: { search_queries: string[], shortlisted_accounts: [{company_name, domain, why_match: string, confidence: 1-10, primary_signal: string}], excluded: [{company, reason}] }',
    quality_criteria: [
      'Search queries are SPECIFIC and use real Google/LinkedIn syntax',
      'Confidence rating per account is justified by primary_signal',
      'Excluded list is non-empty (proves the agent is filtering, not just listing)',
      'No fake/hallucinated company names',
    ],
    word_range: [250, 450],
  },
  {
    prompt_type: 'company_analysis',
    short_description: 'Account research brief for a target company',
    purpose:
      'Produces a structured one-pager about a target company — overview, products, recent news, decision-makers, fit assessment, opening angle.',
    runtime_inputs: [
      'Company name + domain',
      'Public sources (LinkedIn, website, news)',
      'This company\'s ICP (for fit assessment)',
    ],
    output_format:
      'Markdown: ## Snapshot ## What they do ## Recent news ## Decision-makers ## Fit assessment vs ICP ## Recommended opening angle ## Risks / disqualifiers',
    quality_criteria: [
      'Cites sources for every fact ("per LinkedIn", "per website")',
      'Fit assessment uses the ICP language explicitly',
      'Opening angle is concrete — not generic "reach out about pain points"',
      'Flags risks honestly (regulatory, size mismatch, etc.)',
    ],
    word_range: [300, 500],
  },
  {
    prompt_type: 'lead_deep_research',
    short_description: 'Deep dive on a single lead — context, signals, opening',
    purpose:
      'Goes deep on ONE lead (not their company — the person). Background, recent activity, signals of interest, best opening angle for this individual.',
    runtime_inputs: [
      'Lead profile (LinkedIn, name, role)',
      'Public signals (posts, content shared, news mentions)',
      'Mutual connections / shared interests',
    ],
    output_format:
      'Markdown: ## Background ## Current focus (last 90 days) ## Signals of interest ## Mutual ground ## Best opening angle ## Conversation starters (3)',
    quality_criteria: [
      'No fabricated facts about the person — every claim cites a source',
      'Signals of interest are recent (90 days) and specific',
      '3 conversation starters reference DIFFERENT angles (not 3 variations of the same thing)',
      'Opening angle is the lead\'s perspective, not the seller\'s pitch',
    ],
    word_range: [300, 500],
  },
  {
    prompt_type: 'lead_score',
    short_description: 'Scores a lead 0–100 against the company\'s framework',
    purpose:
      'Scores a single lead 0–100 with component breakdown + verdict (hot/warm/cold/disqualify). Drives pipeline triage.',
    runtime_inputs: [
      'Lead profile',
      'Engagement signals',
      'Enrichment data',
      'Funnel stage history',
    ],
    output_format:
      'JSON: { score: 0-100, components: [{name, weight, earned, reason}], verdict: "hot" | "warm" | "cold" | "disqualify", next_action: string, data_gaps: string[] }',
    quality_criteria: [
      'Each component has a one-line reason grounded in lead data',
      'Penalises missing data — doesn\'t give benefit of the doubt',
      'Hard disqualifiers (wrong industry, blocked region) score 0',
      'Verdict thresholds match this company\'s playbook (not generic BANT)',
    ],
    word_range: [250, 450],
  },
];
