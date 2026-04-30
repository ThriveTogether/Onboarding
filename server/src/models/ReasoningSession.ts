import mongoose, { Schema, Document } from 'mongoose';

export type StepStatus = 'pending' | 'active' | 'done' | 'skipped' | 'error';

export interface IReasoningStep {
  id: string;
  label: string;
  detail: string;
  evidence: string[];
  status: StepStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  output: string;
  durationMs: number;
}

export interface IReasoningSession extends Document {
  operation: string;
  companyId: mongoose.Types.ObjectId | null;
  leadId: mongoose.Types.ObjectId | null;
  docKind: string;
  status: 'active' | 'done' | 'error';
  steps: IReasoningStep[];
  result: Record<string, any>;
  errorMessage: string;
  startedAt: Date;
  completedAt: Date | null;
}

const StepSchema = new Schema<IReasoningStep>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    detail: { type: String, default: '' },
    evidence: [{ type: String }],
    status: { type: String, enum: ['pending', 'active', 'done', 'skipped', 'error'], default: 'pending' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    output: { type: String, default: '' },
    durationMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const ReasoningSessionSchema = new Schema<IReasoningSession>(
  {
    operation: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'OnboardingCompany', default: null, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'OnboardingLead', default: null },
    docKind: { type: String, default: '' },
    status: { type: String, enum: ['active', 'done', 'error'], default: 'active' },
    steps: [StepSchema],
    result: { type: Schema.Types.Mixed, default: {} },
    errorMessage: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ReasoningSessionSchema.index({ createdAt: -1 });

export const ReasoningSession = mongoose.model<IReasoningSession>('ReasoningSession', ReasoningSessionSchema);
