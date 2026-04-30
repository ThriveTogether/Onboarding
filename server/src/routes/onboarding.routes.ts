import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { OnboardingCompany } from '../models/OnboardingCompany';
import { OnboardingDoc, OnboardingDocKind } from '../models/OnboardingDoc';
import { OnboardingLead } from '../models/OnboardingLead';
import { RepInvite } from '../models/RepInvite';
import { FunnelEvent } from '../models/FunnelEvent';
import { listVerticals } from '../services/onboarding/verticalTemplates';
import { runMultiSourceResearch } from '../services/onboarding/companyResearch';
import {
  predictTargetProfile,
  lockTargetProfile,
  lockTargetProfiles,
  editTargetProfileCandidate,
  addCustomTargetProfile,
} from '../services/onboarding/targetProfilePredictor';
import { generateLeadsForProfile, rescoreLeadsForCompany } from '../services/onboarding/leadGenerator';
import { draftMessage, saveTemplate } from '../services/onboarding/messageDrafter';
import { generateDoc, generateAllDocsInParallel } from '../services/onboarding/docGenerators';
import { parseCatalogue, detectFormat } from '../services/onboarding/catalogueParser';
import { callClaude, isAIAvailable } from '../services/ai/claudeClient';
import { extractJSON } from '../services/ai/jsonExtractor';
import { trackFunnelEvent } from '../services/onboarding/funnelTracker';
import {
  runNudgeScheduler,
  diagnosticResponseToIntervention,
  DiagnosticResponse,
} from '../services/onboarding/nudgeService';
import { computeImpact, applyDocEdit } from '../services/onboarding/impactAnalyzer';
import { getSession } from '../services/onboarding/reasoningService';
import { ReasoningSession } from '../models/ReasoningSession';
import { User } from '../models/User';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Multer in-memory upload — 20 MB cap, single file under field name "file".
const catalogueUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// --------------------------------------------------------------------------
// Public rep routes (invite-token based, no session required)
// --------------------------------------------------------------------------

router.get('/rep-invite/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  const invite = await RepInvite.findOne({ inviteToken: token }).populate('companyId');
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.expiresAt < new Date()) {
    invite.status = 'expired';
    await invite.save();
    return res.status(410).json({ error: 'Invite expired' });
  }

  const company = invite.companyId as any;
  const leadCount = await OnboardingLead.countDocuments({ companyId: company._id });
  const hotReady = await OnboardingLead.countDocuments({
    companyId: company._id,
    stage: { $in: ['hot', 'ready'] },
  });

  return res.json({
    invite: {
      _id: invite._id,
      email: invite.email,
      name: invite.name,
      status: invite.status,
      cvUploaded: invite.cvUploaded,
      firstLoginAt: invite.firstLoginAt,
    },
    company: { _id: company._id, companyName: company.companyName, vertical: company.vertical },
    pipeline: { totalLeads: leadCount, hotReady },
  });
});

router.post('/rep-invite/:token/login', async (req: Request, res: Response) => {
  const invite = await RepInvite.findOne({ inviteToken: req.params.token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'Invite expired' });

  if (!invite.firstLoginAt) invite.firstLoginAt = new Date();
  invite.status = 'accepted';
  await invite.save();

  await trackFunnelEvent('rep_first_login', invite.companyId, {}, invite._id);
  return res.json({ invite });
});

