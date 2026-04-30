import mongoose from 'mongoose';
import { OnboardingCompany, IOnboardingCompany } from '../../models/OnboardingCompany';
import { OnboardingDoc } from '../../models/OnboardingDoc';
import { OnboardingLead } from '../../models/OnboardingLead';
import { trackFunnelEvent } from './funnelTracker';
import { getVerticalTemplate } from './verticalTemplates';

export type DiagnosticResponse = 'too_many_steps' | 'not_sure_strategy' | 'will_do_later' | 'need_help';

export interface NudgeOutboundMessage {
  channel: 'in_app' | 'email' | 'whatsapp' | 'founder_team';
  subject?: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}

/**
 * Nudge delivery is currently log-only (channels like WhatsApp and email require
 * infra outside this repo). The scheduler below is complete — hook real delivery
 * adapters into dispatchMessage when those integrations are wired.
 */
async function dispatchMessage(
  company: IOnboardingCompany,
  message: NudgeOutboundMessage
): Promise<void> {
  // TODO: real channel adapters (SendGrid / Postmark / WhatsApp Business API / in-app notification center).
  console.log(`[nudgeService] DISPATCH ${message.channel} → ${company.companyName}`, {
    subject: message.subject,
    body: message.body,
    ctaLabel: message.ctaLabel,
    ctaHref: message.ctaHref,
  });
}

async function getOpenLeadCount(companyId: mongoose.Types.ObjectId): Promise<number> {
  return OnboardingLead.countDocuments({ companyId });
}

async function getPendingDoc(companyId: mongoose.Types.ObjectId): Promise<string | null> {
  const doc = await OnboardingDoc.findOne({
    companyId,
    kind: { $in: ['nurture_strategy', 'scoring_framework', 'brand_guidelines'] },
    status: { $in: ['ready_for_review', 'draft', 'generating'] },
  });
  return doc?.title || null;
}

export async function fireNudge24h(company: IOnboardingCompany): Promise<void> {
  if (company.nudgeState.hour24Fired) return;
  const leadCount = await getOpenLeadCount(company._id as mongoose.Types.ObjectId);
  const pending = await getPendingDoc(company._id as mongoose.Types.ObjectId);

  await dispatchMessage(company, {
    channel: 'in_app',
    body: `Your ${leadCount} leads are in the pipeline — but your AI doesn't know how to talk to them yet. ${pending ? `One doc left: ${pending}.` : ''} 10 minutes to fix that.`,
    ctaLabel: 'Continue setup',
    ctaHref: '/onboarding/docs',
  });

  company.nudgeState.hour24Fired = true;
  await company.save();
  await trackFunnelEvent('nudge_24h_fired', company._id, { leadCount });
}

export async function fireNudge48h(company: IOnboardingCompany): Promise<void> {
  if (company.nudgeState.hour48Fired) return;
  const leadCount = await getOpenLeadCount(company._id as mongoose.Types.ObjectId);

  await dispatchMessage(company, {
    channel: 'email',
    subject: `Your ${company.companyName} leads are waiting — what stopped you?`,
    body: `Hi ${company.companyName} team,\n\nYour AI found ${leadCount} leads matching your target profile. They're sitting in your pipeline, but the AI is using generic messaging.\n\nQuick question — what held you back?\n\n[Too many steps]  [Not sure about the strategy]  [Will do it later]  [Need help]\n\n10 minutes to teach it how to sound like ${company.companyName}.`,
    ctaLabel: 'Complete your setup',
    ctaHref: '/onboarding/docs',
  });

  company.nudgeState.hour48Fired = true;
  await company.save();
  await trackFunnelEvent('nudge_48h_fired', company._id, { leadCount });
}

export async function fireNudge72h(company: IOnboardingCompany): Promise<void> {
  if (company.nudgeState.hour72Fired) return;
  const leadCount = await getOpenLeadCount(company._id as mongoose.Types.ObjectId);

  await dispatchMessage(company, {
    channel: 'whatsapp',
    body: `Hi ${company.companyName} — this is the MerakiPeople team. Your pipeline has ${leadCount} leads but the AI is running on defaults. Want us to walk you through the last 10 minutes of setup? Takes no time.`,
    ctaHref: '/onboarding/docs',
  });

  company.nudgeState.hour72Fired = true;
  await company.save();
  await trackFunnelEvent('nudge_72h_fired', company._id, { leadCount });
}

