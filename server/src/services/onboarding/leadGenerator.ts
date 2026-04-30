import mongoose from 'mongoose';
import { OnboardingCompany, ITargetProfile, OnboardingVertical } from '../../models/OnboardingCompany';
import { OnboardingLead, IOnboardingLead } from '../../models/OnboardingLead';
import { getVerticalTemplate } from './verticalTemplates';
import { huntLeadsWithClaude } from './claudeLeadHunter';
import { huntLeadsWithSerper } from './serperLeadHunter';
import { isSerperAvailable } from '../ai/serperClient';

const INDIAN_FIRST_NAMES = [
  'Rajesh', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Anjali', 'Rahul', 'Kavita', 'Suresh', 'Neha',
  'Arjun', 'Divya', 'Karthik', 'Meera', 'Rohit', 'Sonal', 'Manish', 'Pooja', 'Sanjay', 'Ritu',
];
const INDIAN_LAST_NAMES = [
  'Kumar', 'Sharma', 'Patel', 'Desai', 'Iyer', 'Reddy', 'Singh', 'Gupta', 'Mehta', 'Shah',
  'Nair', 'Rao', 'Joshi', 'Kapoor', 'Verma', 'Pillai', 'Chopra', 'Bose', 'Agarwal', 'Malhotra',
];
const COMPANY_PREFIXES = ['Neptune', 'Sreeji', 'Aditya', 'Sunrise', 'Orbit', 'Meridian', 'Pinnacle', 'Lotus', 'Vertex', 'Horizon', 'Cascade', 'Trident', 'Sigma', 'Nova', 'Ember', 'Zenith', 'Axis', 'Arka'];

function seeded(n: number): number {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seeded(seed) * arr.length)];
}

/**
 * Generates onboarding leads matching the locked target profile.
 *
 * NOTE: This is mock lead generation. In production, this delegates to the real
 * lead-gen engine (Apollo, LinkedIn Sales Nav, internal DB) — but the output
 * shape, match scoring, and stage assignment logic below are the real system.
 */
export interface GenerateLeadsResult {
  leads: IOnboardingLead[];
  source: 'serper_hybrid' | 'claude_ai_suggested' | 'mock_template';
  rationale: string;
  sessionId: string;
}

export async function generateLeadsForProfile(
  companyId: mongoose.Types.ObjectId | string,
  count: number = 30
): Promise<GenerateLeadsResult> {
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');
  if (!company.targetProfile.locked) throw new Error('Target profile must be locked first');

  const template = getVerticalTemplate(company.vertical as OnboardingVertical);
  const profile = company.targetProfile;

  // Clear previous onboarding leads (regeneration scenario)
  await OnboardingLead.deleteMany({ companyId: company._id });

  // Preferred path: Serper (real Google results) + Claude enrichment.
  // Much faster and more verifiable than Claude-only hunting.
  if (isSerperAvailable()) {
    const serperResult = await huntLeadsWithSerper(company._id, count);
    if (serperResult.aiSuggested && serperResult.leads.length > 0) {
      const created = await OnboardingLead.insertMany(serperResult.leads);
      return {
        leads: created as unknown as IOnboardingLead[],
        source: 'serper_hybrid',
        rationale: serperResult.rationale,
        sessionId: serperResult.sessionId,
      };
    }
    console.warn('[leadGenerator] Serper hunt returned empty — falling back to Claude-only.');
  }

  // Fallback: Claude-only hunt (slower, but works without Serper).
  const huntResult = await huntLeadsWithClaude(company._id, count);
  if (huntResult.aiSuggested && huntResult.leads.length > 0) {
    const created = await OnboardingLead.insertMany(huntResult.leads);
    return {
      leads: created as unknown as IOnboardingLead[],
      source: 'claude_ai_suggested',
      rationale: huntResult.rationale,
      sessionId: huntResult.sessionId,
    };
  }

  // Fallback: synthetic seeded leads (no AI or AI failure)
  const baseSeed = Math.abs(hashString(company.companyName + company.vertical));
  const leads: Partial<IOnboardingLead>[] = [];

  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i * 97;
    const pattern = template.leadSeedPatterns[i % template.leadSeedPatterns.length];
    const firstName = pick(INDIAN_FIRST_NAMES, seed + 1);
    const lastName = pick(INDIAN_LAST_NAMES, seed + 2);
    const title = pick(pattern.titleCandidates, seed + 3);
    const company1 = pick(COMPANY_PREFIXES, seed + 4);
    const companyTail = pick(pattern.companyPatterns, seed + 5);
    const city = pick(pattern.cities, seed + 6);
    const industry = pick(pattern.industryLabels, seed + 7);

    // Match %: biased to 65-95, with hard filter cutoff at 65
    const match = 65 + Math.floor(seeded(seed + 8) * 30);

    const companyFit = Math.min(35, Math.floor(match * 0.35));
    const engagement = Math.floor(seeded(seed + 9) * 15); // early engagement — low
    const intent = Math.floor(seeded(seed + 10) * 8);
    const recency = Math.floor(seeded(seed + 11) * 10);
    const score = Math.min(100, companyFit + engagement + intent + recency);

    const stage = stageFromScore(score, template);

    leads.push({
      companyId: company._id as mongoose.Types.ObjectId,
      contactName: `${firstName} ${lastName}`,
      contactTitle: title,
      targetCompany: `${company1} ${companyTail}`,
      city,
      industry,
      targetTeamSize: profile.salesTeamSize,
      matchPercent: match,
      score,
      stage,
      scoreBreakdown: { companyFit, engagement, intent, recency },
      generatedFromProfile: true,
    });
  }

  const created = await OnboardingLead.insertMany(leads);
  return {
    leads: created as unknown as IOnboardingLead[],
    source: 'mock_template',
    rationale: huntResult.rationale || 'AI lead hunting unavailable — synthetic template data.',
    sessionId: huntResult.sessionId || '',
  };
}

