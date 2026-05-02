import mongoose, { Connection, Schema } from 'mongoose';
import { env } from '../../config/env';

/**
 * Connection + minimal Mongoose models for the MerakiPeople SuperAdmin
 * database (`meraki_admin` by default).
 *
 * Default behaviour (option A): use the SAME cluster as the onboarding app's
 * primary mongoose connection, but switch to a different DB via `useDb`. This
 * is sufficient when you're testing locally on a single mongod, and means we
 * don't open a second connection unless a different cluster is explicitly
 * configured.
 *
 * If `MERAKI_ADMIN_MONGODB_URI` is set, we open a separate `createConnection`
 * to that cluster instead — useful for staging/prod where MerakiPeople lives
 * on a distinct Atlas cluster.
 *
 * Schemas use `strict: false` so we don't fight the canonical MerakiBackend
 * schema for fields we don't care about — we only read/write the fields we
 * know we need.
 */

let conn: Connection | null = null;

export function getMerakiAdminConn(): Connection {
  if (conn) return conn;
  if (env.MERAKI_ADMIN_MONGODB_URI) {
    conn = mongoose.createConnection(env.MERAKI_ADMIN_MONGODB_URI, {
      dbName: env.MERAKI_ADMIN_DB,
    });
  } else {
    // Reuse the primary onboarding connection; just point it at meraki_admin.
    conn = mongoose.connection.useDb(env.MERAKI_ADMIN_DB, { useCache: true });
  }
  return conn;
}

// ---------- Companies ----------
const CompanySchema = new Schema(
  {
    name: { type: String, required: true },
    industry: String,
    size: String,
    description: String,
    logo: String,
    website: String,
    country: String,
    address: String,
    created_by: String,
    intelligence_data: { type: Schema.Types.Mixed, default: {} },
    current_onboarding_step: String,
    merrito_sync: Schema.Types.Mixed,
    // Bridge metadata — links the meraki_admin record back to its source.
    onboarding_company_id: { type: Schema.Types.ObjectId, index: true, sparse: true },
    onboarding_source: { type: String, default: 'meraki_onboarding' },
    graduated_at: Date,
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'companies', strict: false },
);

// ---------- Users ----------
const UserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    password: String,
    name: String,
    role: { type: String, default: 'admin' },
    profile_pic: String,
    phone: String,
    position: String,
    department: String,
    company_id: String,
    company_name: String,
    is_active: { type: Boolean, default: true },
    is_verified: { type: Boolean, default: false },
    is_authenticated_via_sso: { type: Boolean, default: true },
    last_login: Date,
    onboarding_user_id: { type: Schema.Types.ObjectId, index: true, sparse: true },
    onboarding_source: { type: String, default: 'meraki_onboarding' },
    graduated_at: Date,
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'users', strict: false },
);

// ---------- Company Keys (per-company API key configs visible in SuperAdmin) ----------
const CompanyKeySchema = new Schema(
  {
    company_id: { type: String, required: true, index: true },
    api_provider: { type: String, required: true },
    feature: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    api_key: { type: String, required: true },
    seeded_by: { type: String, default: 'meraki_onboarding' },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'company_keys', strict: false },
);
CompanyKeySchema.index({ company_id: 1, api_provider: 1, feature: 1 }, { unique: true });

// ---------- System Prompts ----------
const SystemPromptSchema = new Schema(
  {
    company_id: { type: String, required: true, index: true },
    prompt_type: { type: String, required: true, index: true },
    prompt: { type: String, required: true },
    description: String,
    template_version: String,
    seeded_at: Date,
    seeded_by: { type: String, default: 'meraki_onboarding' },
    is_active: { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'system_prompts', strict: false },
);
SystemPromptSchema.index({ company_id: 1, prompt_type: 1 }, { unique: true });

// ---------- Workflow Stages ----------
// MerakiBackend stores per-company lead pipeline stages (cold/warming/warm/hot/ready)
// in `workflow_stages` keyed by (company_id, type=lead_stages). artifacts.display_data.lead_stage
// holds the ObjectId STRING of one of these stages, so we have to seed them
// before we can bridge any hunted leads with their stage intact.
const WorkflowStageSchema = new Schema(
  {
    company_id: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true }, // 'lead_stages'
    stage_type: { type: String, default: null }, // 'default' | 'closed_won' | 'closed_lost' | null
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    color: { type: String, default: '' },
    score_min: { type: Number, default: 0 },
    score_max: { type: Number, default: 100 },
    seeded_by: { type: String, default: 'meraki_onboarding' },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'workflow_stages', strict: false },
);
WorkflowStageSchema.index({ company_id: 1, type: 1, name: 1 });