export async function fireNudgeDay5(company: IOnboardingCompany): Promise<void> {
  if (company.nudgeState.day5Fired) return;
  const leadCount = await getOpenLeadCount(company._id as mongoose.Types.ObjectId);
  const diag = company.nudgeState.diagnosticResponse;

  if (diag === 'not_sure_strategy' || diag === 'need_help') {
    await dispatchMessage(company, {
      channel: 'founder_team',
      body: `Hi ${company.companyName} — you mentioned you weren't sure about the strategy. The MerakiPeople team is happy to spend 10 minutes with you to co-review the docs. When works this week?`,
    });
  } else if (!diag) {
    await dispatchMessage(company, {
      channel: 'email',
      subject: `Last check — should we set up your AI with ${getVerticalTemplate(company.vertical).displayName} defaults?`,
      body: `Hi ${company.companyName},\n\nWe haven't heard back. Your ${leadCount} leads are still waiting.\n\nWe can activate ${getVerticalTemplate(company.vertical).displayName} best-practice defaults so your reps aren't blocked. You can customize anytime later.\n\n[Go ahead with defaults]  [No — I'll finish setup this week]  [I need help]`,
      ctaLabel: 'Go ahead with defaults',
      ctaHref: '/onboarding/auto-approve',
    });
  }

  company.nudgeState.day5Fired = true;
  await company.save();
  await trackFunnelEvent('nudge_day5_fired', company._id, { leadCount, diagnosticResponse: diag });
}

export async function autoApproveDay7(company: IOnboardingCompany): Promise<void> {
  if (company.nudgeState.day7AutoApproved) return;

  const pending = await OnboardingDoc.find({
    companyId: company._id,
    kind: { $in: ['nurture_strategy', 'scoring_framework', 'brand_guidelines'] },
    status: { $in: ['ready_for_review', 'draft', 'skipped'] },
  });

  for (const doc of pending) {
    doc.status = 'auto_approved';
    doc.approvedAt = new Date();
    doc.approvedBy = 'system (day7 auto-approval)';
    await doc.save();
  }

  await dispatchMessage(company, {
    channel: 'email',
    subject: 'We activated your vertical defaults — your reps are unblocked',
    body: `We activated ${getVerticalTemplate(company.vertical).displayName} defaults so your reps aren't waiting. You can refine anytime from Settings → Strategy Docs.`,
    ctaLabel: 'Review now',
    ctaHref: '/onboarding/docs',
  });

  company.nudgeState.day7AutoApproved = true;
  company.phase = 'complete';
  company.phaseBCompletedAt = new Date();
  await company.save();
  await trackFunnelEvent('nudge_day7_auto_approve', company._id, { autoApprovedDocs: pending.length });
}

export function diagnosticResponseToIntervention(response: DiagnosticResponse): {
  route: string;
  explanation: string;
} {
  switch (response) {
    case 'too_many_steps':
      return {
        route: '/onboarding/simplified',
        explanation: 'We\'ll show you only the most critical doc (brand guidelines) — approve that and your AI starts selling.',
      };
    case 'not_sure_strategy':
      return {
        route: '/onboarding/schedule-call',
        explanation: 'The MerakiPeople team will reach out to co-review the strategy docs with you in 10 minutes.',
      };
    case 'will_do_later':
      return {
        route: '/onboarding/schedule-reminder',
        explanation: 'Pick a time and we\'ll remind you.',
      };
    case 'need_help':
      return {
        route: '/onboarding/guided',
        explanation: 'We\'ll walk you through step-by-step with tooltips. Our team will also be notified.',
      };
    default:
      return {
        route: '/onboarding/docs',
        explanation: 'Continue where you left off.',
      };
  }
}

/**
 * Scheduler — call periodically (e.g., cron every 15 min). For each company in
 * Phase B-pending state, fire the right nudge based on time elapsed.
 */
export async function runNudgeScheduler(): Promise<{
  processed: number;
  fired: { h24: number; h48: number; h72: number; d5: number; d7: number };
}> {
  const now = Date.now();
  const eligible = await OnboardingCompany.find({
    phase: { $in: ['bridge', 'phase_b'] },
    phaseACompletedAt: { $ne: null },
  });

  const fired = { h24: 0, h48: 0, h72: 0, d5: 0, d7: 0 };

  for (const company of eligible) {
    const completedAt = company.phaseACompletedAt?.getTime() || now;
    const elapsedMs = now - completedAt;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    const elapsedDays = elapsedHours / 24;

    if (elapsedHours >= 168 && !company.nudgeState.day7AutoApproved) {
      await autoApproveDay7(company);
      fired.d7++;
    } else if (elapsedDays >= 5 && !company.nudgeState.day5Fired) {
      await fireNudgeDay5(company);
      fired.d5++;
    } else if (elapsedHours >= 72 && !company.nudgeState.hour72Fired) {
      await fireNudge72h(company);
      fired.h72++;
    } else if (elapsedHours >= 48 && !company.nudgeState.hour48Fired) {
      await fireNudge48h(company);
      fired.h48++;
    } else if (elapsedHours >= 24 && !company.nudgeState.hour24Fired) {
      await fireNudge24h(company);
      fired.h24++;
    }
  }

  return { processed: eligible.length, fired };
}
