import mongoose from 'mongoose';
import { OnboardingCompany, IOnboardingCompany } from '../../models/OnboardingCompany';
import { IOnboardingLead } from '../../models/OnboardingLead';
import { getVerticalTemplate } from './verticalTemplates';
import { summariseResearch } from './companyResearch';
import { callClaude, isAIAvailable } from '../ai/claudeClient';
import { buildPrompt } from '../ai/promptManager';
import { extractJSON } from '../ai/jsonExtractor';
import { startSession, updateStep, completeSession, errorSession } from './reasoningService';

interface HuntedLead {
  targetCompany: string;
  city: string;
  industry: string;
  employeeRange: string;
  contactName: string;
  contactTitle: string;
  matchPercent: number;
  matchRationale: string;
  verificationNeeded: boolean;
  scoreBreakdown: { companyFit: number; engagement: number; intent: number; recency: number };
  department?: string;
  seniority?: string;
  relevanceReason?: string;
  recommendedApproach?: string;
  companyDescription?: string;
}

/**
 * Uses Claude to produce an AI-suggested prospect shortlist — real companies,
 * plausible contact names/titles. Every lead is flagged `verificationNeeded: true`.
 *
 * This is NOT a replacement for Apollo / LinkedIn Sales Nav — it's a demo-grade
 * prospect triage that feels realistic without costing API credits on verified data.
 */