// ---------- Artifacts (where MerakiBackend stores leads) ----------
// Lead-shaped artifacts use artifact_type ∈ {lead_hunting, external_lead, uploaded_lead}.
// We bridge OnboardingLead rows in as artifact_type='lead_hunting' since that's the
// closest match to "AI-found accounts the founder reviewed during onboarding".
const ArtifactSchema = new Schema(
  {
    artifact_type: { type: String, required: true, index: true },
    employee_id: { type: String, required: true, index: true },
    company_id: { type: String, required: true, index: true },
    session_id: String,
    data: { type: Schema.Types.Mixed, default: {} },
    display_data: { type: Schema.Types.Mixed, default: {} },
    // Bridge metadata so we can re-run idempotently.
    onboarding_lead_id: { type: Schema.Types.ObjectId, index: true, sparse: true },
    onboarding_source: { type: String, default: 'meraki_onboarding' },
    seeded_by: { type: String, default: 'meraki_onboarding' },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'artifacts', strict: false },
);
// We fan out one lead_hunting artifact per (onboarding lead, employee) so
// per-rep ownership filters work. The unique index keys both.
ArtifactSchema.index(
  { onboarding_lead_id: 1, employee_id: 1 },
  { unique: true, sparse: true },
);

// ---------- Knowledge Base documents ----------
// MerakiBackend's /companies/knowledgeBaseDocs endpoint reads `db.knowledgebase`
// and expects this exact shape (see routes/companies.py get_knowledgebase_docs):
//   {
//     company_id, document_type, is_active, is_deleted,
//     data: { file_name, created_at, status: 'completed', info }
//   }
// Writing different shapes (e.g. flat title/content) makes the doc invisible
// in the UI even though it's in the collection.
const KnowledgeBaseDocSchema = new Schema(
  {
    company_id: { type: String, required: true, index: true },
    document_type: { type: String, index: true },
    data: {
      file_name: { type: String, default: '' },
      created_at: { type: Date, default: () => new Date() },
      status: { type: String, default: 'completed' },
      info: { type: String, default: '' },
      // We keep the full extracted/generated text alongside the listing fields
      // so a future endpoint can render it, but the admin's list view only
      // surfaces the four above.
      content: { type: String, default: '' },
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    is_active: { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },
    // Bridge markers — used for idempotent re-runs.
    source: { type: String, default: 'meraki_onboarding' },
    onboarding_doc_id: { type: Schema.Types.ObjectId, index: true, sparse: true },
    onboarding_kind: String,
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'knowledgebase', strict: false },
);
KnowledgeBaseDocSchema.index(
  { company_id: 1, onboarding_doc_id: 1 },
  { unique: true, sparse: true, partialFilterExpression: { onboarding_doc_id: { $exists: true } } },
);

// ---------- Roles master (read-only catalogue, keyed by field/department) ----------
// roles_master is a single doc per field (e.g. "Marketing", "Sales") with an
// array of roles inside. Each role has KSAB structure, responsibilities, etc.
// Per-company roles live as a flat array on `companies.roles`, NOT in a
// standalone collection — see seedCompanyRoles in graduate.ts.
const RolesMasterSchema = new Schema(
  {
    // Roles_master is keyed dynamically by field name (Marketing, Sales, ...);
    // strict:false lets us read those dynamic keys without declaring them.
  },
  { collection: 'roles_master', strict: false },
);

// ---------- Modules master (read-only source list for available modules) ----------
const ModulesMasterSchema = new Schema(
  {
    name: { type: String, required: true },
    description: String,
  },
  { collection: 'modules_master', strict: false },
);

// ---------- target_profiles collection (canonical TP doc) ----------
// The artifact_type:'target_profile' rows in `artifacts` are view-layer facades.
// The canonical document lives in `target_profiles` and is referenced by the
// artifact's data.profile_document_id. b2b_accounts also link back via
// `target_profile_id`. We seed both.
const TargetProfileDocSchema = new Schema(
  {
    artifact_id: String,
    artifact_type: { type: String, default: 'target_profile' },
    employee_id: { type: String, index: true },
    company_id: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed, default: {} },
    display_data: { type: Schema.Types.Mixed, default: {} },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'target_profiles', strict: false },
);