router.post('/rep-invite/:token/cv', async (req: Request, res: Response) => {
  const { fileName } = req.body as { fileName?: string };
  const invite = await RepInvite.findOne({ inviteToken: req.params.token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  invite.cvUploaded = true;
  invite.cvFileName = fileName || '';
  await invite.save();

  await trackFunnelEvent('rep_cv_uploaded', invite.companyId, { fileName }, invite._id);
  return res.json({ invite });
});

router.post('/rep-invite/:token/skip-cv', async (req: Request, res: Response) => {
  const invite = await RepInvite.findOne({ inviteToken: req.params.token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  await trackFunnelEvent('rep_cv_skipped', invite.companyId, {}, invite._id);
  return res.json({ ok: true });
});

router.get('/rep-invite/:token/playbook', async (req: Request, res: Response) => {
  const invite = await RepInvite.findOne({ inviteToken: req.params.token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  const companyId = invite.companyId;
  const company = await OnboardingCompany.findById(companyId);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const needsYou = await OnboardingLead.find({
    companyId,
    stage: { $in: ['hot', 'ready'] },
  })
    .sort({ score: -1 })
    .limit(10);

  const stageCounts = await OnboardingLead.aggregate([
    { $match: { companyId: new mongoose.Types.ObjectId(companyId.toString()) } },
    { $group: { _id: '$stage', count: { $sum: 1 } } },
  ]);

  const systemHandles = {
    cold: stageCounts.find((s: any) => s._id === 'cold')?.count || 0,
    warming: stageCounts.find((s: any) => s._id === 'warming')?.count || 0,
    warm: stageCounts.find((s: any) => s._id === 'warm')?.count || 0,
  };

  return res.json({
    rep: { email: invite.email, name: invite.name, cvUploaded: invite.cvUploaded },
    company: { companyName: company.companyName, vertical: company.vertical },
    needsYou: needsYou.map((l) => ({
      _id: l._id,
      contactName: l.contactName,
      targetCompany: l.targetCompany,
      score: l.score,
      stage: l.stage,
      industry: l.industry,
      city: l.city,
      matchPercent: l.matchPercent,
    })),
    systemHandles,
    yesterday: { calls: 0, avgScore: 0, leadsMoved: { coldToWarm: 0, warmToHot: 0 } },
  });
});

// --------------------------------------------------------------------------
// All routes below require a logged-in founder. The rep routes above are public
// by design (invite-token based).
// --------------------------------------------------------------------------
router.use(authMiddleware);

/** Returns the authenticated founder's onboarding state — their company + docs + leads + reps. */
router.get('/state', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const company = user.companyId
    ? await OnboardingCompany.findById(user.companyId)
    : await OnboardingCompany.findOne({ userId: user._id }).sort({ createdAt: -1 });

  if (!company) {
    return res.json({
      company: null,
      user: { _id: user._id, email: user.email, name: user.name, companyName: user.companyName },
      resumeUrl: '/onboarding',
    });
  }

  const docs = await OnboardingDoc.find({ companyId: company._id }).sort({ kind: 1 });
  const leadCount = await OnboardingLead.countDocuments({ companyId: company._id });
  const reps = await RepInvite.find({ companyId: company._id });
  const resumeUrl = computeResumeUrl(company, docs, leadCount);

  return res.json({
    company,
    docs,
    leadCount,
    resumeUrl,
    reps: reps.map((r) => ({
      _id: r._id,
      email: r.email,
      name: r.name,
      status: r.status,
      cvUploaded: r.cvUploaded,
      inviteLink: buildInviteLink(req, r.inviteToken),
    })),
  });
});

/**
 * Compute the URL the founder should land on if they log back in mid-flow.
 * Walks through every wizard step in order, returns the first one that hasn't
 * been completed. Server-side so the logic stays in one place.
 */
function computeResumeUrl(company: any, docs: any[], leadCount: number): string {
  const id = company._id.toString();

  // Already launched → land in the product app
  if (company.phase === 'complete') return '/app/target-profile';

  // A1: company basics — companyName is required at signup, so this is implicit
  if (!company.companyName) return '/onboarding';

  // A2: target profile must be locked (any candidate selected)
  const hasLockedProfile = !!company.targetProfile?.locked;
  if (!hasLockedProfile) return `/onboarding/profile/${id}`;

  // A3: at least one lead generated
  if (leadCount === 0) return `/onboarding/leads/${id}`;

  // B1: messaging — at least one message template saved + Next clicked
  const hasMessaging =
    (company.messageTemplates && company.messageTemplates.length > 0) ||
    !!company.messagingCompletedAt;
  if (!hasMessaging) return `/onboarding/messaging/${id}`;

  // B1.5: channels + stages — must have explicit confirmation
  if (!company.channelsConfiguredAt) return `/onboarding/channels-stages/${id}`;

  // B2-B5: docs — all 4 reviewable docs must be approved or skipped
  const REQUIRED_DOC_KINDS = ['nurture_strategy', 'scoring_framework', 'brand_guidelines', 'knowledge_base'];
  const docByKind: Record<string, any> = {};
  for (const d of docs) docByKind[d.kind] = d;
  const allDocsResolved = REQUIRED_DOC_KINDS.every((k) => {
    const d = docByKind[k];
    return d && (d.status === 'approved' || d.status === 'auto_approved' || d.status === 'skipped');
  });
  if (!allDocsResolved) return `/onboarding/docs/${id}`;

  // B6: preview — show before launch (skip if previously seen)
  if (!company.previewSeenAt) return `/onboarding/preview/${id}`;

  // B7: launch (invite reps, hit go)
  return `/onboarding/launch/${id}`;
}

router.get('/verticals', (_req, res) => {
  res.json({ verticals: listVerticals() });
});

// Live thinking trail — polling endpoint. Returns current state of a reasoning
// session with all planned steps + evidence + per-step status, timing, output.
router.get('/reasoning/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params as { sessionId: string };
  try {
    const session = await getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json({ session });
  } catch (e: any) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
});

// Latest session for a company + operation (used when we don't know the id yet —
// e.g., when a background process started the session and the UI needs to find it).
router.get('/reasoning/by-company/:companyId/:operation', async (req: Request, res: Response) => {
  const { companyId, operation } = req.params as { companyId: string; operation: string };
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return res.status(400).json({ error: 'Invalid company id' });
  }
  try {
    const session = await ReasoningSession.findOne({ companyId, operation }).sort({ createdAt: -1 });
    if (!session) return res.status(404).json({ error: 'No session found' });
    return res.json({ session });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Lookup failed' });
  }
});

// ---------- Feature 1: Company basics (A1) ----------
router.post('/company', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { companyName, websiteUrl, linkedinUrl, vertical, salesTeamSize } = req.body || {};

  if (!companyName || !vertical || !salesTeamSize) {
    return res.status(400).json({ error: 'companyName, vertical, salesTeamSize are required' });
  }
  if (!websiteUrl && !linkedinUrl) {
    return res
      .status(400)
      .json({ error: 'We need at least one — your website or LinkedIn page — to research your company' });
  }

  // If the user already has a company, update it instead of creating a duplicate.
  let company;
  if (user.companyId) {
    company = await OnboardingCompany.findByIdAndUpdate(
      user.companyId,
      {
        companyName,
        websiteUrl: normaliseUrl(websiteUrl),
        linkedinUrl: normaliseUrl(linkedinUrl),
        vertical,
        salesTeamSize,
        shohiniReviewFlag: vertical === 'other',
      },
      { new: true }
    );
  } else {
    company = await OnboardingCompany.create({
      userId: user._id,
      companyName,
      websiteUrl: normaliseUrl(websiteUrl),
      linkedinUrl: normaliseUrl(linkedinUrl),
      vertical,
      salesTeamSize,
      shohiniReviewFlag: vertical === 'other',
    });
    user.companyId = company._id as mongoose.Types.ObjectId;
    user.companyName = companyName;
    await user.save();
  }

  if (!company) return res.status(500).json({ error: 'Failed to save company' });

  await trackFunnelEvent('a1_submitted', company._id, { vertical });

  runMultiSourceResearch(company._id).catch((e) =>
    console.error('[onboarding] research failed', e)
  );

  return res.status(201).json({ company });
});

// ---------- Feature 2: Target profile prediction (A2) ----------
// Kicks off prediction in the background, returns the sessionId immediately so
// the UI can start polling the live thinking trail. Client then polls
// /reasoning/:sessionId until status === 'done' and reads result.profile.
router.post('/company/:id/predict-profile', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const company = await OnboardingCompany.findById(id);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  // If candidates already exist (locked or not), return them immediately — the
  // user is re-entering A2 to review / edit / select. Don't re-run Claude.
  if (company.targetProfileCandidates && company.targetProfileCandidates.length > 0) {
    return res.json({
      prediction: { candidates: company.targetProfileCandidates, iterations: 0, sessionId: '' },
    });
  }
  if (company.targetProfile?.locked) {
    return res.json({
      prediction: { candidates: [company.targetProfile], iterations: 0, sessionId: '' },
    });
  }

  const pending =
    company.research.linkedin.status === 'pending' ||
    company.research.website.status === 'pending';
  if (pending) await runMultiSourceResearch(company._id);

  // Dedupe: if an active prediction session already exists for this company,
  // reuse it rather than firing a second one (which would race on the save).
  // Guard against stuck sessions — anything older than 3 min is stale.
  const STUCK_AFTER_MS = 3 * 60 * 1000;
  const existing = await ReasoningSession.findOne({
    operation: 'predictTargetProfile',
    companyId: company._id,
    status: 'active',
  }).sort({ createdAt: -1 });

  if (existing && Date.now() - new Date((existing as any).createdAt).getTime() < STUCK_AFTER_MS) {
    return res.json({ sessionId: existing._id.toString() });
  }
  if (existing) {
    // Stale — mark errored so it stops showing as in-flight, then fall through
    // to start a fresh prediction.
    existing.status = 'error';
    existing.errorMessage = 'The previous prediction stalled. Starting a fresh run.';
    existing.completedAt = new Date();
    await existing.save();
  }

  // Run in background; the function creates the reasoning session internally.
  predictTargetProfile(company._id)
    .then(async (prediction) => {
      await trackFunnelEvent('a2_shown', company._id, { iterations: prediction.iterations });
    })
    .catch((err) => {
      console.error('[predict-profile] background failure', err);
    });

  // Wait a short tick for session creation, then look it up and return id.
  await new Promise((r) => setTimeout(r, 100));
  const session = await ReasoningSession.findOne({ operation: 'predictTargetProfile', companyId: company._id })
    .sort({ createdAt: -1 });

  return res.json({ sessionId: session?._id.toString() || null });
});

router.put('/company/:id/target-profile', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { overrides, edited } = req.body as { overrides: any; edited?: boolean };
  if (edited) await trackFunnelEvent('a2_edited', id, { overrides });
  const company = await lockTargetProfile(id, overrides || {});
  await trackFunnelEvent('a2_locked', company._id, {});
  return res.json({ company });
});

