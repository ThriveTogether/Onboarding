import mongoose from 'mongoose';
import { OnboardingCompany } from '../../models/OnboardingCompany';
import { OnboardingDoc, OnboardingDocKind, IOnboardingDoc } from '../../models/OnboardingDoc';
import { OnboardingLead } from '../../models/OnboardingLead';
import { getVerticalTemplate } from './verticalTemplates';
import { summariseResearch } from './companyResearch';
import { runAgentCritiqueLoop } from '../ai/orchestrator';
import { isAIAvailable } from '../ai/claudeClient';
import { extractJSON } from '../ai/jsonExtractor';
import { startSession, updateStep, completeSession, errorSession } from './reasoningService';
import { extractBranding } from './brandExtractor';

const DOC_TITLES: Record<OnboardingDocKind, string> = {
  nurture_strategy: 'How your AI sells',
  scoring_framework: 'Who your AI prioritises',
  brand_guidelines: 'How your AI sounds',
  target_profile: 'Who your AI targets',
  knowledge_base: 'What your AI knows',
};

const KIND_TO_PROMPT: Partial<Record<OnboardingDocKind, string>> = {
  nurture_strategy: 'onboarding-nurture-strategy',
  scoring_framework: 'onboarding-scoring-framework',
  brand_guidelines: 'onboarding-brand-guidelines',
  knowledge_base: 'onboarding-knowledge-base',
};

function markdownForDoc(kind: OnboardingDocKind, parsed: any, companyName: string): string {
  if (!parsed) return '';
  switch (kind) {
    case 'nurture_strategy':
      return `# How your AI sells — ${companyName}\n\n## Stage: Cold Outreach\n- Channel (primary): ${parsed.coldOutreach?.channelPrimary}\n- Channel (secondary): ${parsed.coldOutreach?.channelSecondary}\n- Tone: ${parsed.coldOutreach?.tone}\n- First message approach: ${parsed.coldOutreach?.firstMessageApproach}\n- Frequency: Days ${(parsed.coldOutreach?.frequencyDays || []).join(', ')}\n- Escalation: ${parsed.coldOutreach?.escalation}\n\n## Stage: Warm / Engaged\n- Channel: ${parsed.warmEngaged?.channel}\n- Tone: ${parsed.warmEngaged?.tone}\n- Approach: ${parsed.warmEngaged?.approach}\n- Proactive every: ${parsed.warmEngaged?.proactiveIntervalDays} days\n- Escalation: ${parsed.warmEngaged?.escalation}\n\n## Stage: Hot / Rep-Ready\n- Channel: ${parsed.hotRepReady?.channel}\n- Handoff trigger: ${parsed.hotRepReady?.handoffTrigger}\n- Rep action: ${parsed.hotRepReady?.repAction}\n\n---\n${parsed.rationale || ''}`;
    case 'scoring_framework':
      return `# Who your AI prioritises — ${companyName}\n\n## Category weights\n- Company fit: ${parsed.categoryWeights?.companyFit}%\n- Engagement: ${parsed.categoryWeights?.engagement}%\n- Intent: ${parsed.categoryWeights?.intent}%\n- Recency: ${parsed.categoryWeights?.recency}%\n\n## Stages\n- Cold: ${(parsed.stages?.cold || []).join('-')}\n- Warming: ${(parsed.stages?.warming || []).join('-')}\n- Warm: ${(parsed.stages?.warm || []).join('-')}\n- Hot: ${(parsed.stages?.hot || []).join('-')}\n- Ready: ${(parsed.stages?.ready || []).join('-')}\n\n## Red-flag signals\n${(parsed.redFlagSignals || []).map((s: string) => `- ${s}`).join('\n')}\n\n---\n${parsed.rationale || ''}`;
    case 'brand_guidelines':
      return `# How your AI sounds — ${companyName}\n\n## Voice\n- Tone: ${parsed.voice?.tone}\n- Language level: ${parsed.voice?.languageLevel}\n- First person style: ${parsed.voice?.firstPersonStyle}\n- Sign-off: ${parsed.voice?.signOffStyle}\n\n## Do\n${(parsed.dos || []).map((d: string) => `- ${d}`).join('\n')}\n\n## Don't\n${(parsed.donts || []).map((d: string) => `- ${d}`).join('\n')}\n\n## Business hours\n${parsed.businessHours}\n\n## Sample messages\nCold:\n> ${parsed.samples?.coldWhatsApp}\n\nFollow-up:\n> ${parsed.samples?.followupWhatsApp}`;
    case 'knowledge_base':
      return `# What your AI knows — ${companyName}\n\n${parsed.companyDescription || ''}\n\n## Products / services\n${(parsed.productsServices || []).map((p: string) => `- ${p}`).join('\n')}\n\n## Positioning angles\n${(parsed.positioningAngles || []).map((p: string) => `- ${p}`).join('\n')}\n\n## Target market\n${parsed.targetMarket || ''}\n\n## Key differentiators\n${(parsed.keyDifferentiators || []).map((d: string) => `- ${d}`).join('\n')}\n\n## Common objections\n${(parsed.commonObjections || []).map((o: any) => `- **${o.objection}** — ${o.response}`).join('\n')}\n\n## Competitors\n${(parsed.competitors || []).join(', ')}`;
    case 'target_profile':
      return `# Who your AI targets — ${companyName}\n\n- Geography: ${parsed.geography}\n- Company size: ${parsed.companySize}\n- Target sales team size: ${parsed.salesTeamSize}\n- Industry focus: ${parsed.industryFocus}\n- Decision makers: ${(parsed.decisionMakers || []).join(', ')}\n- Pain signals: ${(parsed.painSignals || []).join('; ')}`;
    default:
      return JSON.stringify(parsed, null, 2);
  }
}

