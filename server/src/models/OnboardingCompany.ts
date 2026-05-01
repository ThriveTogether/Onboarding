import mongoose, { Schema, Document } from 'mongoose';

export type OnboardingVertical =
  | 'manufacturing'
  | 'bfsi'
  | 'hr_recruitment'
  | 'b2b_services'
  | 'b2b_saas'
  | 'edtech_b2c'
  | 'other';

export type SalesTeamSize = '2-5' | '6-10' | '11-15';

export type OnboardingPhase = 'phase_a' | 'bridge' | 'phase_b' | 'complete';

export interface ITargetProfile {
  geography: string;
  companySize: string;
  salesTeamSize: string;
  industryFocus: string;
  decisionMakers: string[];
  painSignals: string[];
  locked: boolean;
  approvedAt: Date | null;
  variantLabel?: string;
  variantThesis?: string;
  confidenceNotes?: string;
  isSelected?: boolean;
}

export type MessageStage = 'cold' | 'warming' | 'hot';
export type MessageChannel = 'email' | 'linkedin' | 'whatsapp';
export type MessageLength = 'tight' | 'balanced' | 'detailed';
export type MessageTone = 'direct' | 'balanced' | 'empathetic';
export type MessageFormality = 'casual' | 'professional' | 'formal';

export interface IMessageTemplate {
  stage: MessageStage;
  channel: MessageChannel;
  subject: string;
  body: string;
  length: MessageLength;
  tone: MessageTone;
  formality: MessageFormality;
  edited: boolean;
  updatedAt: Date;
}

/**
 * 5-stage funnel — cold → warming → warm → hot → ready. Per stage we capture
 * which channels are used + a score range. Hot/Ready can include 'calling' as
 * the founder/rep takes over.
 */
export type AllowedChannel = 'email' | 'linkedin' | 'whatsapp' | 'calling';

export interface IChannelStrategy {
  cold: AllowedChannel[];
  warming: AllowedChannel[];
  warm: AllowedChannel[];
  hot: AllowedChannel[];
  ready: AllowedChannel[];
}

export interface IStageThresholds {
  cold: [number, number];
  warming: [number, number];
  warm: [number, number];
  hot: [number, number];
  ready: [number, number];
}

export interface ICompanyResearch {
  linkedin: {
    status: 'pending' | 'success' | 'partial' | 'failed' | 'skipped' | 'not_found';
    about: string;
    employeeCount: string;
    specialities: string[];
    headquarters: string;
    recentPosts: string[];
    followerCount: number | null;
    fetchedAt: Date | null;
  };
  website: {
    status: 'pending' | 'success' | 'partial' | 'failed' | 'skipped' | 'not_found';
    positioning: string;
    products: string[];
    toneSignals: string[];
    competitorSignals: string[];
    fetchedAt: Date | null;
    // Freshness signals — used by the docs flow to decide whether the website
    // is current enough to auto-generate a brochure from it, or whether to
    // ask the founder to upload one.
    freshness: 'fresh' | 'stale' | 'unknown';
    lastModified: Date | null;
    copyrightYear: number | null;
    freshnessSignals: string[];
  };
  publicSources: {
    status: 'pending' | 'success' | 'partial' | 'failed' | 'skipped' | 'not_found';
    newsMentions: string[];
    fundingSignals: string[];
    directoryListings: string[];
    fetchedAt: Date | null;
  };
}