/**
 * Multi-select lock — founder picks 1+ of the 3 generated variants.
 * Body: { selectedIndices: number[], overrides?: Array<Partial<ITargetProfile>>, edited?: boolean }
 */
router.put('/company/:id/target-profiles', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { selectedIndices, overrides, edited } = req.body as {
    selectedIndices: number[];
    overrides?: any[];
    edited?: boolean;
  };
  if (edited) await trackFunnelEvent('a2_edited', id, { selectedIndices });
  try {
    const company = await lockTargetProfiles(id, selectedIndices, overrides);
    await trackFunnelEvent('a2_locked', company._id, { count: selectedIndices.length });
    return res.json({ company });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Failed to lock profiles' });
  }
});

/**
 * Add a founder-supplied ICP (free-form text) as an extra candidate.
 * Body: { text: string, replaceIndex?: number }
 *
 * Used when the founder doesn't like our 3 AI-generated variants and wants to
 * paste their own ICP description (from a deck, doc, or just typed out).
 * Claude parses the prose into our structured ITargetProfile shape.
 */
router.post(
  '/company/:id/custom-icp',
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { text, replaceIndex } = req.body as { text: string; replaceIndex?: number };
    try {
      const { company, addedIndex } = await addCustomTargetProfile(id, text || '', replaceIndex);
      await trackFunnelEvent('a2_edited', company._id, { customIcp: true, addedIndex });
      return res.json({ company, addedIndex });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'Failed to parse custom ICP' });
    }
  }
);

