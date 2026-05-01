import { Types } from 'mongoose';
import { OnboardingCompany } from '../../models/OnboardingCompany';
import { OnboardingDoc } from '../../models/OnboardingDoc';
import { MerakiCompany, MerakiSystemPrompt } from './merakiAdminClient';
import { PROMPT_PURPOSE_SPECS, PromptPurposeSpec } from './promptPurposeSpecs';
import { callClaude, isAIAvailable } from '../ai/claudeClient';

/**
 * Prompt customizer — generates production-quality, company-specific system
 * prompts via Claude (with a critique loop for quality).
 *
 * Replaces the generic scaffolds the graduation step seeds. Runs idempotently
 * across re-invocations: only overwrites prompts that were auto-seeded by
 * meraki_onboarding (seeded_by === 'meraki_onboarding'). Founder-edited
 * prompts are left alone.
 *
 * Workflow per prompt_type:
 *   1. Generator pass — Claude writes v1 grounded in the company's full context
 *   2. Critic pass    — Claude scores v1 against the spec's quality criteria
 *   3. If verdict=fail and rounds < MAX_ROUNDS, regenerate with the critic's feedback
 *   4. Write the final prompt to meraki_admin.system_prompts
 *
 * Cost: ~16 prompt_types × 2-3 Claude calls each = ~$0.05-0.10 per company
 * Time: ~2-3 min sequential, ~30s if parallelised (we go sequential for
 * simplicity + to stay under rate limits).
 */

const MODEL_GENERATOR = 'claude-sonnet-4-5-20250929';
const MODEL_CRITIC = 'claude-sonnet-4-5-20250929';
const MAX_CRITIQUE_ROUNDS = 2;
const PASS_THRESHOLD = 8; // each criterion must be >= 8/10 to pass

export interface CustomizationSummary {
  status: 'success' | 'error' | 'skipped';
  meraki_company_id?: string;
  per_prompt: Array<{
    prompt_type: string;
    status: 'replaced' | 'skipped_manual' | 'skipped_no_spec' | 'failed';
    rounds: number;
    final_score?: number;
    error?: string;
    word_count?: number;
    cost_usd?: number;
  }>;
  total_cost_usd: number;
  duration_ms: number;
  error?: string;
}

/**
 * Customise prompts for a company that's already been graduated.
 * `onboarding_company_id` is the source of truth for context.
 */
export async function customizePromptsForCompany(
  onboardingCompanyId: Types.ObjectId | string,
): Promise<CustomizationSummary> {
  const start = Date.now();
  const summary: CustomizationSummary = {
    status: 'success',
    per_prompt: [],
    total_cost_usd: 0,
    duration_ms: 0,
  };

  if (!isAIAvailable()) {
    return {
      ...summary,
      status: 'error',
      error: 'ANTHROPIC_API_KEY not set — cannot customise prompts',
      duration_ms: Date.now() - start,
    };
  }

  const onboardingCompany = await OnboardingCompany.findById(onboardingCompanyId);
  if (!onboardingCompany) {
    return {
      ...summary,
      status: 'error',
      error: 'Onboarding company not found',
      duration_ms: Date.now() - start,
    };
  }

  // Find the corresponding meraki_admin company.
  const Company = MerakiCompany();
  const merakiCompany = await Company.findOne({ onboarding_company_id: onboardingCompany._id });
  if (!merakiCompany) {
    return {
      ...summary,
      status: 'error',
      error: 'Meraki Admin company record not found — graduate first',
      duration_ms: Date.now() - start,
    };
  }
  const merakiCompanyId = (merakiCompany as any)._id.toString();
  summary.meraki_company_id = merakiCompanyId;

  // Build the rich context bundle once — reused across all 16 prompt types.
  const docs = await OnboardingDoc.find({ companyId: onboardingCompany._id });
  const contextBundle = buildContextBundle(onboardingCompany, docs);

  const SystemPrompt = MerakiSystemPrompt();

  // Iterate sequentially. Parallelism would speed this up but risks Anthropic
  // rate limits + makes the server log unreadable.
  for (const spec of PROMPT_PURPOSE_SPECS) {
    const perPromptStart = Date.now();
    try {
      const existing = await SystemPrompt.findOne({
        company_id: merakiCompanyId,
        prompt_type: spec.prompt_type,
      });

      // Skip founder-edited prompts. seeded_by !== 'meraki_onboarding' means a
      // human (or another system) has touched it.
      if (existing && existing.seeded_by !== 'meraki_onboarding') {
        summary.per_prompt.push({
          prompt_type: spec.prompt_type,
          status: 'skipped_manual',
          rounds: 0,
        });
        continue;
      }

      // Generate + critique loop.
      const result = await generateAndCritique(spec, contextBundle);
      summary.total_cost_usd += result.costUsd;

      // Write — overwrites the scaffold.
      await SystemPrompt.findOneAndUpdate(
        { company_id: merakiCompanyId, prompt_type: spec.prompt_type },
        {
          $set: {
            company_id: merakiCompanyId,
            prompt_type: spec.prompt_type,
            prompt: result.prompt,
            description: spec.short_description,
            template_version: 'customised-1.0',
            seeded_at: new Date(),
            seeded_by: 'meraki_onboarding',
            updated_at: new Date(),
            customisation: {
              rounds: result.rounds,
              final_score: result.finalScore,
              critique_notes: result.critiqueNotes.slice(0, 5),
              cost_usd: result.costUsd,
              generated_at: new Date(),
            },
          },
        },
        { upsert: true },
      );

      summary.per_prompt.push({
        prompt_type: spec.prompt_type,
        status: 'replaced',
        rounds: result.rounds,
        final_score: result.finalScore,
        word_count: result.prompt.split(/\s+/).length,
        cost_usd: result.costUsd,
      });

      console.log(
        `[customizer] ${spec.prompt_type}: ${result.rounds} round(s), ` +
          `score=${result.finalScore}/10, ${result.prompt.split(/\s+/).length}w, ` +
          `$${result.costUsd.toFixed(4)}, ${Date.now() - perPromptStart}ms`,
      );
    } catch (err: any) {
      console.error(`[customizer] ${spec.prompt_type} failed:`, err?.message || err);
      summary.per_prompt.push({
        prompt_type: spec.prompt_type,
        status: 'failed',
        rounds: 0,
        error: err?.message || 'unknown',
      });
    }
  }

  summary.duration_ms = Date.now() - start;
  console.log(
    `[customizer] DONE for company=${merakiCompanyId} — ` +
      `${summary.per_prompt.filter((p) => p.status === 'replaced').length}/${PROMPT_PURPOSE_SPECS.length} replaced, ` +
      `total cost=$${summary.total_cost_usd.toFixed(4)}, duration=${summary.duration_ms}ms`,
  );

  return summary;
}

