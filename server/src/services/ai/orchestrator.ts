import { callClaude, isAIAvailable } from './claudeClient';
import { buildPrompt } from './promptManager';
import { extractJSON } from './jsonExtractor';

export interface GenerateInput {
  generatorPrompt: string;
  critiquePrompt?: string;
  context: Record<string, string>;
  maxIterations?: number;
  acceptThreshold?: number;
  operation: string;
}

export interface GenerateResult {
  content: string;
  parsed: Record<string, any> | null;
  iterations: number;
  critiqueScore: number | null;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Single-provider Agent+Critique loop. Generator and critique both use Claude.
 * Lighter than the Signal's dual-provider orchestrator — simpler cost profile,
 * one API key, good enough for onboarding doc quality.
 */
export async function runAgentCritiqueLoop(input: GenerateInput): Promise<GenerateResult> {
  if (!isAIAvailable()) {
    throw new Error('AI not available — set ANTHROPIC_API_KEY');
  }

  const maxIter = input.maxIterations ?? 2;
  const threshold = input.acceptThreshold ?? 8;

  let bestContent = '';
  let bestScore: number | null = null;
  let iterations = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let lastModel = '';
  let previousFeedback = '';

  for (let i = 1; i <= maxIter; i++) {
    iterations = i;

    const ctx = { ...input.context, ITERATION: String(i), PREVIOUS_FEEDBACK: previousFeedback };
    const { systemPrompt, userPrompt, template } = buildPrompt(input.generatorPrompt, ctx);

    const gen = await callClaude({
      systemPrompt,
      userPrompt,
      model: template.model,
      maxTokens: template.max_tokens,
      temperature: template.temperature,
    });

    totalInput += gen.inputTokens;
    totalOutput += gen.outputTokens;
    lastModel = gen.model;

    let score: number | null = null;

    if (input.critiquePrompt) {
      const critCtx = { ...input.context, GENERATED_CONTENT: gen.content, ITERATION: String(i) };
      const critBuilt = buildPrompt(input.critiquePrompt, critCtx);
      try {
        const crit = await callClaude({
          systemPrompt: critBuilt.systemPrompt,
          userPrompt: critBuilt.userPrompt,
          model: critBuilt.template.model,
          maxTokens: critBuilt.template.max_tokens,
          temperature: 0.3,
        });
        totalInput += crit.inputTokens;
        totalOutput += crit.outputTokens;
        const parsedCrit = extractJSON(crit.content);
        if (parsedCrit && typeof parsedCrit.score === 'number') {
          score = parsedCrit.score;

          // Programmatic enforcement of the critic's own mandatory-fail
          // rubric. The LLM frequently reports vertical_match=false or
          // no_saas_canonical_drift=false but still scores 7-8 (above
          // threshold), and the bad output ships. Clamping here makes the
          // rubric non-negotiable: if any mandatory check failed, the
          // doc cannot pass — full stop.
          const ev = parsedCrit.evidence_check || {};
          const mandatoryFails: string[] = [];
          if (ev.vertical_match === false) mandatoryFails.push('vertical_match');
          if (ev.no_saas_canonical_drift === false) mandatoryFails.push('no_saas_canonical_drift');
          if (typeof ev.research_grounding_count === 'number' && ev.research_grounding_count <= 1) {
            mandatoryFails.push(`research_grounding_count=${ev.research_grounding_count}`);
          }
          if (ev.no_filler_phrases === false) mandatoryFails.push('no_filler_phrases');

          if (mandatoryFails.length > 0 && score > 6) {
            console.warn(
              `[orchestrator] clamping score ${score}→6 (mandatory fails: ${mandatoryFails.join(', ')})`
            );
            score = 6;
          }

          previousFeedback =
            score >= threshold
              ? ''
              : `Previous attempt scored ${score}/10. ${
                  mandatoryFails.length
                    ? `Mandatory checks failed: ${mandatoryFails.join(', ')}. `
                    : ''
                }Feedback: ${parsedCrit.feedback || ''}`;
        }
      } catch (err) {
        console.warn('[orchestrator] critique failed, keeping generator output', err);
      }
    }

    if (bestScore === null || (score !== null && score > bestScore)) {
      bestContent = gen.content;
      bestScore = score;
    }

    if (score !== null && score >= threshold) break;
    if (!input.critiquePrompt) {
      bestContent = gen.content;
      break;
    }
  }

  return {
    content: bestContent,
    parsed: extractJSON(bestContent),
    iterations,
    critiqueScore: bestScore,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    model: lastModel,
  };
}