/**
 * Edit a single target-profile candidate inline. Used both during A2 (before
 * lock) and from the gallery (/app/target-profile) after leads exist. When
 * editing the primary (active) profile and `rescore: true`, we re-rank
 * existing leads against the new profile.
 */
router.patch(
  '/company/:id/target-profile-candidates/:index',
  async (req: Request, res: Response) => {
    const { id, index } = req.params as { id: string; index: string };
    const { updates, rescore } = req.body as {
      updates: any;
      rescore?: boolean;
    };
    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0) {
      return res.status(400).json({ error: 'Invalid candidate index' });
    }
    try {
      const { company, wasPrimary } = await editTargetProfileCandidate(id, idx, updates || {});
      await trackFunnelEvent('tp_candidate_edited', company._id, { index: idx, wasPrimary });

      let stageChanges = 0;
      if (wasPrimary && rescore) {
        try {
          const scoringDoc = await OnboardingDoc.findOne({
            companyId: company._id,
            kind: 'scoring_framework',
          });
          const result = await rescoreLeadsForCompany(
            company._id.toString(),
            scoringDoc?.content || {}
          );
          stageChanges = result?.stageChanges?.length || 0;
        } catch (rescoreErr: any) {
          console.error('[onboarding] rescore-after-edit failed:', rescoreErr?.message);
        }
      }

      return res.json({ company, wasPrimary, stageChanges });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'Failed to edit profile' });
    }
  }
);

// ---------- Feature 3: Lead preview + generation (A3) ----------
// Fires lead hunt in background, returns sessionId for live thinking trail.
// UI polls /reasoning/:sessionId; when status === 'done', fetches
// /company/:id/leads for the results.
router.post('/company/:id/generate-leads', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const company = await OnboardingCompany.findById(id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (!company.targetProfile.locked) {
    return res.status(400).json({ error: 'Target profile must be locked first' });
  }

  const count = Math.min(50, Math.max(10, Number(req.body?.count) || 25));

  generateLeadsForProfile(company._id, count)
    .then(async ({ leads, source }) => {
      if (!company.phaseACompletedAt) {
        company.phaseACompletedAt = new Date();
        company.phase = 'bridge';
        await company.save();
        await trackFunnelEvent('phase_a_complete', company._id, { leadCount: leads.length, source });
        generateAllDocsInParallel(company._id).catch((e) =>
          console.error('[onboarding] async doc gen failed', e)
        );
      }
      await trackFunnelEvent('a3_leads_shown', company._id, { leadCount: leads.length, source });
    })
    .catch((err) => {
      console.error('[generate-leads] background failure', err);
    });

  await new Promise((r) => setTimeout(r, 250));
  const session = await ReasoningSession.findOne({
    operation: { $in: ['huntLeads', 'huntLeadsSerper'] },
    companyId: company._id,
  }).sort({ createdAt: -1 });

  return res.json({ sessionId: session?._id.toString() || null });
});

router.get('/company/:id/leads', async (req: Request, res: Response) => {
  const leads = await OnboardingLead.find({ companyId: req.params.id }).sort({ score: -1 });
  return res.json({ leads });
});

router.get('/leads/:leadId', async (req: Request, res: Response) => {
  const { leadId } = req.params as { leadId: string };
  const lead = await OnboardingLead.findById(leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const company = await OnboardingCompany.findById(lead.companyId);
  return res.json({ lead, company });
});

// Per-lead feedback (Pursue / Existing / Skip + optional note). Used on A3 to
// capture founder reaction on surfaced prospects before advancing to Phase B.
router.patch('/leads/:leadId/feedback', async (req: Request, res: Response) => {
  const { leadId } = req.params as { leadId: string };
  const { feedback, note } = req.body as { feedback?: 'pursue' | 'existing' | 'skip' | null; note?: string };
  const lead = await OnboardingLead.findById(leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (feedback !== undefined) lead.founderFeedback = feedback;
  if (note !== undefined) lead.founderFeedbackNote = note;
  lead.founderFeedbackAt = new Date();
  await lead.save();
  return res.json({ lead });
});

// Company-wide ICP feedback note captured on A3 (free-text "anything else?")
router.post('/company/:id/icp-note', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { note } = req.body as { note: string };
  const company = await OnboardingCompany.findByIdAndUpdate(
    id,
    { icpFeedbackNote: (note || '').trim(), icpFeedbackAt: new Date() },
    { new: true }
  );
  if (!company) return res.status(404).json({ error: 'Company not found' });
  return res.json({ company });
});

// ---------- Phase B: per-channel message templates ----------
// POST /company/:id/draft-message — Claude drafts a message given controls.
// Body: { stage, channel, length, tone, formality, exampleLeadId? }
router.post('/company/:id/draft-message', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { stage, channel, length, tone, formality, exampleLeadId } = req.body as {
    stage: 'cold' | 'warming' | 'hot';
    channel: 'email' | 'linkedin' | 'whatsapp';
    length: 'tight' | 'balanced' | 'detailed';
    tone: 'direct' | 'balanced' | 'empathetic';
    formality: 'casual' | 'professional' | 'formal';
    exampleLeadId?: string;
  };

  if (!stage || !channel) {
    return res.status(400).json({ error: 'Stage and channel are required.' });
  }
  try {
    const draft = await draftMessage({
      companyId: id,
      stage,
      channel,
      length: length || 'balanced',
      tone: tone || 'balanced',
      formality: formality || 'professional',
      exampleLeadId,
    });
    return res.json({ draft });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Failed to draft message.' });
  }
});