export interface GenerateDocOptions {
  /**
   * Free-form feedback from the founder telling the regen what to fix
   * ("tone is too aggressive", "drop the WhatsApp channel"). Prepended to
   * the lead-derived FOUNDER_FEEDBACK so the LLM sees both signals.
   */
  founderFeedbackOverride?: string;
}

export async function generateDoc(
  companyId: mongoose.Types.ObjectId | string,
  kind: OnboardingDocKind,
  opts?: GenerateDocOptions
): Promise<IOnboardingDoc> {
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');
  const template = getVerticalTemplate(company.vertical);
  const researchSummary = summariseResearch(company.research);

  let doc = await OnboardingDoc.findOne({ companyId: company._id, kind });
  if (!doc) {
    doc = new OnboardingDoc({
      companyId: company._id,
      kind,
      title: DOC_TITLES[kind],
      status: 'generating',
      versions: [],
    });
  } else {
    doc.status = 'generating';
  }
  await doc.save();

  // target_profile is already produced + locked in Phase A — synthesize from company.
  if (kind === 'target_profile') {
    const parsed = company.targetProfile;
    doc.content = parsed as any;
    doc.rawMarkdown = markdownForDoc('target_profile', parsed, company.companyName);
    doc.status = 'approved';
    doc.approvedAt = new Date();
    doc.currentVersion = 1;
    doc.versions.push({
      version: 1,
      content: parsed as any,
      rawMarkdown: doc.rawMarkdown,
      critiqueScore: null,
      editedByFounder: false,
      editDiff: '',
      appliedTo: 'initial',
      createdAt: new Date(),
    });
    await doc.save();
    return doc;
  }

  const prompt = KIND_TO_PROMPT[kind];
  if (!prompt) throw new Error(`No prompt configured for doc kind: ${kind}`);

  const docLabel = DOC_TITLES[kind] || kind;
  const session = await startSession({
    operation: `generateDoc.${kind}`,
    companyId: company._id,
    docKind: kind,
    plannedSteps: [
      { label: 'Load research + target profile', detail: 'Reading approved ICP + multi-source research.', evidence: ['Target Profile (locked)', 'LinkedIn research', 'Website research'] },
      { label: `Load ${template.displayName} template for ${docLabel}`, detail: 'Vertical scaffolding to ground the draft.', evidence: [`Template: ${template.displayName}`] },
      { label: `Draft ${docLabel.toLowerCase()} with Claude`, detail: 'Claude Sonnet 4.5 writes the first pass, grounded in company signals.', evidence: ['Claude Sonnet 4.5', `Prompt: ${prompt}`] },
      { label: 'Critique for specificity + accuracy', detail: 'Claude Haiku 4.5 scores. Low score → regenerate once.', evidence: ['Claude Haiku 4.5'] },
      { label: 'Structure output for UI', detail: 'Parse JSON, render markdown, validate all required sections.', evidence: [] },
    ],
  });
  const sessionId = session._id.toString();

  const leadFeedback = await summariseFounderFeedback(company._id, company.icpFeedbackNote);
  const founderFeedback = opts?.founderFeedbackOverride
    ? `Founder's explicit feedback on this doc:\n${opts.founderFeedbackOverride.trim()}\n\nPrior lead-level feedback:\n${leadFeedback || '(none)'}`
    : leadFeedback;

  const context = {
    COMPANY_NAME: company.companyName,
    WEBSITE_URL: company.websiteUrl || '(not provided)',
    LINKEDIN_URL: company.linkedinUrl || '(not provided)',
    VERTICAL_DISPLAY_NAME: template.displayName,
    TARGET_PROFILE_JSON: JSON.stringify(
      {
        primary: company.targetProfile,
        secondarySelected: (company.targetProfileCandidates || [])
          .filter((c, i) => c.isSelected && i !== 0)
          .map((c) => ({
            variantLabel: c.variantLabel,
            industryFocus: c.industryFocus,
            painSignals: c.painSignals,
          })),
      },
      null,
      2
    ),
    RESEARCH_SUMMARY: researchSummary,
    // Structured research blobs — passed to the critic so its
    // vertical-mismatch + grounding checks have ground truth to compare
    // the generated doc against. (The generator prompts use the summary;
    // the critic prompt reads these raw blobs.)
    LINKEDIN_RESEARCH: JSON.stringify(company.research?.linkedin || {}),
    WEBSITE_RESEARCH: JSON.stringify(company.research?.website || {}),
    PUBLIC_RESEARCH: JSON.stringify(company.research?.publicSources || {}),
    FOUNDER_FEEDBACK: founderFeedback,
    VERTICAL_NURTURE_JSON: JSON.stringify(template.nurture, null, 2),
    VERTICAL_SCORING_JSON: JSON.stringify(template.scoring, null, 2),
    VERTICAL_BRAND_JSON: JSON.stringify(template.brand, null, 2),
    VERTICAL_KNOWLEDGE_JSON: JSON.stringify(template.knowledgeBase, null, 2),
    // Voice signal: founder-edited message templates from Phase B1.
    // The brand_guidelines prompt should mirror their actual writing style.
    MESSAGE_TEMPLATES_JSON: JSON.stringify(
      (company.messageTemplates || [])
        .filter((t) => t.body)
        .map((t) => ({
          stage: t.stage,
          channel: t.channel,
          length: t.length,
          tone: t.tone,
          formality: t.formality,
          subject: t.subject,
          body: t.body,
          edited: t.edited,
        })),
      null,
      2
    ),
    CHANNEL_STRATEGY_JSON: JSON.stringify(company.channelStrategy || {}, null, 2),
    DOC_KIND: kind,
  };

  let parsed: any;
  let iterations = 0;
  let critiqueScore: number | null = null;

  try {
    await updateStep(sessionId, 'Load research + target profile', {
      status: 'done',
      output: `Profile locked for ${company.companyName}. ${company.targetProfile.painSignals.length} pain signals.`,
    });
    await updateStep(sessionId, `Load ${template.displayName} template for ${docLabel}`, {
      status: 'done',
      output: 'Template scaffolding ready.',
    });

    if (isAIAvailable()) {
      await updateStep(sessionId, `Draft ${docLabel.toLowerCase()} with Claude`, { status: 'active' });
      try {
        const result = await runAgentCritiqueLoop({
          generatorPrompt: prompt,
          critiquePrompt: 'onboarding-doc-critique',
          context,
          maxIterations: 2,
          operation: `generateDoc.${kind}`,
        });
        await updateStep(sessionId, `Draft ${docLabel.toLowerCase()} with Claude`, {
          status: 'done',
          output: `Drafted. ${result.content.length} chars. Tokens: ${result.inputTokens + result.outputTokens}`,
          evidence: [`Claude ${result.model}`, `${result.iterations} iteration(s)`],
        });
        await updateStep(sessionId, 'Critique for specificity + accuracy', {
          status: 'done',
          output: `Score: ${result.critiqueScore ?? 'n/a'}/10. ${result.iterations > 1 ? 'Regenerated once.' : 'First draft passed.'}`,
        });
        parsed = result.parsed || extractJSON(result.content);
        iterations = result.iterations;
        critiqueScore = result.critiqueScore;
      } catch (err: any) {
        await updateStep(sessionId, `Draft ${docLabel.toLowerCase()} with Claude`, { status: 'error', output: err?.message || 'AI call failed' });
        await updateStep(sessionId, 'Critique for specificity + accuracy', { status: 'skipped', output: 'AI unavailable' });
        console.error(`[docGenerators] ${kind} AI failed, using vertical template`, err);
        parsed = fallbackFromTemplate(kind, template);
      }
    } else {
      await updateStep(sessionId, `Draft ${docLabel.toLowerCase()} with Claude`, { status: 'skipped', output: 'AI disabled' });
      await updateStep(sessionId, 'Critique for specificity + accuracy', { status: 'skipped', output: 'AI disabled' });
      parsed = fallbackFromTemplate(kind, template);
    }

    // For nurture_strategy: inject the founder's confirmed channel strategy
    // (per stage) and message templates so the renderer can show a real
    // interactive flow diagram instead of just text.
    if (kind === 'nurture_strategy' && parsed) {
      parsed.channelStrategy = company.channelStrategy || {};
      parsed.stageThresholds = company.stageThresholds || {};
      const editedTemplates = (company.messageTemplates || []).filter((t) => t.body);
      parsed.messageTemplates = editedTemplates.map((t) => ({
        stage: t.stage,
        channel: t.channel,
        subject: t.subject,
        body: t.body,
        edited: t.edited,
      }));
    }

    // For scoring_framework: same injection — the table view needs the
    // confirmed channel strategy and stage thresholds (the founder may have
    // edited the defaults in Phase 3).
    if (kind === 'scoring_framework' && parsed) {
      parsed.channelStrategy = company.channelStrategy || {};
      // Override AI-generated stages with founder-confirmed thresholds where present
      if (company.stageThresholds && Object.keys(company.stageThresholds).length > 0) {
        parsed.stages = {
          cold: company.stageThresholds.cold,
          warming: company.stageThresholds.warming,
          warm: company.stageThresholds.warm,
          hot: company.stageThresholds.hot,
          ready: company.stageThresholds.ready,
        };
      }
    }

    // For brand_guidelines: extract real logo + brand colors from website
    // and merge into the doc content. Also surface a couple of the founder's
    // saved message templates as canonical voice samples.
    if (kind === 'brand_guidelines' && parsed) {
      try {
        const branding = await extractBranding(company.websiteUrl || '');
        parsed.branding = {
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          secondaryColor: branding.secondaryColor,
          brandColors: branding.brandColors,
          source: branding.source,
        };
      } catch (e: any) {
        console.warn('[docGenerators] brand extraction failed', e?.message);
      }

      // Replace AI-fabricated samples with real founder-edited messages where
      // available — most credible voice reference.
      const editedTemplates = (company.messageTemplates || []).filter((t) => t.body);
      if (editedTemplates.length > 0) {
        const cold = editedTemplates.find((t) => t.stage === 'cold');
        const warming = editedTemplates.find((t) => t.stage === 'warming');
        const hot = editedTemplates.find((t) => t.stage === 'hot');
        parsed.savedMessageSamples = {
          cold: cold ? { channel: cold.channel, subject: cold.subject, body: cold.body } : null,
          warming: warming ? { channel: warming.channel, subject: warming.subject, body: warming.body } : null,
          hot: hot ? { channel: hot.channel, subject: hot.subject, body: hot.body } : null,
        };
      }
    }

    await updateStep(sessionId, 'Structure output for UI', {
      status: 'done',
      output: `Validated. ${Object.keys(parsed || {}).length} top-level sections.`,
    });
    await completeSession(sessionId, { docKind: kind, iterations, critiqueScore });
  } catch (err: any) {
    await errorSession(sessionId, err?.message || 'Doc gen failed');
    throw err;
  }

  doc.content = parsed;
  doc.rawMarkdown = markdownForDoc(kind, parsed, company.companyName);
  // knowledge_base waits for catalogue upload (or skip) — it's no longer auto-approved.
  doc.status = 'ready_for_review';
  doc.generationIterations = iterations;
  doc.currentVersion = (doc.versions?.length || 0) + 1;
  doc.versions.push({
    version: doc.currentVersion,
    content: parsed,
    rawMarkdown: doc.rawMarkdown,
    critiqueScore,
    editedByFounder: false,
    editDiff: '',
    appliedTo: 'initial',
    createdAt: new Date(),
  });
  await doc.save();
  return doc;
}