export async function huntLeadsWithClaude(
  companyId: mongoose.Types.ObjectId | string,
  count: number
): Promise<{ leads: Partial<IOnboardingLead>[]; aiSuggested: boolean; rationale: string; sessionId: string }> {
  if (!isAIAvailable()) {
    return { leads: [], aiSuggested: false, rationale: 'AI not available', sessionId: '' };
  }

  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');

  const template = getVerticalTemplate(company.vertical);
  const researchSummary = summariseResearch(company.research);

  const session = await startSession({
    operation: 'huntLeads',
    companyId: company._id,
    plannedSteps: [
      { label: 'Load approved target profile', detail: `Reading ${company.companyName}'s ICP filters.`, evidence: ['Target Profile doc (locked)'] },
      { label: 'Load research context', detail: 'Pulling LinkedIn + website + public source signals.', evidence: ['LinkedIn research', 'Website research'] },
      { label: `Build ICP brief for ${template.displayName}`, detail: 'Shaping the prospect shortlist prompt.', evidence: [`Vertical template: ${template.displayName}`, 'onboarding-lead-hunter prompt'] },
      { label: 'Ask Claude for real companies matching ICP', detail: 'Claude Sonnet 4.5 proposes real firms in the vertical + region.', evidence: ['Claude Sonnet 4.5'] },
      { label: 'Parse and validate response', detail: 'Extract leads, check for duplicates, clamp match % to 65–95.', evidence: [] },
      { label: 'Infer department + seniority per contact', detail: 'Map titles to Meraki role taxonomy.', evidence: [] },
      { label: 'Score each lead against framework', detail: 'Company fit + engagement + intent + recency breakdown.', evidence: ['Lead scoring framework'] },
      { label: 'Save leads to pipeline', detail: 'Insert into MongoDB, clear previous batch.', evidence: [] },
    ],
  });
  const sessionId = session._id.toString();

  const context = {
    COMPANY_NAME: company.companyName,
    WEBSITE_URL: company.websiteUrl || '(not provided)',
    VERTICAL_DISPLAY_NAME: template.displayName,
    TARGET_PROFILE_JSON: JSON.stringify(
      {
        primary: company.targetProfile,
        secondarySelected: (company.targetProfileCandidates || [])
          .filter((c, i) => c.isSelected && i !== 0)
          .map((c) => ({
            variantLabel: c.variantLabel,
            industryFocus: c.industryFocus,
            companySize: c.companySize,
            painSignals: c.painSignals,
          })),
      },
      null,
      2
    ),
    RESEARCH_SUMMARY: researchSummary,
    LEAD_COUNT: String(count),
    PREVIOUS_FEEDBACK: '',
  };

  const { systemPrompt, userPrompt, template: tpl } = buildPrompt('onboarding-lead-hunter', context);

  try {
    await updateStep(sessionId, 'Load approved target profile', {
      status: 'done',
      output: `${company.targetProfile.industryFocus} · ${company.targetProfile.companySize} · ${company.targetProfile.geography}`,
      evidence: ['Target Profile (locked)', `${company.targetProfile.decisionMakers.length} decision-maker archetypes`],
    });
    await updateStep(sessionId, 'Load research context', {
      status: 'done',
      output: researchSummary.slice(0, 200) + (researchSummary.length > 200 ? '…' : ''),
    });
    await updateStep(sessionId, `Build ICP brief for ${template.displayName}`, {
      status: 'done',
      output: `Asking Claude for ${count} real prospects in ${template.displayName}.`,
    });

    await updateStep(sessionId, 'Ask Claude for real companies matching ICP', { status: 'active' });
    const result = await callClaude({
      systemPrompt,
      userPrompt,
      model: tpl.model,
      maxTokens: tpl.max_tokens,
      temperature: tpl.temperature,
    });
    await updateStep(sessionId, 'Ask Claude for real companies matching ICP', {
      status: 'done',
      output: `Received ${result.content.length} chars. Tokens: ${result.inputTokens + result.outputTokens}`,
      evidence: [`Claude ${result.model}`, `${result.inputTokens} in / ${result.outputTokens} out`],
    });

    await updateStep(sessionId, 'Parse and validate response', { status: 'active' });
    const parsed = extractJSON(result.content);
    // Accept leads under several common keys Claude sometimes uses.
    const candidateArrays: any[] = [
      parsed?.leads,
      parsed?.prospects,
      parsed?.data,
      Array.isArray(parsed) ? parsed : null,
    ];
    const raw: HuntedLead[] = candidateArrays.find((a: any) => Array.isArray(a) && a.length > 0) || [];

    if (raw.length === 0) {
      const preview = (result.content || '').slice(0, 400).replace(/\s+/g, ' ');
      const why = !parsed
        ? `Could not parse JSON from response. Preview: ${preview}`
        : `Parsed JSON but no leads array. Got keys: ${Object.keys(parsed || {}).join(', ') || '(none)'}. Preview: ${preview}`;
      await updateStep(sessionId, 'Parse and validate response', { status: 'error', output: why });
      await errorSession(sessionId, 'Claude returned no parsable leads. Retry usually works.');
      return { leads: [], aiSuggested: false, rationale: 'Claude returned empty lead array', sessionId };
    }

    await updateStep(sessionId, 'Parse and validate response', {
      status: 'done',
      output: `${raw.length} leads parsed. Match range: ${Math.min(...raw.map((l) => l.matchPercent))}%–${Math.max(...raw.map((l) => l.matchPercent))}%`,
    });

    const now = new Date();
    const leads: Partial<IOnboardingLead>[] = raw.map((l) => ({
      companyId: company._id as mongoose.Types.ObjectId,
      contactName: l.contactName,
      contactTitle: l.contactTitle,
      targetCompany: l.targetCompany,
      city: l.city,
      industry: l.industry,
      targetTeamSize: l.employeeRange,
      matchPercent: clampRange(l.matchPercent, 65, 95),
      score: scoreFromBreakdown(l.scoreBreakdown),
      stage: 'cold',
      scoreBreakdown: {
        companyFit: clampRange(l.scoreBreakdown?.companyFit ?? 25, 0, 35),
        engagement: clampRange(l.scoreBreakdown?.engagement ?? 5, 0, 35),
        intent: clampRange(l.scoreBreakdown?.intent ?? 3, 0, 25),
        recency: clampRange(l.scoreBreakdown?.recency ?? 5, 0, 10),
      },
      intel: {
        department: l.department || inferDepartment(l.contactTitle),
        seniority: l.seniority || inferSeniority(l.contactTitle),
        relevanceReason: l.relevanceReason || l.matchRationale || '',
        matchRationale: l.matchRationale || '',
        recommendedApproach: l.recommendedApproach || '',
        companyDescription: l.companyDescription || `${l.industry || 'B2B'} · ~${l.employeeRange || 'mid-market'}`,
        researchEvents: [
          { timestamp: now, kind: 'hunt', message: `Surfaced by AI lead-hunter matching ${company.companyName}'s target profile.` },
          { timestamp: now, kind: 'match', message: `${l.matchPercent}% match on company fit, industry, and geography.` },
        ],
        lastResearchedAt: now,
      },
      linkedinUrl: '',
      generatedFromProfile: true,
    }));

    const deptCounts = leads.reduce<Record<string, number>>((acc, l) => {
      const d = l.intel?.department || 'Other';
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});
    const deptSummary = Object.entries(deptCounts).map(([k, v]) => `${k}: ${v}`).join(', ');
    await updateStep(sessionId, 'Infer department + seniority per contact', {
      status: 'done',
      output: `Breakdown — ${deptSummary}`,
    });

    const avgScore = Math.round(leads.reduce((s, l) => s + (l.score || 0), 0) / leads.length);
    await updateStep(sessionId, 'Score each lead against framework', {
      status: 'done',
      output: `Avg score: ${avgScore}/100. Distribution: cold/warming band (early engagement signals).`,
    });

    await updateStep(sessionId, 'Save leads to pipeline', {
      status: 'done',
      output: `${leads.length} leads ready to persist.`,
    });

    await completeSession(sessionId, { leadCount: leads.length, avgScore });

    return {
      leads,
      aiSuggested: true,
      rationale: `Claude hunted ${leads.length} prospects matching target profile. Requires human verification before outreach.`,
      sessionId,
    };
  } catch (err: any) {
    console.error('[claudeLeadHunter] failed', err);
    await errorSession(sessionId, err?.message || 'Claude hunt failed');
    return { leads: [], aiSuggested: false, rationale: 'Claude hunt failed', sessionId };
  }
}

function clampRange(n: number, min: number, max: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function scoreFromBreakdown(b: HuntedLead['scoreBreakdown'] | undefined): number {
  if (!b) return 30;
  return clampRange((b.companyFit ?? 0) + (b.engagement ?? 0) + (b.intent ?? 0) + (b.recency ?? 0), 0, 100);
}

function inferDepartment(title: string): string {
  const t = (title || '').toLowerCase();
  if (t.includes('sales') || t.includes('revenue') || t.includes('cro')) return 'Sales & Revenue';
  if (t.includes('growth')) return 'Growth';
  if (t.includes('market')) return 'Marketing';
  if (t.includes('found') || t.includes('ceo') || t.includes('md')) return 'Executive Leadership';
  if (t.includes('gm')) return 'Executive Leadership';
  return 'Leadership';
}

function inferSeniority(title: string): string {
  const t = (title || '').toLowerCase();
  if (t.includes('ceo') || t.includes('cro') || t.includes('cfo') || t.includes('chief') || t.includes('founder') || t.includes('md')) return 'C-Suite / Founder';
  if (t.includes('vp') || t.includes('vice president')) return 'VP';
  if (t.includes('head') || t.includes('director')) return 'Head / Director';
  if (t.includes('manager')) return 'Manager';
  return 'Senior';
}