function stageFromScore(score: number, template: ReturnType<typeof getVerticalTemplate>): IOnboardingLead['stage'] {
  const stages = template.scoring.stages;
  if (score >= stages.ready[0]) return 'ready';
  if (score >= stages.hot[0]) return 'hot';
  if (score >= stages.warm[0]) return 'warm';
  if (score >= stages.warming[0]) return 'warming';
  return 'cold';
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h || 1;
}

export async function rescoreLeadsForCompany(
  companyId: mongoose.Types.ObjectId | string,
  scoringFrameworkContent: any
): Promise<{ totalAffected: number; stageChanges: Array<{ leadId: string; from: string; to: string }> }> {
  const leads = await OnboardingLead.find({ companyId });
  const company = await OnboardingCompany.findById(companyId);
  if (!company) throw new Error('Company not found');
  const template = getVerticalTemplate(company.vertical as OnboardingVertical);

  const stages = scoringFrameworkContent?.stages || template.scoring.stages;
  const weights = scoringFrameworkContent?.categoryWeights || template.scoring.weights;

  const stageChanges: Array<{ leadId: string; from: string; to: string }> = [];

  for (const lead of leads) {
    const weightedScore = Math.min(
      100,
      Math.round(
        (lead.scoreBreakdown.companyFit * weights.companyFit +
          lead.scoreBreakdown.engagement * weights.engagement +
          lead.scoreBreakdown.intent * weights.intent +
          lead.scoreBreakdown.recency * weights.recency) /
          100
      )
    );
    const newStage = stageFromScoreWithTemplate(weightedScore, stages);
    if (newStage !== lead.stage) {
      stageChanges.push({ leadId: lead._id.toString(), from: lead.stage, to: newStage });
      lead.stage = newStage;
    }
    lead.score = weightedScore;
    await lead.save();
  }

  return { totalAffected: leads.length, stageChanges };
}

function stageFromScoreWithTemplate(score: number, stages: any): IOnboardingLead['stage'] {
  if (Array.isArray(stages.ready) && score >= stages.ready[0]) return 'ready';
  if (Array.isArray(stages.hot) && score >= stages.hot[0]) return 'hot';
  if (Array.isArray(stages.warm) && score >= stages.warm[0]) return 'warm';
  if (Array.isArray(stages.warming) && score >= stages.warming[0]) return 'warming';
  return 'cold';
}