// ---------- b2b_accounts collection (the actual ACCOUNTS view) ----------
const B2bAccountSchema = new Schema(
  {
    target_profile_id: { type: String, index: true },
    company_id: { type: String, index: true },
    employee_id: { type: String, index: true },
    session_id: String,
    batch_id: String,
    company_name: String,
    website: String,
    website_verified: Boolean,
    industry: String,
    location: String,
    description: String,
    tech_stack: { type: [String], default: [] },
    size_estimate: String,
    status: String,
    account_type: String,
    discovery_date: String,
    research_date: String,
    research_source: String,
    relevance_score: Number,
    score_breakdown: { type: Schema.Types.Mixed, default: {} },
    product_fit_analysis: { type: Schema.Types.Mixed, default: {} },
    target_profile: { type: Schema.Types.Mixed, default: {} },
    recent_activity: { type: Schema.Types.Mixed, default: [] },
    display_data: { type: Schema.Types.Mixed, default: {} },
    agent: String,
    onboarding_lead_account_key: { type: String, index: true, sparse: true },
    onboarding_source: { type: String, default: 'meraki_onboarding' },
    seeded_by: { type: String, default: 'meraki_onboarding' },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'b2b_accounts', strict: false },
);
// We fan out one b2b_accounts row per (account, employee) so per-rep
// ownership filters work — the index keys all three.
B2bAccountSchema.index(
  { company_id: 1, onboarding_lead_account_key: 1, employee_id: 1 },
  { unique: true, sparse: true },
);

// ---------- Employees (read-only — fan out per-employee artifacts) ----------
// MerakiBackend treats "employee" as a `users` doc with role:'user'. The literal
// `employees` collection is legacy/unused. Artifacts filter by employee_id which
// is the user._id from this collection. We use `MerakiUser` (already declared
// above) to read employees — no separate model needed.

// ---------- Channels config (per-company on/off toggles) ----------
const ChannelsConfigSchema = new Schema(
  {
    company_id: { type: String, required: true, unique: true, index: true },
    is_email_active: { type: Boolean, default: false },
    is_whatsapp_active: { type: Boolean, default: false },
    is_linkedIn_Connection_active: { type: Boolean, default: false },
    is_linkedin_dm_active: { type: Boolean, default: false },
    is_instagram_active: { type: Boolean, default: false },
    is_voice_agent_active: { type: Boolean, default: false },
    is_communication_note_active: { type: Boolean, default: false },
    seeded_by: { type: String, default: 'meraki_onboarding' },
    created_at: { type: Date, default: () => new Date() },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'Channels', strict: false }, // NOTE: capital C — matches MerakiBackend
);

// Lazy-resolved models so the connection is only opened when actually used.
export function MerakiCompany() {
  return getMerakiAdminConn().model('MerakiCompany', CompanySchema);
}
export function MerakiUser() {
  return getMerakiAdminConn().model('MerakiUser', UserSchema);
}
export function MerakiSystemPrompt() {
  return getMerakiAdminConn().model('MerakiSystemPrompt', SystemPromptSchema);
}
export function MerakiCompanyKey() {
  return getMerakiAdminConn().model('MerakiCompanyKey', CompanyKeySchema);
}
export function MerakiWorkflowStage() {
  return getMerakiAdminConn().model('MerakiWorkflowStage', WorkflowStageSchema);
}
export function MerakiArtifact() {
  return getMerakiAdminConn().model('MerakiArtifact', ArtifactSchema);
}
export function MerakiKnowledgeBaseDoc() {
  return getMerakiAdminConn().model('MerakiKnowledgeBaseDoc', KnowledgeBaseDocSchema);
}
export function MerakiRolesMaster() {
  return getMerakiAdminConn().model('MerakiRolesMaster', RolesMasterSchema);
}
export function MerakiModulesMaster() {
  return getMerakiAdminConn().model('MerakiModulesMaster', ModulesMasterSchema);
}
export function MerakiChannelsConfig() {
  return getMerakiAdminConn().model('MerakiChannelsConfig', ChannelsConfigSchema);
}
export function MerakiTargetProfileDoc() {
  return getMerakiAdminConn().model('MerakiTargetProfileDoc', TargetProfileDocSchema);
}
export function MerakiB2bAccount() {
  return getMerakiAdminConn().model('MerakiB2bAccount', B2bAccountSchema);
}
