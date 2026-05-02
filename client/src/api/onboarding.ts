import axios from 'axios';
import authedApi from './auth';

// Founder onboarding routes are auth-gated; rep routes below use raw axios.
const api = authedApi;

export type OnboardingVertical =
  | 'manufacturing'
  | 'bfsi'
  | 'hr_recruitment'
  | 'b2b_services'
  | 'b2b_saas'
  | 'edtech_b2c'
  | 'other';

export type SalesTeamSize = '2-5' | '6-10' | '11-15';

export type OnboardingDocKind =
  | 'nurture_strategy'
  | 'scoring_framework'
  | 'brand_guidelines'
  | 'target_profile'
  | 'knowledge_base';

export type DocReviewStatus =
  | 'draft'
  | 'generating'
  | 'ready_for_review'
  | 'approved'
  | 'skipped'
  | 'auto_approved';

export interface TargetProfile {
  geography: string;
  companySize: string;
  salesTeamSize: string;
  industryFocus: string;
  decisionMakers: string[];
  painSignals: string[];
  locked: boolean;
  approvedAt: string | null;
  variantLabel?: string;
  variantThesis?: string;
  confidenceNotes?: string;
  isSelected?: boolean;
}

export interface OnboardingCompany {
  _id: string;
  companyName: string;
  websiteUrl: string;
  linkedinUrl: string;
  vertical: OnboardingVertical;
  salesTeamSize: SalesTeamSize;
  phase: 'phase_a' | 'bridge' | 'phase_b' | 'complete';
  phaseACompletedAt: string | null;
  phaseBCompletedAt: string | null;
  shohiniReviewFlag: boolean;
  targetProfile: TargetProfile;
  targetProfileCandidates?: TargetProfile[];
  successMetric: string;
}

export interface OnboardingDoc {
  _id: string;
  companyId: string;
  kind: OnboardingDocKind;
  title: string;
  status: DocReviewStatus;
  content: any;
  rawMarkdown: string;
  currentVersion: number;
  versions: any[];
  approvedAt: string | null;
  generationIterations: number;
}

export interface OnboardingLeadPreview {
  _id: string;
  contactName: string;
  contactTitle: string;
  targetCompany: string;
  city: string;
  industry: string;
  matchPercent: number;
  targetTeamSize: string;
}