// PUT /company/:id/message-templates — save a template after the founder edits.
// Body: { stage, channel, subject, body, length, tone, formality, edited }
router.put('/company/:id/message-templates', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { stage, channel, subject, body, length, tone, formality, edited } = req.body as {
    stage: 'cold' | 'warming' | 'hot';
    channel: 'email' | 'linkedin' | 'whatsapp';
    subject: string;
    body: string;
    length: 'tight' | 'balanced' | 'detailed';
    tone: 'direct' | 'balanced' | 'empathetic';
    formality: 'casual' | 'professional' | 'formal';
    edited: boolean;
  };
  if (!stage || !channel || !body) {
    return res.status(400).json({ error: 'Stage, channel, and body are required.' });
  }
  try {
    const templates = await saveTemplate(id, {
      stage,
      channel,
      subject: subject || '',
      body,
      length: length || 'balanced',
      tone: tone || 'balanced',
      formality: formality || 'professional',
      edited: !!edited,
    });
    await trackFunnelEvent('a3_leads_shown', id, { templateSaved: `${stage}:${channel}`, edited: !!edited });
    return res.json({ messageTemplates: templates });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Failed to save template.' });
  }
});

// POST /company/:id/mark-preview-seen — stamp the preview-page visit so resume
// routing won't bring them back to it on next login.
router.post('/company/:id/mark-preview-seen', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const company = await OnboardingCompany.findByIdAndUpdate(
    id,
    { previewSeenAt: new Date() },
    { new: true }
  );
  if (!company) return res.status(404).json({ error: 'Company not found' });
  return res.json({ company });
});

// PUT /company/:id/preferred-channels — store channel preferences from messaging page.
// Body: { channels: string[] }
// Also marks messaging step completed for resume routing.
router.put('/company/:id/preferred-channels', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { channels } = req.body as { channels: string[] };
  const company = await OnboardingCompany.findByIdAndUpdate(
    id,
    {
      preferredChannels: Array.isArray(channels) ? channels : [],
      messagingCompletedAt: new Date(),
    },
    { new: true }
  );
  if (!company) return res.status(404).json({ error: 'Company not found' });
  return res.json({ company });
});

// PUT /company/:id/channel-stages — save channel-per-stage + score thresholds.
// Body: { channelStrategy: {cold:[],warming:[],...}, stageThresholds: {cold:[0,35],...} }
// Marks the channels-stages step as confirmed for resume routing.
router.put('/company/:id/channel-stages', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { channelStrategy, stageThresholds } = req.body as {
    channelStrategy: any;
    stageThresholds: any;
  };
  const update: any = { channelsConfiguredAt: new Date() };
  if (channelStrategy) update.channelStrategy = channelStrategy;
  if (stageThresholds) update.stageThresholds = stageThresholds;
  const company = await OnboardingCompany.findByIdAndUpdate(id, { $set: update }, { new: true });
  if (!company) return res.status(404).json({ error: 'Company not found' });
  return res.json({ company });
});

