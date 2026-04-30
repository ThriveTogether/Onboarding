import mongoose, { Schema, Document } from 'mongoose';

export type FunnelStep =
  | 'signup'
  | 'a1_started'
  | 'a1_submitted'
  | 'a2_shown'
  | 'a2_edited'
  | 'a2_locked'
  | 'a3_leads_shown'
  | 'phase_a_complete'
  | 'b1_viewed'
  | 'b1_approved'
  | 'b1_edited'
  | 'b1_skipped'
  | 'b2_viewed'
  | 'b2_approved'
  | 'b2_edited'
  | 'b2_skipped'
  | 'b3_viewed'
  | 'b3_approved'
  | 'b3_edited'
  | 'b3_skipped'
  | 'b4_submitted'
  | 'reps_invited'
  | 'phase_b_complete'
  | 'nudge_24h_fired'
  | 'nudge_48h_fired'
  | 'nudge_72h_fired'
  | 'nudge_day5_fired'
  | 'nudge_day7_auto_approve'
  | 'diagnostic_response'
  | 'rep_first_login'
  | 'rep_cv_uploaded'
  | 'rep_cv_skipped'
  | 'doc_edited_post_onboarding'
  | 'impact_analysis_shown'
  | 'impact_apply_all'
  | 'impact_apply_new_only'
  | 'tp_candidate_edited';

export interface IFunnelEvent extends Document {
  companyId: mongoose.Types.ObjectId | null;
  repInviteId: mongoose.Types.ObjectId | null;
  step: FunnelStep;
  metadata: Record<string, any>;
  createdAt: Date;
}

const FunnelEventSchema = new Schema<IFunnelEvent>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'OnboardingCompany', default: null, index: true },
    repInviteId: { type: Schema.Types.ObjectId, ref: 'RepInvite', default: null },
    step: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const FunnelEvent = mongoose.model<IFunnelEvent>('FunnelEvent', FunnelEventSchema);