// ---------------- Generation + critique ----------------

interface GenerationResult {
  prompt: string;
  rounds: number;
  finalScore: number;
  critiqueNotes: string[];
  costUsd: number;
}

async function generateAndCritique(
  spec: PromptPurposeSpec,
  context: ContextBundle,
): Promise<GenerationResult> {
  let currentPrompt = '';
  let rounds = 0;
  let finalScore = 0;
  let critiqueNotes: string[] = [];
  let totalCostUsd = 0;
  let lastFeedback = '';

  for (let round = 1; round <= MAX_CRITIQUE_ROUNDS + 1; round++) {
    rounds = round;

    // 1. Generate
    const generator = await callClaude({
      model: MODEL_GENERATOR,
      systemPrompt: GENERATOR_SYSTEM_PROMPT,
      userPrompt: buildGeneratorUserPrompt(spec, context, lastFeedback),
      maxTokens: 1500,
      temperature: round === 1 ? 0.7 : 0.5, // tighter on rewrites
      timeoutMs: 60_000,
    });
    currentPrompt = stripCodeFences(generator.content).trim();
    totalCostUsd += approxCostUsd(generator);

    // 2. Critique
    const critic = await callClaude({
      model: MODEL_CRITIC,
      systemPrompt: CRITIC_SYSTEM_PROMPT,
      userPrompt: buildCriticUserPrompt(spec, context, currentPrompt),
      maxTokens: 700,
      temperature: 0.2,
      timeoutMs: 30_000,
    });
    totalCostUsd += approxCostUsd(critic);

    const critique = parseCritique(critic.content);
    const minScore = Math.min(
      critique.specificity,
      critique.rules,
      critique.output_format,
      critique.tone_match,
      critique.production_ready,
    );
    finalScore = minScore;
    critiqueNotes = critique.issues || [];

    // Pass condition: every criterion >= threshold AND verdict says pass
    if (critique.verdict === 'pass' && minScore >= PASS_THRESHOLD) {
      break;
    }

    if (round > MAX_CRITIQUE_ROUNDS) {
      // Hit the round cap — keep the latest prompt anyway, just note the score.
      break;
    }

    lastFeedback = critique.improvements || critique.issues?.join('; ') || '';
  }

  return {
    prompt: currentPrompt,
    rounds,
    finalScore,
    critiqueNotes,
    costUsd: totalCostUsd,
  };
}

// ---------------- Context assembly ----------------