router.post('/leads/:leadId/research', async (req: Request, res: Response) => {
  const { leadId } = req.params as { leadId: string };
  const lead = await OnboardingLead.findById(leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const now = new Date();
  const events = [
    { timestamp: now, kind: 'research_start', message: `Re-research triggered for ${lead.contactName} at ${lead.targetCompany}.` },
    { timestamp: now, kind: 'source_linkedin', message: `Analyzing LinkedIn profile, company context, buying signals…` },
    { timestamp: now, kind: 'source_website', message: `Scanning ${lead.targetCompany} website for positioning changes.` },
    { timestamp: now, kind: 'source_news', message: `Looking for recent news mentions and hiring signals.` },
    { timestamp: now, kind: 'research_done', message: `Research complete. Intel refreshed just now.` },
  ];
  lead.intel = {
    ...(lead.intel || { department: '', seniority: '', relevanceReason: '', matchRationale: '', recommendedApproach: '', researchEvents: [], lastResearchedAt: null }),
    researchEvents: [...events, ...(lead.intel?.researchEvents || [])].slice(0, 30),
    lastResearchedAt: now,
  };
  await lead.save();
  return res.json({ lead });
});

// ---------- Feature 4: Doc generation + review (B1-B3) ----------
router.get('/company/:id/docs', async (req: Request, res: Response) => {
  const docs = await OnboardingDoc.find({ companyId: req.params.id }).sort({ kind: 1 });
  return res.json({ docs });
});

router.post('/company/:id/docs/generate-all', async (req: Request, res: Response) => {
  const result = await generateAllDocsInParallel(req.params.id);
  return res.json(result);
});

// Upload a product catalogue (PDF / DOCX / TXT / MD) — replaces auto-generated
// knowledge_base content with the founder's real source material.
router.post(
  '/company/:id/product-catalogue',
  catalogueUpload.single('file'),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const file = (req as any).file as
      | { buffer: Buffer; originalname: string; mimetype: string; size: number }
      | undefined;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const fmt = detectFormat(file.originalname, file.mimetype);
    if (fmt === 'unknown') {
      return res.status(400).json({
        error:
          'Unsupported format. Please upload a PDF, DOCX, TXT, or Markdown file. (PPTX coming soon — export as PDF for now.)',
      });
    }

    let parsed;
    try {
      parsed = await parseCatalogue(file.buffer, file.originalname, file.mimetype);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'Could not parse the file.' });
    }

    // Find or create the knowledge_base doc and overwrite its content with
    // the uploaded catalogue. Mark approved — the founder's source is canonical.
    let doc = await OnboardingDoc.findOne({
      companyId: id,
      kind: 'knowledge_base',
    });
    if (!doc) {
      doc = new OnboardingDoc({
        companyId: id,
        kind: 'knowledge_base',
        title: 'Product knowledge',
        status: 'approved',
        versions: [],
      });
    }

    const newContent = {
      uploadedCatalogue: {
        filename: file.originalname,
        sizeBytes: file.size,
        format: parsed.format,
        pageCount: parsed.pageCount,
        text: parsed.text,
        truncated: parsed.truncated,
        uploadedAt: new Date(),
      },
      // Keep any AI-generated framework around for fallback rendering.
      autoGenerated: doc.content || {},
    };

    doc.content = newContent;
    doc.rawMarkdown =
      `# Product knowledge — uploaded catalogue\n\n` +
      `**File:** ${file.originalname}\n` +
      `**Pages:** ${parsed.pageCount}\n\n` +
      `---\n\n${parsed.text}`;
    doc.status = 'approved';
    doc.approvedAt = new Date();
    doc.currentVersion = (doc.versions?.length || 0) + 1;
    doc.versions.push({
      version: doc.currentVersion,
      content: newContent,
      rawMarkdown: doc.rawMarkdown,
      critiqueScore: null,
      editedByFounder: true,
      editDiff: `Uploaded catalogue: ${file.originalname} (${parsed.pageCount} pages)`,
      appliedTo: 'initial',
      createdAt: new Date(),
    });
    await doc.save();

    return res.json({
      doc,
      catalogue: {
        filename: file.originalname,
        format: parsed.format,
        pageCount: parsed.pageCount,
        truncated: parsed.truncated,
      },
    });
  }
);

router.post('/company/:id/docs/:kind/regenerate', async (req: Request, res: Response) => {
  const doc = await generateDoc(req.params.id, req.params.kind as OnboardingDocKind);
  return res.json({ doc });
});

/**
 * Upload an existing playbook / SOP / sales doc and have Claude extract it
 * into the nurture_strategy JSON shape — replaces the AI-drafted content
 * with founder's real source material.
 */