export interface IOnboardingCompany extends Document {
  userId: mongoose.Types.ObjectId | null;
  companyName: string;
  websiteUrl: string;
  linkedinUrl: string;
  vertical: OnboardingVertical;
  salesTeamSize: SalesTeamSize;
  phase: OnboardingPhase;
  phaseACompletedAt: Date | null;
  phaseBCompletedAt: Date | null;
  shohiniReviewFlag: boolean;
  research: ICompanyResearch;
  targetProfile: ITargetProfile;
  targetProfileCandidates: ITargetProfile[];
  successMetric: string;
  icpFeedbackNote: string;
  icpFeedbackAt: Date | null;
  messageTemplates: IMessageTemplate[];
  preferredChannels: string[];
  channelStrategy: IChannelStrategy;
  stageThresholds: IStageThresholds;
  /** Set when the founder explicitly saves the channels + stages page. */
  channelsConfiguredAt: Date | null;
  /** Set when the founder hits Next on the messaging page. */
  messagingCompletedAt: Date | null;
  /** Set when the founder lands on the preview page from completed docs. */
  previewSeenAt: Date | null;
  nudgeState: {
    hour24Fired: boolean;
    hour48Fired: boolean;
    hour72Fired: boolean;
    day5Fired: boolean;
    day7AutoApproved: boolean;
    diagnosticResponse: string | null;
    diagnosticResponseAt: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OnboardingCompanySchema = new Schema<IOnboardingCompany>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    companyName: { type: String, required: true },
    websiteUrl: { type: String, default: '' },
    linkedinUrl: { type: String, default: '' },
    vertical: {
      type: String,
      enum: ['manufacturing', 'bfsi', 'hr_recruitment', 'b2b_services', 'b2b_saas', 'edtech_b2c', 'other'],
      required: true,
    },
    salesTeamSize: { type: String, enum: ['2-5', '6-10', '11-15'], required: true },
    phase: {
      type: String,
      enum: ['phase_a', 'bridge', 'phase_b', 'complete'],
      default: 'phase_a',
    },
    phaseACompletedAt: { type: Date, default: null },
    phaseBCompletedAt: { type: Date, default: null },
    shohiniReviewFlag: { type: Boolean, default: false },
    research: {
      linkedin: {
        status: { type: String, enum: ['pending', 'success', 'partial', 'failed', 'skipped', 'not_found'], default: 'pending' },
        about: { type: String, default: '' },
        employeeCount: { type: String, default: '' },
        specialities: [{ type: String }],
        headquarters: { type: String, default: '' },
        recentPosts: [{ type: String }],
        followerCount: { type: Number, default: null },
        fetchedAt: { type: Date, default: null },
      },
      website: {
        status: { type: String, enum: ['pending', 'success', 'partial', 'failed', 'skipped', 'not_found'], default: 'pending' },
        positioning: { type: String, default: '' },
        products: [{ type: String }],
        toneSignals: [{ type: String }],
        competitorSignals: [{ type: String }],
        fetchedAt: { type: Date, default: null },
        freshness: { type: String, enum: ['fresh', 'stale', 'unknown'], default: 'unknown' },
        lastModified: { type: Date, default: null },
        copyrightYear: { type: Number, default: null },
        freshnessSignals: [{ type: String }],
      },
      publicSources: {
        status: { type: String, enum: ['pending', 'success', 'partial', 'failed', 'skipped', 'not_found'], default: 'pending' },
        newsMentions: [{ type: String }],
        fundingSignals: [{ type: String }],
        directoryListings: [{ type: String }],
        fetchedAt: { type: Date, default: null },
      },
    },
    targetProfile: {
      geography: { type: String, default: '' },
      companySize: { type: String, default: '' },
      salesTeamSize: { type: String, default: '' },
      industryFocus: { type: String, default: '' },
      decisionMakers: [{ type: String }],
      painSignals: [{ type: String }],
      locked: { type: Boolean, default: false },
      approvedAt: { type: Date, default: null },
      variantLabel: { type: String, default: '' },
      variantThesis: { type: String, default: '' },
      confidenceNotes: { type: String, default: '' },
      isSelected: { type: Boolean, default: true },
    },
    targetProfileCandidates: [
      {
        geography: { type: String, default: '' },
        companySize: { type: String, default: '' },
        salesTeamSize: { type: String, default: '' },
        industryFocus: { type: String, default: '' },
        decisionMakers: [{ type: String }],
        painSignals: [{ type: String }],
        locked: { type: Boolean, default: false },
        approvedAt: { type: Date, default: null },
        variantLabel: { type: String, default: '' },
        variantThesis: { type: String, default: '' },
        confidenceNotes: { type: String, default: '' },
        isSelected: { type: Boolean, default: false },
      },
    ],
    successMetric: { type: String, default: '' },
    icpFeedbackNote: { type: String, default: '' },
    icpFeedbackAt: { type: Date, default: null },
    messageTemplates: [
      {
        stage: { type: String, enum: ['cold', 'warming', 'hot'], required: true },
        channel: { type: String, enum: ['email', 'linkedin', 'whatsapp'], required: true },
        subject: { type: String, default: '' },
        body: { type: String, default: '' },
        length: { type: String, enum: ['tight', 'balanced', 'detailed'], default: 'balanced' },
        tone: { type: String, enum: ['direct', 'balanced', 'empathetic'], default: 'balanced' },
        formality: { type: String, enum: ['casual', 'professional', 'formal'], default: 'professional' },
        edited: { type: Boolean, default: false },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    preferredChannels: { type: [String], default: [] },
    channelStrategy: {
      cold: { type: [String], default: ['email', 'linkedin'] },
      warming: { type: [String], default: ['email', 'linkedin'] },
      warm: { type: [String], default: ['email', 'whatsapp'] },
      hot: { type: [String], default: ['whatsapp', 'calling'] },
      ready: { type: [String], default: ['calling'] },
    },
    stageThresholds: {
      cold: { type: [Number], default: [0, 35] },
      warming: { type: [Number], default: [36, 50] },
      warm: { type: [Number], default: [51, 75] },
      hot: { type: [Number], default: [76, 90] },
      ready: { type: [Number], default: [91, 100] },
    },
    channelsConfiguredAt: { type: Date, default: null },
    messagingCompletedAt: { type: Date, default: null },
    previewSeenAt: { type: Date, default: null },
    nudgeState: {
      hour24Fired: { type: Boolean, default: false },
      hour48Fired: { type: Boolean, default: false },
      hour72Fired: { type: Boolean, default: false },
      day5Fired: { type: Boolean, default: false },
      day7AutoApproved: { type: Boolean, default: false },
      diagnosticResponse: { type: String, default: null },
      diagnosticResponseAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

OnboardingCompanySchema.index({ userId: 1 });
OnboardingCompanySchema.index({ phase: 1, phaseACompletedAt: 1 });

export const OnboardingCompany = mongoose.model<IOnboardingCompany>(
  'OnboardingCompany',
  OnboardingCompanySchema
);