interface ContextBundle {
  companyName: string;
  industry: string;
  vertical: string;
  website: string;
  icp: string;
  painSignals: string;
  decisionMakers: string;
  products: string;
  positioning: string;
  brandTone: string;
  brandDos: string;
  brandDonts: string;
  competitors: string;
  commonObjections: string;
  scoringFramework: string;
  nurtureChannelStrategy: string;
  successMetric: string;
}

const VERTICAL_TO_INDUSTRY: Record<string, string> = {
  manufacturing: 'Manufacturing',
  bfsi: 'BFSI',
  hr_recruitment: 'HR & Recruitment',
  b2b_services: 'B2B Services',
  b2b_saas: 'B2B SaaS',
  edtech_b2c: 'EdTech (B2C)',
  other: 'B2B',
};

function buildContextBundle(company: any, docs: any[]): ContextBundle {
  const tp = company.targetProfile || {};
  const docByKind = (kind: string) => docs.find((d) => d.kind === kind)?.content || {};
  const kb = docByKind('knowledge_base');
  const brand = docByKind('brand_guidelines');
  const nurture = docByKind('nurture_strategy');
  const scoring = docByKind('scoring_framework');

  const list = (arr: any) =>
    Array.isArray(arr) ? arr.filter(Boolean).join('; ') : String(arr || '');

  const objections = Array.isArray(kb.commonObjections)
    ? kb.commonObjections
        .map((o: any) =>
          o?.objection ? `"${o.objection}" → ${o.response || '(no response yet)'}` : String(o),
        )
        .join('\n  - ')
    : '';

  const channelStrategyText = company.channelStrategy
    ? Object.entries(company.channelStrategy)
        .map(([stage, channels]) => `${stage}: ${(channels as string[]).join(', ')}`)
        .join(' | ')
    : '';

  return {
    companyName: company.companyName || '',
    industry: VERTICAL_TO_INDUSTRY[company.vertical] || 'B2B',
    vertical: company.vertical || 'other',
    website: company.websiteUrl || '',
    icp: tp.industryFocus
      ? `${tp.industryFocus} (${tp.geography || 'global'}, team size ${tp.salesTeamSize || 'any'})`
      : '',
    painSignals: list(tp.painSignals),
    decisionMakers: list(tp.decisionMakers),
    products: list(kb.productsServices) || list(company.research?.website?.products),
    positioning: list(kb.positioningAngles) || company.research?.website?.positioning || '',
    brandTone: brand.voice?.tone || '',
    brandDos: list(brand.dos),
    brandDonts: list(brand.donts),
    competitors: list(kb.competitors),
    commonObjections: objections ? `\n  - ${objections}` : '',
    scoringFramework: typeof scoring?.rationale === 'string' ? scoring.rationale : '',
    nurtureChannelStrategy: channelStrategyText,
    successMetric: company.successMetric || '',
  };
}

// ---------------- Meta-prompts ----------------

const GENERATOR_SYSTEM_PROMPT = `You are a senior prompt engineer working for Meraki, a B2B sales AI platform.

Your job: write production-quality SYSTEM PROMPTS that customise Meraki's AI agents for specific companies. Each prompt you write will be used at runtime by Claude to power one feature for one company.

Your prompts must:
- Be SPECIFIC to the company you're customising for — name them, reference their voice, products, ICP
- Be production-ready — not a draft, not a stub. Ready to ship today.
- Embed concrete RULES (3+) tailored to this company's context
- Specify the EXPECTED OUTPUT FORMAT clearly (JSON schema, Markdown structure, length cap)
- Use second person ("You are...", "Your task is...")

You always output ONLY the system prompt itself. No preamble, no explanation, no markdown code fences.`;