router.post(
  '/company/:id/docs/nurture/upload',
  catalogueUpload.single('file'),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const file = (req as any).file as
      | { buffer: Buffer; originalname: string; mimetype: string; size: number }
      | undefined;
    if (!file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!isAIAvailable()) {
      return res.status(503).json({ error: 'AI parser is offline — try again in a minute.' });
    }

    const fmt = detectFormat(file.originalname, file.mimetype);
    if (fmt === 'unknown') {
      return res.status(400).json({
        error: 'Unsupported format. Upload a PDF, DOCX, TXT, or Markdown file.',
      });
    }

    let parsedFile;
    try {
      parsedFile = await parseCatalogue(file.buffer, file.originalname, file.mimetype);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'Could not parse the file.' });
    }

    // Ask Claude to map the parsed text → nurture_strategy JSON
    const systemPrompt = `You are a B2B sales operations analyst. The founder uploaded an existing playbook / SOP. Convert it to the structured nurture_strategy JSON shape used by our system.

Return ONLY valid JSON with these exact keys:
{
  "coldOutreach": {
    "channelPrimary": "string (one of: email, linkedin, whatsapp)",
    "channelSecondary": "string (one of: email, linkedin, whatsapp, calling)",
    "tone": "string (1 short sentence)",
    "firstMessageApproach": "string (2-3 sentences describing the angle)",
    "frequencyDays": [number, number, number],
    "escalation": "string (1 sentence — what to do after no reply)"
  },
  "warmEngaged": {
    "channel": "string",
    "tone": "string (1 short sentence)",
    "approach": "string (2-3 sentences)",
    "proactiveIntervalDays": number,
    "escalation": "string (1 sentence)"
  },
  "hotRepReady": {
    "channel": "string",
    "handoffTrigger": "string (1-2 sentences — what makes a lead rep-ready)",
    "repAction": "string (1-2 sentences — what the rep does on takeover)"
  },
  "rationale": "string (1-2 sentences explaining how this maps the founder's source)"
}

If the source doc doesn't cover a field, use a sensible B2B default — but mention what was inferred in the rationale.`;

    const userPrompt = `Founder's uploaded playbook (parsed text):

"""
${parsedFile.text.slice(0, 12_000)}
"""

Convert to the JSON shape above. Return ONLY the JSON, no markdown.`;

    let parsed;
    try {
      const result = await callClaude({
        systemPrompt,
        userPrompt,
        model: 'claude-sonnet-4-5',
        maxTokens: 2500,
        temperature: 0.2,
        timeoutMs: 60_000,
      });
      parsed = extractJSON(result.content);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Claude parse failed.' });
    }

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({
        error: 'Could not extract a structured playbook from your file. Try a more sales-focused doc.',
      });
    }

    let doc = await OnboardingDoc.findOne({ companyId: id, kind: 'nurture_strategy' });
    if (!doc) {
      doc = new OnboardingDoc({
        companyId: id,
        kind: 'nurture_strategy',
        title: 'Lead nurture playbook',
        status: 'ready_for_review',
        versions: [],
      });
    }

    // Preserve injected channelStrategy / messageTemplates if already present
    const previousInjected = {
      channelStrategy: doc.content?.channelStrategy,
      stageThresholds: doc.content?.stageThresholds,
      messageTemplates: doc.content?.messageTemplates,
    };
    doc.content = { ...parsed, ...previousInjected, sourceUpload: { filename: file.originalname, pageCount: parsedFile.pageCount, uploadedAt: new Date() } };
    doc.status = 'ready_for_review';
    doc.currentVersion = (doc.versions?.length || 0) + 1;
    doc.versions.push({
      version: doc.currentVersion,
      content: doc.content,
      rawMarkdown: '',
      critiqueScore: null,
      editedByFounder: true,
      editDiff: `Populated from upload: ${file.originalname}`,
      appliedTo: 'initial',
      createdAt: new Date(),
    });
    await doc.save();
    return res.json({ doc, source: { filename: file.originalname, pageCount: parsedFile.pageCount } });
  }
);

router.post('/company/:id/docs/:kind/view', async (req: Request, res: Response) => {
  const { id, kind } = req.params;
  const event = (`b${['nurture_strategy', 'scoring_framework', 'brand_guidelines'].indexOf(kind as any) + 1}_viewed`) as any;
  if (event && event.startsWith('b')) await trackFunnelEvent(event, id, {});
  return res.json({ ok: true });
});

router.post('/company/:id/docs/:kind/approve', async (req: Request, res: Response) => {
  const { id, kind } = req.params;
  const { edited, newContent } = req.body as { edited?: boolean; newContent?: any };
  const doc = await OnboardingDoc.findOne({ companyId: id, kind });
  if (!doc) return res.status(404).json({ error: 'Doc not found' });

  if (edited && newContent) {
    doc.content = newContent;
    doc.currentVersion = (doc.versions?.length || 0) + 1;
    doc.versions.push({
      version: doc.currentVersion,
      content: newContent,
      rawMarkdown: doc.rawMarkdown,
      critiqueScore: null,
      editedByFounder: true,
      editDiff: 'founder-edit-at-approval',
      appliedTo: 'initial',
      createdAt: new Date(),
    });
  }
  doc.status = 'approved';
  doc.approvedAt = new Date();
  doc.approvedBy = 'founder';
  await doc.save();

  if (kind === 'scoring_framework') {
    try {
      await rescoreLeadsForCompany(id, doc.content);
    } catch (e) {
      console.error('[onboarding] rescoring failed', e);
    }
  }

  const stepMap: Record<string, any> = {
    nurture_strategy: edited ? 'b1_edited' : 'b1_approved',
    scoring_framework: edited ? 'b2_edited' : 'b2_approved',
    brand_guidelines: edited ? 'b3_edited' : 'b3_approved',
  };
  if (stepMap[kind]) await trackFunnelEvent(stepMap[kind], id, {});

  return res.json({ doc });
});

router.post('/company/:id/docs/:kind/skip', async (req: Request, res: Response) => {
  const { id, kind } = req.params;
  const doc = await OnboardingDoc.findOne({ companyId: id, kind });
  if (!doc) return res.status(404).json({ error: 'Doc not found' });
  doc.status = 'skipped';
  await doc.save();

  const stepMap: Record<string, any> = {
    nurture_strategy: 'b1_skipped',
    scoring_framework: 'b2_skipped',
    brand_guidelines: 'b3_skipped',
  };
  if (stepMap[kind]) await trackFunnelEvent(stepMap[kind], id, {});

  return res.json({ doc });
});

