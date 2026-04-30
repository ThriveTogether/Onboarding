import mongoose, { Schema, Document } from 'mongoose';

export type RepInviteStatus = 'pending' | 'accepted' | 'expired';

export interface IRepInvite extends Document {
  companyId: mongoose.Types.ObjectId;
  email: string;
  name: string;
  inviteToken: string;
  status: RepInviteStatus;
  cvUploaded: boolean;
  cvFileName: string;
  firstLoginAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RepInviteSchema = new Schema<IRepInvite>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'OnboardingCompany', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: '' },
    inviteToken: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['pending', 'accepted', 'expired'], default: 'pending' },
    cvUploaded: { type: Boolean, default: false },
    cvFileName: { type: String, default: '' },
    firstLoginAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

RepInviteSchema.index({ companyId: 1, email: 1 }, { unique: true });

export const RepInvite = mongoose.model<IRepInvite>('RepInvite', RepInviteSchema);