export const onboardingAPI = {
  listVerticals: () => api.get('/onboarding/verticals'),
  state: (sessionId?: string) =>
    api.get('/onboarding/state', { params: sessionId ? { session: sessionId } : {} }),
  createCompany: (data: {
    companyName: string;
    websiteUrl?: string;
    linkedinUrl?: string;
    vertical: OnboardingVertical;
    salesTeamSize: SalesTeamSize;
  }) => api.post('/onboarding/company', data),
  predictProfile: (id: string) => api.post(`/onboarding/company/${id}/predict-profile`),
  lockTargetProfile: (id: string, overrides: Partial<TargetProfile>, edited: boolean) =>
    api.put(`/onboarding/company/${id}/target-profile`, { overrides, edited }),
  lockTargetProfiles: (id: string, selectedIndices: number[], overrides?: Array<Partial<TargetProfile>>, edited?: boolean) =>
    api.put(`/onboarding/company/${id}/target-profiles`, { selectedIndices, overrides, edited }),
  editTargetProfileCandidate: (
    id: string,
    index: number,
    updates: Partial<TargetProfile>,
    rescore?: boolean
  ) =>
    api.patch(`/onboarding/company/${id}/target-profile-candidates/${index}`, {
      updates,
      rescore: !!rescore,
    }),
  addCustomICP: (id: string, text: string, replaceIndex?: number) =>
    api.post(`/onboarding/company/${id}/custom-icp`, { text, replaceIndex }),
  generateLeads: (id: string, count?: number) =>
    api.post(`/onboarding/company/${id}/generate-leads`, count ? { count } : {}),
  listLeads: (id: string) => api.get(`/onboarding/company/${id}/leads`),
  listDocs: (id: string) => api.get(`/onboarding/company/${id}/docs`),
  generateAllDocs: (id: string) => api.post(`/onboarding/company/${id}/docs/generate-all`),
  regenerateDoc: (id: string, kind: OnboardingDocKind) =>
    api.post(`/onboarding/company/${id}/docs/${kind}/regenerate`),
  approveDoc: (id: string, kind: OnboardingDocKind, opts?: { edited?: boolean; newContent?: any }) =>
    api.post(`/onboarding/company/${id}/docs/${kind}/approve`, opts || {}),
  skipDoc: (id: string, kind: OnboardingDocKind) =>
    api.post(`/onboarding/company/${id}/docs/${kind}/skip`),
  saveSuccessMetric: (id: string, successMetric: string) =>
    api.post(`/onboarding/company/${id}/success-metric`, { successMetric }),
  launch: (id: string) => api.post(`/onboarding/company/${id}/launch`),
  /**
   * Mints a short-lived JWT for SSO into MerakiPeople admin. Returns
   * { token, redirectUrl, expiresInSeconds } on success or 503 with code
   * 'HANDOFF_DISABLED' if the bridge isn't configured.
   */
  handoffToken: (id: string) =>
    api.post<{ token: string; redirectUrl: string; expiresInSeconds: number }>(
      `/onboarding/company/${id}/handoff-token`,
    ),
  diagnostic: (id: string, response: string) =>
    api.post(`/onboarding/company/${id}/diagnostic`, { response }),
  getLead: (leadId: string) => api.get(`/onboarding/leads/${leadId}`),
  researchLead: (leadId: string) => api.post(`/onboarding/leads/${leadId}/research`),
  leadFeedback: (leadId: string, feedback: 'pursue' | 'existing' | 'skip' | null, note?: string) =>
    api.patch(`/onboarding/leads/${leadId}/feedback`, { feedback, note }),
  saveIcpNote: (id: string, note: string) =>
    api.post(`/onboarding/company/${id}/icp-note`, { note }),
  saveCurrentCustomers: (id: string, customers: string[]) =>
    api.post(`/onboarding/company/${id}/current-customers`, { customers }),
  draftMessage: (
    id: string,
    payload: {
      stage: 'cold' | 'warming' | 'hot';
      channel: 'email' | 'linkedin' | 'whatsapp';
      length: 'tight' | 'balanced' | 'detailed';
      tone: 'direct' | 'balanced' | 'empathetic';
      formality: 'casual' | 'professional' | 'formal';
      exampleLeadId?: string;
    }
  ) => api.post(`/onboarding/company/${id}/draft-message`, payload),
  saveMessageTemplate: (
    id: string,
    template: {
      stage: 'cold' | 'warming' | 'hot';
      channel: 'email' | 'linkedin' | 'whatsapp';
      subject: string;
      body: string;
      length: 'tight' | 'balanced' | 'detailed';
      tone: 'direct' | 'balanced' | 'empathetic';
      formality: 'casual' | 'professional' | 'formal';
      edited: boolean;
    }
  ) => api.put(`/onboarding/company/${id}/message-templates`, template),
  savePreferredChannels: (id: string, channels: string[]) =>
    api.put(`/onboarding/company/${id}/preferred-channels`, { channels }),
  saveChannelStages: (
    id: string,
    payload: {
      channelStrategy: Record<string, string[]>;
      stageThresholds: Record<string, [number, number]>;
    }
  ) => api.put(`/onboarding/company/${id}/channel-stages`, payload),
  markPreviewSeen: (id: string) =>
    api.post(`/onboarding/company/${id}/mark-preview-seen`, {}),
  uploadCatalogue: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/onboarding/company/${id}/product-catalogue`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadNurturePlaybook: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/onboarding/company/${id}/docs/nurture/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  computeImpact: (id: string, kind: OnboardingDocKind, newContent: any) =>
    api.post(`/onboarding/company/${id}/docs/${kind}/impact`, { newContent }),
  applyDocEdit: (id: string, kind: OnboardingDocKind, newContent: any, applyTo: 'all_leads' | 'new_leads') =>
    api.post(`/onboarding/company/${id}/docs/${kind}/apply-edit`, { newContent, applyTo }),
};