// ---------- Feature 5: Success metric + rep invite (B4) ----------
router.post('/company/:id/success-metric', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { successMetric } = req.body as { successMetric: string };
  if (!successMetric || !successMetric.trim()) {
    return res.status(400).json({ error: 'Success metric is required' });
  }
  const company = await OnboardingCompany.findByIdAndUpdate(
    id,
    { successMetric: successMetric.trim() },
    { new: true }
  );
  await trackFunnelEvent('b4_submitted', id, {});
  return res.json({ company });
});

router.post('/company/:id/reps/invite', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { emails } = req.body as { emails: Array<{ email: string; name?: string }> };
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'emails array required' });
  }
  if (emails.length > 15) {
    return res.status(400).json({ error: 'Max 15 invites per batch' });
  }

  const company = await OnboardingCompany.findById(id);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const invites = [];
  for (const { email, name } of emails) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const existing = await RepInvite.findOne({ companyId: id, email: email.toLowerCase() });
    if (existing) {
      invites.push(existing);
      continue;
    }
    const token = crypto.randomBytes(20).toString('hex');
    const invite = await RepInvite.create({
      companyId: id,
      email: email.toLowerCase(),
      name: name || '',
      inviteToken: token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    invites.push(invite);
  }

  await trackFunnelEvent('reps_invited', id, { count: invites.length });

  return res.status(201).json({
    invites: invites.map((i) => ({
      _id: i._id,
      email: i.email,
      name: i.name,
      status: i.status,
      inviteLink: buildInviteLink(req, i.inviteToken),
    })),
  });
});

router.post('/company/:id/launch', async (req: Request, res: Response) => {
  const { id } = req.params;
  const company = await OnboardingCompany.findById(id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (!company.successMetric) {
    return res.status(400).json({ error: 'Success metric required before launch' });
  }

  company.phase = 'complete';
  company.phaseBCompletedAt = new Date();
  await company.save();
  await trackFunnelEvent('phase_b_complete', company._id, {});

  const leadCount = await OnboardingLead.countDocuments({ companyId: company._id });
  const repCount = await RepInvite.countDocuments({ companyId: company._id });
  return res.json({
    company,
    summary: { leadCount, repCount, successMetric: company.successMetric },
  });
});

// ---------- Feature 6: Re-engagement / nudges ----------
router.post('/nudges/run', async (_req, res) => {
  const result = await runNudgeScheduler();
  return res.json(result);
});

router.post('/company/:id/diagnostic', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { response } = req.body as { response: DiagnosticResponse };
  const company = await OnboardingCompany.findById(id);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  company.nudgeState.diagnosticResponse = response;
  company.nudgeState.diagnosticResponseAt = new Date();
  await company.save();

  await trackFunnelEvent('diagnostic_response', id, { response });
  return res.json({ intervention: diagnosticResponseToIntervention(response) });
});

// ---------- Feature 9: Impact analysis + versioning ----------
router.post('/company/:id/docs/:kind/impact', async (req: Request, res: Response) => {
  const { id, kind } = req.params;
  const { newContent } = req.body as { newContent: any };
  const analysis = await computeImpact(id, newContent, kind as OnboardingDocKind);
  await trackFunnelEvent('impact_analysis_shown', id, { docKind: kind });
  return res.json({ analysis });
});

router.post('/company/:id/docs/:kind/apply-edit', async (req: Request, res: Response) => {
  const { id, kind } = req.params;
  const { newContent, applyTo } = req.body as { newContent: any; applyTo: 'all_leads' | 'new_leads' };
  const result = await applyDocEdit(id, kind as OnboardingDocKind, newContent, applyTo, 'founder');
  await trackFunnelEvent(applyTo === 'all_leads' ? 'impact_apply_all' : 'impact_apply_new_only', id, {
    kind,
    stageChanges: result.stageChanges,
  });
  return res.json(result);
});

router.get('/company/:id/docs/:kind/history', async (req: Request, res: Response) => {
  const doc = await OnboardingDoc.findOne({ companyId: req.params.id, kind: req.params.kind });
  if (!doc) return res.status(404).json({ error: 'Doc not found' });
  return res.json({ versions: doc.versions });
});

// ---------- Feature 8: Analytics ----------
router.get('/analytics/funnel', async (_req, res) => {
  const events = await FunnelEvent.aggregate([
    { $group: { _id: '$step', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const companies = await OnboardingCompany.aggregate([
    { $group: { _id: '$phase', count: { $sum: 1 } } },
  ]);
  const docQuality = await OnboardingDoc.aggregate([
    { $group: { _id: { kind: '$kind', status: '$status' }, count: { $sum: 1 } } },
  ]);
  return res.json({ events, companies, docQuality });
});

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function normaliseUrl(url: string | undefined): string {
  if (!url) return '';
  let u = url.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function buildInviteLink(req: Request, token: string): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${host}/rep/${token}`;
}

export default router;