function buildGeneratorUserPrompt(
  spec: PromptPurposeSpec,
  ctx: ContextBundle,
  feedback: string,
): string {
  const feedbackBlock = feedback
    ? `\n## Improvements requested from the previous round\n${feedback}\n\nApply these improvements; do not regress on what was already working.\n`
    : '';

  return `# Task

Write the production system prompt for the **${spec.prompt_type}** feature, customised for **${ctx.companyName}**.

## What this feature does at runtime
${spec.purpose}

## Runtime inputs the AI will receive
${spec.runtime_inputs.map((i) => `- ${i}`).join('\n')}

## Expected output format from the AI
${spec.output_format}

## Quality criteria for the prompt you're writing
${spec.quality_criteria.map((c) => `- ${c}`).join('\n')}

## Target length
${spec.word_range[0]}–${spec.word_range[1]} words.

## About ${ctx.companyName}
- Industry: ${ctx.industry}
- Website: ${ctx.website || '(not provided)'}
- ICP: ${ctx.icp || '(not specified — be honest in the prompt about this gap)'}
- Decision-maker roles they target: ${ctx.decisionMakers || '(not specified)'}
- Customer pain points they solve: ${ctx.painSignals || '(not specified)'}
- Products/services: ${ctx.products || '(not specified)'}
- Positioning: ${ctx.positioning || '(not specified)'}
- Brand voice/tone: ${ctx.brandTone || '(not specified)'}
- Brand do's: ${ctx.brandDos || '(not specified)'}
- Brand don'ts: ${ctx.brandDonts || '(not specified)'}
- Competitors: ${ctx.competitors || '(not specified)'}
- Common objections: ${ctx.commonObjections || '(not specified)'}
- Channel strategy: ${ctx.nurtureChannelStrategy || '(not specified)'}
- 90-day success metric: ${ctx.successMetric || '(not specified)'}
${feedbackBlock}
## Output

Write the system prompt now. Output ONLY the prompt — no preamble, no explanation, no fences.`;
}

const CRITIC_SYSTEM_PROMPT = `You are a strict reviewer of system prompts written for Meraki's AI sales platform.

Your job: score a system prompt against the spec it was supposed to follow.

Be tough. A prompt that's "fine" but generic should fail. A prompt has to be SPECIFIC to the company, have concrete rules, specify output format, embed brand voice, and be ready to ship without further editing.

Always output a single JSON object — no markdown, no preamble.`;

function buildCriticUserPrompt(
  spec: PromptPurposeSpec,
  ctx: ContextBundle,
  generated: string,
): string {
  return `Evaluate this system prompt for the **${spec.prompt_type}** feature, customised for **${ctx.companyName}**.

## The spec it was supposed to follow
- Purpose: ${spec.purpose}
- Output format: ${spec.output_format}
- Quality criteria:
${spec.quality_criteria.map((c) => `  - ${c}`).join('\n')}
- Word range: ${spec.word_range[0]}–${spec.word_range[1]}

## Company context (was the prompt customised for this company?)
- Name: ${ctx.companyName}
- Industry: ${ctx.industry}
- ICP: ${ctx.icp || '(not given)'}
- Brand voice: ${ctx.brandTone || '(not given)'}
- Products: ${ctx.products || '(not given)'}

## The generated prompt
---
${generated}
---

## Score 1–10 against each criterion

1. **specificity** — references this company's name, products, voice, ICP (not generic)
2. **rules** — has 3+ concrete behavioural rules tailored to this company
3. **output_format** — specifies the expected output (JSON schema / Markdown structure / length)
4. **tone_match** — embeds the company's brand voice
5. **production_ready** — usable as-is without editing

Pass threshold: each criterion must be >= 7. Verdict is "pass" only if all five clear.

## Output JSON only

{
  "specificity": <int 1-10>,
  "rules": <int 1-10>,
  "output_format": <int 1-10>,
  "tone_match": <int 1-10>,
  "production_ready": <int 1-10>,
  "verdict": "pass" | "fail",
  "issues": [<one-line list of concrete problems>],
  "improvements": "<short paragraph of what to fix in next round>"
}`;
}

// ---------------- Helpers ----------------

interface Critique {
  specificity: number;
  rules: number;
  output_format: number;
  tone_match: number;
  production_ready: number;
  verdict: 'pass' | 'fail';
  issues?: string[];
  improvements?: string;
}

function parseCritique(raw: string): Critique {
  // Strip markdown fences if Claude added them
  const cleaned = stripCodeFences(raw).trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      specificity: Number(parsed.specificity) || 0,
      rules: Number(parsed.rules) || 0,
      output_format: Number(parsed.output_format) || 0,
      tone_match: Number(parsed.tone_match) || 0,
      production_ready: Number(parsed.production_ready) || 0,
      verdict: parsed.verdict === 'pass' ? 'pass' : 'fail',
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      improvements: typeof parsed.improvements === 'string' ? parsed.improvements : '',
    };
  } catch {
    // Critic output unparseable — treat as a fail at minimum scores.
    return {
      specificity: 0,
      rules: 0,
      output_format: 0,
      tone_match: 0,
      production_ready: 0,
      verdict: 'fail',
      issues: ['critic output was not valid JSON'],
      improvements: 'regenerate cleanly',
    };
  }
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json|markdown|md)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
}

function approxCostUsd(result: { inputTokens: number; outputTokens: number }): number {
  // Sonnet 4.5 pricing approximation: $3/MTok input, $15/MTok output.
  return (
    (result.inputTokens * 3.0) / 1_000_000 +
    (result.outputTokens * 15.0) / 1_000_000
  );
}