function fallbackFromTemplate(kind: OnboardingDocKind, template: ReturnType<typeof getVerticalTemplate>): any {
  switch (kind) {
    case 'nurture_strategy':
      return {
        coldOutreach: {
          channelPrimary: template.nurture.coldChannelPrimary,
          channelSecondary: template.nurture.coldChannelSecondary,
          tone: template.nurture.coldTone,
          firstMessageApproach: template.nurture.coldFirstMessageAngle,
          frequencyDays: template.nurture.coldFrequencyDays,
          escalation: 'Reduce frequency + shift angle after 3 unresponsive touches',
        },
        warmEngaged: {
          channel: template.nurture.warmChannel,
          tone: template.nurture.warmTone,
          approach: template.nurture.warmApproach,
          proactiveIntervalDays: template.nurture.warmProactiveIntervalDays,
          escalation: 'Flag for warm handoff on high engagement',
        },
        hotRepReady: {
          channel: 'System flags for rep action',
          handoffTrigger: template.nurture.handoffTriggerDescription,
          repAction: 'Call Prep auto-generated, lead appears in "Needs you"',
        },
        rationale: 'Generated from vertical template (AI fallback).',
      };
    case 'scoring_framework':
      return {
        categoryWeights: template.scoring.weights,
        signals: {
          companyFit: [
            { signal: 'Team size match', weight: template.scoring.signalWeights.team_size_match || 0 },
            { signal: 'Industry match', weight: template.scoring.signalWeights.industry_match || 0 },
            { signal: 'Geography match', weight: template.scoring.signalWeights.geography_match || 0 },
            { signal: 'Revenue signal', weight: template.scoring.signalWeights.revenue_signal || 0 },
          ],
          engagement: [
            { signal: 'Meaningful reply', weight: template.scoring.signalWeights.reply_meaningful || 0 },
            { signal: 'Link click', weight: template.scoring.signalWeights.link_click || 0 },
            { signal: 'Fast reply', weight: template.scoring.signalWeights.reply_fast || 0 },
            { signal: 'Question asked', weight: template.scoring.signalWeights.question_asked || 0 },
          ],
          intent: [
            { signal: 'Pricing mentioned', weight: template.scoring.signalWeights.pricing_mentioned || 0 },
            { signal: 'Timeline mentioned', weight: template.scoring.signalWeights.timeline_mentioned || 0 },
            { signal: 'Competitor mentioned', weight: template.scoring.signalWeights.competitor_mentioned || 0 },
            { signal: 'Meeting requested', weight: template.scoring.signalWeights.meeting_requested || 0 },
          ],
          recency: [
            { signal: 'Last interaction < 24h', weight: 15 },
            { signal: 'Last interaction 1-3 days', weight: 10 },
            { signal: 'Last interaction > 7 days (cooling)', weight: -10 },
          ],
        },
        stages: template.scoring.stages,
        redFlagSignals: ['No reply after 3 touches', 'Unsubscribe request', 'Out-of-ICP company size'],
        rationale: 'Generated from vertical template (AI fallback).',
      };
    case 'brand_guidelines':
      return {
        voice: {
          tone: template.brand.tone,
          languageLevel: template.brand.languageLevel,
          firstPersonStyle: template.brand.firstPersonStyle,
          signOffStyle: template.brand.signOffStyle,
        },
        dos: template.brand.dos,
        donts: template.brand.donts,
        businessHours: template.brand.businessHours,
        samples: {
          coldWhatsApp: template.brand.sampleColdMessage,
          followupWhatsApp: template.brand.sampleFollowupMessage,
        },
        rationale: 'Generated from vertical template (AI fallback).',
      };
    case 'knowledge_base':
      return {
        companyDescription: 'Generated from available research signals. Refine in Settings.',
        productsServices: ['(Pending company-specific research)'],
        positioningAngles: template.knowledgeBase.positioningAngles,
        targetMarket: 'See Target Profile doc.',
        keyDifferentiators: [],
        commonObjections: template.knowledgeBase.commonObjections.map((o) => ({
          objection: o,
          response: '(Add a company-specific response)',
        })),
        competitors: template.knowledgeBase.competitorMentions,
        rationale: 'Generated from vertical template (AI fallback).',
      };
    default:
      return {};
  }
}

