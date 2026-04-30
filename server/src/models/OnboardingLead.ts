import mongoose, { Schema, Document } from 'mongoose';

export type OnboardingLeadStage = 'cold' | 'warming' | 'warm' | 'hot' | 'ready';

export interface IOnboardingLead extends Document {
  companyId: mongoose.Types.ObjectId;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactEmailVerified: boolean;
  targetCompany: string;
  targetCompanyWebsite: string;
  city: string;
  industry: string;
  subIndustry: string;
  targetTeamSize: string;
  matchPercent: number;
  score: number;
  stage: OnboardingLeadStage;
  scoreBreakdown: {
    companyFit: number;
    engagement: number;
    intent: number;
    recency: number;
  };
  assignedRepInviteId: mongoose.Types.ObjectId | null;
  generatedFromProfile: boolean;
  founderFeedback: 'pursue' | 'existing' | 'skip' | null;
  founderFeedbackNote: string;
  founderFeedbackAt: Date | null;
  intel: {
    department: string;
    seniority: string;
    relevanceReason: string;
    matchRationale: string;
    recommendedApproach: string;
    companyDescription: string;
    researchEvents: Array<{ timestamp: Date; kind: string; message: string }>;
    lastResearchedAt: Date | null;
  };
  linkedinUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const OnboardingLeadSchema = new Schema<IOnboardingLead>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'OnboardingCompany', required: true, index: true },
    contactName: { type: String, required: true },
    contactTitle: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    contactEmailVerified: { type: Boolean, default: false },
    targetCompany: { type: String, required: true },
    targetCompanyWebsite: { type: String, default: '' },
    city: { type: String, default: '' },
    industry: { type: String, default: '' },
    subIndustry: { type: String, default: '' },
    targetTeamSize: { type: String, default: '' },
    matchPercent: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    stage: {
      type: String,
      enum: ['cold', 'warming', 'warm', 'hot', 'ready'],
      default: 'cold',
    },
    scoreBreakdown: {
      companyFit: { type: Number, default: 0 },
      engagement: { type: Number, default: 0 },
      intent: { type: Number, default: 0 },
      recency: { type: Number, default: 0 },
    },
    assignedRepInviteId: { type: Schema.Types.ObjectId, ref: 'RepInvite', default: null },
    generatedFromProfile: { type: Boolean, default: true },
    founderFeedback: {
      type: String,
      enum: ['pursue', 'existing', 'skip', null],
      default: null,
    },
    founderFeedbackNote: { type: String, default: '' },
    founderFeedbackAt: { type: Date, default: null },
    intel: {
      department: { type: String, default: '' },
      seniority: { type: String, default: '' },
      relevanceReason: { type: String, default: '' },
      matchRationale: { type: String, default: '' },
      recommendedApproach: { type: String, default: '' },
      companyDescription: { type: String, default: '' },
      researchEvents: [
        {
          timestamp: { type: Date, default: Date.now },
          kind: { type: String, default: 'event' },
          message: { type: String, default: '' },
        },
      ],
      lastResearchedAt: { type: Date, default: null },
    },
    linkedinUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

OnboardingLeadSchema.index({ companyId: 1, stage: 1 });
OnboardingLeadSchema.index({ companyId: 1, score: -1 });

export const OnboardingLead = mongoose.model<IOnboardingLead>('OnboardingLead', OnboardingLeadSchema);
