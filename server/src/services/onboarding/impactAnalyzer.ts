import mongoose from 'mongoose';
import { OnboardingLead } from '../../models/OnboardingLead';
import { OnboardingDoc, OnboardingDocKind } from '../../models/OnboardingDoc';

export interface ImpactAnalysis {
  docKind: OnboardingDocKind;
  leadsAffected: number;
  stageChanges: Array<{
    leadId: string;
    contactName: string;
    targetCompany: string;
    fromStage: string;
    toStage: string;
    scoreDelta: number;
  }>;
  scoreChangesGt10: number;
  unaffected: number;
  summary: {
    warmToHot: number;
    hotToWarm: number;
    otherStageChanges: number;
  };
}

function stageFromScore(score: number, stages: any): string {
  if (Array.isArray(stages?.ready) && score >= stages.ready[0]) return 'ready';
  if (Array.isArray(stages?.hot) && score >= stages.hot[0]) return 'hot';
  if (Array.isArray(stages?.warm) && score >= stages.warm[0]) return 'warm';
  if (Array.isArray(stages?.warming) && score >= stages.warming[0]) return 'warming';
  return 'cold';
}

/**
 * Computes what would change if we apply a proposed new scoring framework doc
 * to existing leads. Non-mutating — only returns the analysis.
 */
export async function computeImpact(
  companyId: mongoose.Types.ObjectId | string,
  proposedDocContent: any,
  docKind: OnboardingDocKind = 'scoring_framework'
): Promise<ImpactAnalysis> {
  const leads = await OnboardingLead.find({ companyId });

  if (docKind !== 'scoring_framework') {
    // Brand + nurture doc edits are qualitative — no rescoring, just message-regeneration downstream.
    return {
      docKind,
      leadsAffected: leads.length,
      stageChanges: [],
      scoreChangesGt10: 0,
      unaffected: leads.length,
      summary: { warmToHot: 0, hotToWarm: 0, otherStageChanges: 0 },
    };
  }

  const weights = proposedDocContent?.categoryWeights || { companyFit: 25, engagement: 25, intent: 25, recency: 25 };
  const stages = proposedDocContent?.stages || {
    cold: [0, 30],
    warming: [31, 55],
    warm: [56, 75],
    hot: [76, 90],
    ready: [91, 100],
  };

  const stageChanges: ImpactAnalysis['stageChanges'] = [];
  let scoreChangesGt10 = 0;
  let warmToHot = 0;
  let hotToWarm = 0;
  let otherStageChanges = 0;
  let unaffected = 0;

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
    const newStage = stageFromScore(weightedScore, stages);
    const delta = weightedScore - lead.score;

    if (Math.abs(delta) > 10) scoreChangesGt10++;

    if (newStage !== lead.stage) {
      stageChanges.push({
        leadId: lead._id.toString(),
        contactName: lead.contactName,
        targetCompany: lead.targetCompany,
        fromStage: lead.stage,
        toStage: newStage,
        scoreDelta: delta,
      });
      if (lead.stage === 'warm' && newStage === 'hot') warmToHot++;
      else if (lead.stage === 'hot' && newStage === 'warm') hotToWarm++;
      else otherStageChanges++;
    } else {
      unaffected++;
    }
  }

  return {
    docKind,
    leadsAffected: leads.length,
    stageChanges,
    scoreChangesGt10,
    unaffected,
    summary: { warmToHot, hotToWarm, otherStageChanges },
  };
}

/**
 * Applies a doc edit with either "all_leads" or "new_leads" scope.
 * Also records a new doc version.
 */
export async function applyDocEdit(
  companyId: mongoose.Types.ObjectId | string,
  docKind: OnboardingDocKind,
  newContent: any,
  applyTo: 'all_leads' | 'new_leads',
  actor: string = 'founder'
): Promise<{ doc: any; stageChanges: number }> {
  const doc = await OnboardingDoc.findOne({ companyId, kind: docKind });
  if (!doc) throw new Error('Doc not found');

  const prevContent = doc.content;
  doc.content = newContent;
  doc.currentVersion = (doc.versions?.length || 0) + 1;
  doc.versions.push({
    version: doc.currentVersion,
    content: newContent,
    rawMarkdown: doc.rawMarkdown,
    critiqueScore: null,
    editedByFounder: actor === 'founder',
    editDiff: generateSimpleDiff(prevContent, newContent),
    appliedTo: applyTo,
    createdAt: new Date(),
  });
  await doc.save();

  let stageChanges = 0;

  if (docKind === 'scoring_framework' && applyTo === 'all_leads') {
    const leads = await OnboardingLead.find({ companyId });
    const weights = newContent?.categoryWeights || {};
    const stages = newContent?.stages || {};
    for (const lead of leads) {
      const weightedScore = Math.min(
        100,
        Math.round(
          (lead.scoreBreakdown.companyFit * (weights.companyFit || 0) +
            lead.scoreBreakdown.engagement * (weights.engagement || 0) +
            lead.scoreBreakdown.intent * (weights.intent || 0) +
            lead.scoreBreakdown.recency * (weights.recency || 0)) /
            100
        )
      );
      const newStage = stageFromScore(weightedScore, stages);
      if (newStage !== lead.stage) stageChanges++;
      lead.score = weightedScore;
      lead.stage = newStage as any;
      await lead.save();
    }
  }

  return { doc, stageChanges };
}

function generateSimpleDiff(a: any, b: any): string {
  try {
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    if (aStr === bStr) return '(no changes)';
    return `prev:${aStr.length}b / next:${bStr.length}b`;
  } catch {
    return '(diff unavailable)';
  }
}