/**
 * Builds a human-readable summary of founder feedback on A3 leads + their ICP
 * notes. Fed into every doc agent's context as FOUNDER_FEEDBACK so Claude
 * writes docs grounded in what the founder actually said, not just templates.
 */
async function summariseFounderFeedback(
  companyId: mongoose.Types.ObjectId,
  icpNote: string
): Promise<string> {
  const leads = await OnboardingLead.find({
    companyId,
    founderFeedback: { $ne: null },
  }).lean();

  if (leads.length === 0 && !icpNote?.trim()) {
    return '(Founder has not yet given feedback on the surfaced leads.)';
  }

  const pursue = leads.filter((l) => l.founderFeedback === 'pursue');
  const existing = leads.filter((l) => l.founderFeedback === 'existing');
  const skip = leads.filter((l) => l.founderFeedback === 'skip');

  const parts: string[] = [];
  if (pursue.length > 0) {
    parts.push(
      `FOUNDER WANTS TO PURSUE (${pursue.length}): ${pursue
        .slice(0, 10)
        .map((l) => `${l.targetCompany} (${l.industry})`)
        .join(', ')}`
    );
  }
  if (existing.length > 0) {
    parts.push(
      `ALREADY CUSTOMERS / IN PIPELINE (${existing.length}): ${existing
        .slice(0, 10)
        .map((l) => l.targetCompany)
        .join(', ')}. Do NOT re-prospect these — they're already in the founder's book. Consider them for upsell/cross-sell messaging instead.`
    );
  }
  if (skip.length > 0) {
    parts.push(
      `FOUNDER SAID SKIP (${skip.length}): ${skip
        .slice(0, 10)
        .map((l) => `${l.targetCompany} (${l.industry})`)
        .join(', ')}. Exclude this industry/size/style from future lead hunts.`
    );
  }

  const notesFromLeads = leads
    .filter((l) => l.founderFeedbackNote && l.founderFeedbackNote.trim())
    .map((l) => `${l.targetCompany}: ${l.founderFeedbackNote}`);
  if (notesFromLeads.length > 0) {
    parts.push('PER-LEAD NOTES:\n' + notesFromLeads.map((n) => `  - ${n}`).join('\n'));
  }

  if (icpNote?.trim()) {
    parts.push(`FOUNDER'S ICP NOTES: "${icpNote.trim()}"`);
  }

  return parts.join('\n\n');
}

export async function generateAllDocsInParallel(
  companyId: mongoose.Types.ObjectId | string
): Promise<{ generated: OnboardingDocKind[]; failed: OnboardingDocKind[] }> {
  const kinds: OnboardingDocKind[] = [
    'target_profile',
    'nurture_strategy',
    'scoring_framework',
    'brand_guidelines',
    'knowledge_base',
  ];
  const results = await Promise.allSettled(kinds.map((k) => generateDoc(companyId, k)));
  const generated: OnboardingDocKind[] = [];
  const failed: OnboardingDocKind[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') generated.push(kinds[i]);
    else failed.push(kinds[i]);
  });
  return { generated, failed };
}
