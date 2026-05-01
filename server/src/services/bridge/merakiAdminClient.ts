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
