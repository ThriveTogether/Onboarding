import mongoose, { Schema, Document } from 'mongoose';

export type OnboardingDocKind =
  | 'nurture_strategy'
  | 'scoring_framework'
  | 'brand_guidelines'
  | 'target_profile'
  | 'knowledge_base';

export type DocReviewStatus = 'draft' | 'generating' | 'ready_for_review' | 'approved' | 'skipped' | 'auto_approved';

export interface IDocVersion {
  version: number;
  content: Record<string, any>;
  rawMarkdown: string;
  critiqueScore: number | null;
  editedByFounder: boolean;
  editDiff: string;
  appliedTo: 'all_leads' | 'new_leads' | 'initial';
  createdAt: Date;
}

export interface IOnboardingDoc extends Document {
  companyId: mongoose.Types.ObjectId;
  kind: OnboardingDocKind;
  title: string;
  status: DocReviewStatus;
  currentVersion: number;
  versions: IDocVersion[];
  content: Record<string, any>;
  rawMarkdown: string;
  approvedAt: Date | null;
  approvedBy: string;
  generationIterations: number;
  generationCostUsd: number;
  createdAt: Date;
  updatedAt: Date;
}

const DocVersionSchema = new Schema<IDocVersion>(
  {
    version: { type: Number, required: true },
    content: { type: Schema.Types.Mixed, default: {} },
    rawMarkdown: { type: String, default: '' },
    critiqueScore: { type: Number, default: null },
    editedByFounder: { type: Boolean, default: false },
    editDiff: { type: String, default: '' },
    appliedTo: { type: String, enum: ['all_leads', 'new_leads', 'initial'], default: 'initial' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const OnboardingDocSchema = new Schema<IOnboardingDoc>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'OnboardingCompany', required: true, index: true },
    kind: {
      type: String,
      enum: ['nurture_strategy', 'scoring_framework', 'brand_guidelines', 'target_profile', 'knowledge_base'],
      required: true,
    },
    title: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'generating', 'ready_for_review', 'approved', 'skipped', 'auto_approved'],
      default: 'draft',
    },
    currentVersion: { type: Number, default: 1 },
    versions: [DocVersionSchema],
    content: { type: Schema.Types.Mixed, default: {} },
    rawMarkdown: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: '' },
    generationIterations: { type: Number, default: 0 },
    generationCostUsd: { type: Number, default: 0 },
  },
  { timestamps: true }
);

OnboardingDocSchema.index({ companyId: 1, kind: 1 }, { unique: true });

export const OnboardingDoc = mongoose.model<IOnboardingDoc>('OnboardingDoc', OnboardingDocSchema);
