import { Types } from 'mongoose';
import { OnboardingCompany } from '../../models/OnboardingCompany';
import { User as OnboardingUser } from '../../models/User';
import { OnboardingDoc } from '../../models/OnboardingDoc';
import { OnboardingLead } from '../../models/OnboardingLead';
import {
  MerakiCompany,
  MerakiUser,
  MerakiSystemPrompt,
  MerakiCompanyKey,
  MerakiWorkflowStage,
  MerakiArtifact,
  MerakiKnowledgeBaseDoc,
  MerakiRolesMaster,
  MerakiModulesMaster,
  MerakiChannelsConfig,
  MerakiTargetProfileDoc,
  MerakiB2bAccount,
} from './merakiAdminClient';
import { listTemplates, interpolate } from '../promptTemplates/loader';
import { env } from '../../config/env';

/**
 * Bridge: graduate a completed onboarding flow into the MerakiPeople
 * SuperAdmin database.
 *
 * Three concrete writes per founder graduation:
 *   1. `meraki_admin.companies` — Company record (idempotent on
 *      onboarding_company_id)
 *   2. `meraki_admin.users` — Founder as admin user (idempotent on email)
 *   3. `meraki_admin.system_prompts` — One row per prompt_type, customised
 *      with the company's data (idempotent on (company_id, prompt_type))
 *
 * The graduation is idempotent end-to-end. Running it twice for the same
 * onboarding company produces identical results — useful for re-graduating
 * after a fix or when the founder updates their docs.
 */

const VERTICAL_TO_INDUSTRY: Record<string, string> = {
  manufacturing: 'Manufacturing',
  bfsi: 'BFSI',
  hr_recruitment: 'HR & Recruitment',
  b2b_services: 'B2B Services',
  b2b_saas: 'B2B SaaS',
  edtech_b2c: 'EdTech (B2C)',
  other: 'General B2B',
};

// All 16 prompt types Meraki SuperAdmin expects (see admin-app
// SystemSettingPrompts PROMPT_TYPE_DISPLAY).
const ALL_PROMPT_TYPES = [
  'nurture_email',
  'nurture_whatsapp',
  'nurture_linkedin_connection_request',
  'nurture_linkedin_dm',
  'nurture_calling_agent',
  'your_campaign_Wa_template',
  'your_campaign_Wa_template_image_prompt',
  'lead_next_action_planner',
  'lead_call_analysis',
  'lead_call_preparation',
  'target_profile',
  'product_suggestion',
  'account_hunting',
  'company_analysis',
  'lead_deep_research',
  'lead_score',
];

export interface GraduationSummary {
  status: 'success' | 'partial' | 'error';
  meraki_company_id?: string;
  meraki_user_id?: string;
  prompts_seeded: string[];
  prompts_skipped: string[];
  prompts_failed: Array<{ type: string; reason: string }>;
  api_keys_seeded: string[];
  api_keys_skipped: string[];
  workflow_stages: { created: number; existing: number };
  accounts: { bridged: number; updated: number; failed: number };
  leads: { bridged: number; updated: number; failed: number };
  knowledge_base: { bridged: string[]; skipped: string[]; failed: Array<{ kind: string; reason: string }> };
  roles: { created: number; existing: number; selected_fields: string[] };
  modules: { enabled: string[]; enabled_fields: string[]; total_available: number; skipped_existing: boolean };
  channels: { applied: Record<string, boolean>; status: 'applied' | 'skipped_existing' };
  general_settings: { status: 'applied' | 'skipped_existing'; time_zone: string };
  target_profiles: { profiles: number; employees: number; artifacts_written: number };
  created: { company: boolean; user: boolean };
  /**
   * Per-step failures from the bridge orchestrator (steps 6 onwards). Empty
   * on a clean run. Populated when an individual step throws — the
   * orchestrator records it here, falls back to a safe empty result, and
   * keeps going so the rest of the pipeline still runs. `status` becomes
   * 'partial' whenever this array is non-empty.
   */
  bridge_failures: Array<{ step: string; reason: string }>;
  error?: string;
}

/**
 * The platform API keys that get propagated into each graduated company's
 * `company_keys` entries — so the founder sees them in SuperAdmin → API Keys.
 *
 * For now we copy the same shared infra keys into every company. A future
 * iteration could mark these as "platform-managed" vs "company-supplied" so
 * the founder can override with their own.
 */
const PLATFORM_API_KEY_CONFIGS = [
  {
    api_provider: 'anthropic',
    feature: 'ai_generation',
    name: 'Anthropic Claude',
    description: 'Powers strategy doc generation, prompt customisation, and live coaching.',
    env_var: 'ANTHROPIC_API_KEY' as const,
  },
  {
    api_provider: 'serper',
    feature: 'web_research',
    name: 'Serper (Google Search)',
    description: 'Powers lead-hunting and company-research signals.',
    env_var: 'SERPER_API_KEY' as const,
  },
];

export async function graduateToMerakiAdmin(
  onboardingCompanyId: Types.ObjectId | string,
): Promise<GraduationSummary> {
  const company = await OnboardingCompany.findById(onboardingCompanyId);
  if (!company) {
    return {
      status: 'error',
      error: 'Onboarding company not found',
      prompts_seeded: [],
      prompts_skipped: [],
      prompts_failed: [],
      api_keys_seeded: [],
      api_keys_skipped: [],
      workflow_stages: { created: 0, existing: 0 },
      accounts: { bridged: 0, updated: 0, failed: 0 },
      leads: { bridged: 0, updated: 0, failed: 0 },
      knowledge_base: { bridged: [], skipped: [], failed: [] },
      roles: { created: 0, existing: 0, selected_fields: [] },
      modules: { enabled: [], enabled_fields: [], total_available: 0, skipped_existing: false },
      channels: { applied: {}, status: 'skipped_existing' },
      general_settings: { status: 'skipped_existing', time_zone: 'Asia/Kolkata' },
      target_profiles: { profiles: 0, employees: 0, artifacts_written: 0 },
      created: { company: false, user: false },
      bridge_failures: [],
    };
  }

  const founder = company.userId ? await OnboardingUser.findById(company.userId) : null;
  if (!founder) {
    return {
      status: 'error',
      error: 'Founder user not found for this onboarding company',
      prompts_seeded: [],
      prompts_skipped: [],
      prompts_failed: [],
      api_keys_seeded: [],
      api_keys_skipped: [],
      workflow_stages: { created: 0, existing: 0 },
      accounts: { bridged: 0, updated: 0, failed: 0 },
      leads: { bridged: 0, updated: 0, failed: 0 },
      knowledge_base: { bridged: [], skipped: [], failed: [] },
      roles: { created: 0, existing: 0, selected_fields: [] },
      modules: { enabled: [], enabled_fields: [], total_available: 0, skipped_existing: false },
      channels: { applied: {}, status: 'skipped_existing' },
      general_settings: { status: 'skipped_existing', time_zone: 'Asia/Kolkata' },
      target_profiles: { profiles: 0, employees: 0, artifacts_written: 0 },
      created: { company: false, user: false },
      bridge_failures: [],
    };
  }

  // Load all generated docs up-front. Both companyDescription and
  // buildIntelligenceData need the rich Knowledge Base + Brand content —
  // without this, the admin Company Overview page renders the thin website
  // signals (3 page titles + 1-line meta description) instead of the
  // AI-written descriptions the founder approved during onboarding.
  const docs = await OnboardingDoc.find({ companyId: company._id });

  // 1. Company — find-or-create on onboarding_company_id
  const Company = MerakiCompany();
  const companyDoc = await Company.findOneAndUpdate(
    { onboarding_company_id: company._id },
    {
      $setOnInsert: {
        onboarding_company_id: company._id,
        onboarding_source: 'meraki_onboarding',
        created_at: new Date(),
        graduated_at: new Date(),
      },
      $set: {
        name: company.companyName,
        industry: VERTICAL_TO_INDUSTRY[company.vertical] || 'Other',
        website: company.websiteUrl || '',
        description: companyDescription(company, docs),
        intelligence_data: buildIntelligenceData(company, docs),
        // Both signals tell the admin app's RootRedirect + SignIn redirect
        // logic that this company is fully set up and should land on the
        // main dashboard, NOT the in-admin /company-setup wizard. Without
        // these, graduated founders get bounced into the (now-redundant)
        // 4-step setup wizard inside admin even though we already did
        // everything that wizard would do.
        current_onboarding_step: 'completed',
        quick_setup_complete: true,
        created_by: founder._id.toString(),
        updated_at: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const merakiCompanyId = (companyDoc as any)._id.toString();
  const createdCompany = (companyDoc as any).graduated_at?.getTime?.() === (companyDoc as any).updated_at?.getTime?.();

  // 2. User — find-or-create on email
  const User = MerakiUser();
  const userDoc = await User.findOneAndUpdate(
    { email: founder.email.toLowerCase().trim() },
    {
      $setOnInsert: {
        email: founder.email.toLowerCase().trim(),
        onboarding_user_id: founder._id,
        onboarding_source: 'meraki_onboarding',
        // Same bcrypt hash from the onboarding signup → founder logs in to
        // MerakiPeople admin with the same email/password they used on
        // tie-onboarding.t2ai.live, no separate registration needed.
        // Only set on insert; if the founder later changes their password
        // via the admin app's reset flow, re-graduation won't clobber it.
        password: founder.passwordHash,
        // Kept true so the (still-installed) /api/auth/sso/onboarding-handoff
        // route remains usable as a future option, but everyday login uses
        // password against the bcrypt hash above.
        is_authenticated_via_sso: true,
        created_at: new Date(),
        graduated_at: new Date(),
      },
      $set: {
        name: founder.name || '',
        role: 'admin',
        // MerakiPeople's per-employee dashboard endpoint
        // (/api/dashboard/employee/:id) only fans out to all company
        // employees when the requesting user has position='Marketing Manager';
        // any other position scopes the query to that user's own
        // employee_id. The founder is the only admin AND we want them to
        // see every employee's data, so flag them as Marketing Manager.
        // Department='Marketing' keeps it consistent.
        position: 'Marketing Manager',
        department: 'Marketing',
        company_id: merakiCompanyId,
        company_name: company.companyName,
        is_active: true,
        is_verified: true,
        updated_at: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const merakiAdminUserId = (userDoc as any)._id.toString();
  const createdUser = (userDoc as any).graduated_at?.getTime?.() === (userDoc as any).updated_at?.getTime?.();

  // 2b. Companion "rep" user with role=user — required by MerakiPeople's
  //     dashboard, which builds employee_ids from
  //       users.find({company_id, role: 'user'})
  //     then filters every artifact / b2b_account / target_profile by
  //       employee_id $in employee_ids
  //
  //     The admin user (role=admin) created in step 2 powers login + admin UI,
  //     but is invisible to dashboard counts. Without a paired role=user
  //     record, the founder sees 0 leads / 0 employees on /dashboard even
  //     though the data is present.
  //
  //     Email convention: founder@example.com → founder+rep@example.com.
  //     RFC 5233 sub-addressing: most email providers route the +rep variant
  //     to the same inbox, so password reset still reaches the founder.
  //     The rep shares the founder's password hash so a single login works.
  const repEmail = founder.email.toLowerCase().trim().replace('@', '+rep@');
  const repDoc = await User.findOneAndUpdate(
    { email: repEmail },
    {
      $setOnInsert: {
        email: repEmail,
        onboarding_user_id: founder._id,
        onboarding_source: 'meraki_onboarding',
        password: founder.passwordHash,
        is_authenticated_via_sso: true,
        created_at: new Date(),
        graduated_at: new Date(),
      },
      $set: {
        // Bare name (no "(Rep)" suffix) — the +rep@ user is hidden from the
        // admin Employee Management UI by a server-side filter, so the only
        // surfaces that ever show this name are internal (e.g., audit
        // queries). Founder feedback: "(Rep)" was confusing in the few
        // places it leaked to the UI before the filter landed.
        name: founder.name || '',
        role: 'user', // <-- the key bit; counts as an employee on dashboard
        company_id: merakiCompanyId,
        company_name: company.companyName,
        is_active: true,
        is_verified: true,
        updated_at: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  // Downstream steps (b2b_accounts, leads, target_profiles, artifacts) all
  // use this id as employee_id so every record passes the dashboard filter.
  const merakiUserId = (repDoc as any)._id.toString();

  // 3. Build prompt context — used to interpolate every per-company prompt.
  // (`docs` was loaded above so the Company doc could pick up rich KB
  // content for description + intelligence_data.)
  const context = await buildPromptContext(company, docs);

  // 4. Seed system_prompts. For each of the 16 prompt types we either:
  //    - use the matching template from prompt_templates/base/ if present, OR
  //    - fall back to a minimal scaffolded prompt the founder can refine later.
  const SystemPrompt = MerakiSystemPrompt();
  const templates = listTemplates();
  const templatesByType = new Map(templates.map((t) => [t.prompt_type, t]));

  const promptsSeeded: string[] = [];
  const promptsSkipped: string[] = [];
  const promptsFailed: Array<{ type: string; reason: string }> = [];

  for (const promptType of ALL_PROMPT_TYPES) {
    try {
      const template = templatesByType.get(promptType);
      let renderedPrompt: string;
      let templateVersion = 'scaffolded-1.0';

      if (template) {
        renderedPrompt = interpolate(template, context);
        templateVersion = template.template_version;
      } else {
        renderedPrompt = scaffoldPrompt(promptType, context);
      }

      // Skip if already exists (idempotent — don't overwrite founder edits).
      const existing = await SystemPrompt.findOne({
        company_id: merakiCompanyId,
        prompt_type: promptType,
      });
      if (existing) {
        promptsSkipped.push(promptType);
        continue;
      }

      await SystemPrompt.create({
        company_id: merakiCompanyId,
        prompt_type: promptType,
        prompt: renderedPrompt,
        description: template?.description || `${promptType} (auto-seeded scaffold)`,
        template_version: templateVersion,
        seeded_at: new Date(),
        seeded_by: 'meraki_onboarding',
        is_active: true,
        is_deleted: false,
      });
      promptsSeeded.push(promptType);
    } catch (err: any) {
      promptsFailed.push({ type: promptType, reason: err.message || 'unknown' });
    }
  }

  // 5. API key configs — propagate the platform infra keys into the company's
  //    `company_keys` entries so they show up in SuperAdmin → API Keys.
  //    Idempotent on (company_id, api_provider, feature). If the key value
  //    already matches, it's a no-op; if it changed (rotated), it's updated.
  const CompanyKey = MerakiCompanyKey();
  const apiKeysSeeded: string[] = [];
  const apiKeysSkipped: string[] = [];
  for (const cfg of PLATFORM_API_KEY_CONFIGS) {
    const value = (env as any)[cfg.env_var] as string;
    if (!value) {
      apiKeysSkipped.push(`${cfg.api_provider} (env var ${cfg.env_var} not set)`);
      continue;
    }
    try {
      // findOneAndUpdate with upsert — matches on (company, provider, feature).
      const existing = await CompanyKey.findOne({
        company_id: merakiCompanyId,
        api_provider: cfg.api_provider,
        feature: cfg.feature,
      });
      if (existing && existing.seeded_by !== 'meraki_onboarding') {
        // Founder/admin manually configured this key — don't overwrite.
        apiKeysSkipped.push(`${cfg.api_provider} (manually configured, untouched)`);
        continue;
      }
      await CompanyKey.findOneAndUpdate(
        { company_id: merakiCompanyId, api_provider: cfg.api_provider, feature: cfg.feature },
        {
          $set: {
            company_id: merakiCompanyId,
            api_provider: cfg.api_provider,
            feature: cfg.feature,
            name: cfg.name,
            description: cfg.description,
            api_key: value,
            seeded_by: 'meraki_onboarding',
            updated_at: new Date(),
          },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true },
      );
      apiKeysSeeded.push(cfg.api_provider);
    } catch (err: any) {
      apiKeysSkipped.push(`${cfg.api_provider} (error: ${err.message})`);
    }
  }

  // -- Steps 6 onwards: each step is wrapped so a single failure can't take
  //    out the rest of the bridge. If a step throws, we log it, push a
  //    failure record, and continue with a safe fallback so downstream steps
  //    that depend on this one still get to run (with reduced/empty input).
  //    Steps 1-5 already use their own per-item try/catch internally.
  const bridgeFailures: Array<{ step: string; reason: string }> = [];
  const safeStep = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err: any) {
      const reason = err?.message || String(err);
      console.error(`[bridge] step '${name}' failed:`, reason);
      if (err?.stack) console.error(err.stack);
      bridgeFailures.push({ step: name, reason });
      return fallback;
    }
  };

  // 6. Workflow stages — seed the 5-stage funnel (cold → ready) the founder
  //    confirmed during onboarding, BEFORE bridging leads (so each lead can
  //    point to the right stage_id).
  const workflowResult = await safeStep(
    'workflow_stages',
    () => seedWorkflowStages(merakiCompanyId, company),
    { summary: { created: 0, existing: 0 }, stageIdsByName: {} as Record<string, string> },
  );

  // 6b. Target profiles canonical docs — written FIRST because b2b_accounts
  //     and lead artifacts both link back to them via target_profile_id.
  //     Returns a map (variantIndex → target_profiles._id) used downstream.
  const tpDocResult = await safeStep(
    'target_profile_docs',
    () => bridgeTargetProfileDocs(company, merakiCompanyId, merakiUserId),
    { firstTargetProfileId: null as any, docIdsByVariant: {} as Record<number, string>, summary: { written: 0 } } as any,
  );

  // 6c. Accounts — group OnboardingLeads by targetCompany, write one
  //     b2b_accounts doc per unique account with target_profile_id set.
  //     Returns a map (targetCompany → b2b_accounts._id) for the lead step.
  const accountsResult = await safeStep(
    'accounts',
    () => bridgeAccounts(
      company._id,
      merakiCompanyId,
      merakiUserId,
      tpDocResult.firstTargetProfileId,
    ),
    { summary: { bridged: 0, updated: 0, failed: 0 }, accountIdByCompanyKey: {} as Record<string, string> },
  );

  // 7. Leads — bridge every OnboardingLead into meraki_admin.artifacts with
  //    the right account_id and lead_stage. Now that accounts exist, leads
  //    chain back: target_profile → b2b_account → lead_hunting artifact.
  const leadsResult = await safeStep(
    'leads',
    () => bridgeLeads(
      company._id,
      merakiCompanyId,
      merakiUserId,
      workflowResult.stageIdsByName,
      accountsResult.accountIdByCompanyKey,
    ),
    { bridged: 0, updated: 0, failed: 0 },
  );

  // 8. Knowledge base — write the 4 reviewable docs + uploaded brochure into
  //    meraki_admin.knowledgebase as metadata rows. The platform vectorises
  //    on first AI use (vector embedding is a separate microservice).
  const knowledgeBaseResult = await safeStep(
    'knowledge_base',
    () => bridgeKnowledgeBaseDocs(company, docs, merakiCompanyId),
    { bridged: [] as string[], skipped: [] as string[], failed: [] as Array<{ kind: string; reason: string }> },
  );

  // 9. Default modules — copy modules_master into companies.modules and flip
  //    "Lead Generation" + "Call Compass" to is_selected:true. Runs BEFORE
  //    the roles step so we know which fields are enabled.
  const modulesResult = await safeStep(
    'modules',
    () => seedDefaultModules(merakiCompanyId),
    { enabled: [] as string[], enabled_fields: [] as string[], total_available: 0, skipped_existing: false },
  );

  // 10. Roles & responsibilities — flatten roles_master into companies.roles
  //     and mark is_selected on roles whose field matches an enabled module.
  const rolesResult = await safeStep(
    'roles',
    () => seedCompanyRoles(merakiCompanyId, modulesResult.enabled_fields),
    { created: 0, existing: 0, selected_fields: [] as string[] },
  );

  // 11. Channels config — translate the founder's preferredChannels into the
  //     admin's Channels collection booleans.
  const channelsResult = await safeStep(
    'channels',
    () => seedChannelsConfig(merakiCompanyId, company),
    { applied: {} as Record<string, boolean>, status: 'skipped_existing' as 'applied' | 'skipped_existing' },
  );

  // 12. General settings — auto next action ON, lead research ON, time zone IST.
  const settingsResult = await safeStep(
    'general_settings',
    () => seedGeneralSettings(merakiCompanyId),
    { status: 'skipped_existing' as 'applied' | 'skipped_existing', time_zone: 'Asia/Kolkata' },
  );

  // 13. Target profile artifacts — fan out one per (employee, profile) so
  //     each rep sees the founder's ICP in their History/Artifact view.
  //     Uses the canonical docs created in step 6b.
  const targetProfilesResult = await safeStep(
    'target_profile_artifacts',
    () => bridgeTargetProfileArtifacts(
      company,
      merakiCompanyId,
      tpDocResult.docIdsByVariant,
    ),
    { profiles: 0, employees: 0, artifacts_written: 0 },
  );

  return {
    status: bridgeFailures.length === 0 ? 'success' : 'partial',
    meraki_company_id: merakiCompanyId,
    // Return the admin id (login identity), not the companion rep id —
    // callers like /handoff-token treat meraki_user_id as the founder's
    // primary user record.
    meraki_user_id: merakiAdminUserId,
    prompts_seeded: promptsSeeded,
    prompts_skipped: promptsSkipped,
    prompts_failed: promptsFailed,
    api_keys_seeded: apiKeysSeeded,
    api_keys_skipped: apiKeysSkipped,
    workflow_stages: workflowResult.summary,
    accounts: accountsResult.summary,
    leads: leadsResult,
    knowledge_base: knowledgeBaseResult,
    roles: rolesResult,
    modules: modulesResult,
    channels: channelsResult,
    general_settings: settingsResult,
    target_profiles: targetProfilesResult,
    created: { company: createdCompany, user: createdUser },
    bridge_failures: bridgeFailures,
  };
}

// -------- Workflow stages --------

const STAGE_DEFAULTS: Array<{
  name: string;
  stage_type: string | null;
  order: number;
  color: string;
  fallback_score_min: number;
  fallback_score_max: number;
}> = [
  { name: 'Cold', stage_type: 'default', order: 1, color: '#6B7280', fallback_score_min: 0, fallback_score_max: 35 },
  { name: 'Warming', stage_type: null, order: 2, color: '#F59E0B', fallback_score_min: 36, fallback_score_max: 50 },
  { name: 'Warm', stage_type: null, order: 3, color: '#F97316', fallback_score_min: 51, fallback_score_max: 75 },
  { name: 'Hot', stage_type: null, order: 4, color: '#EF4444', fallback_score_min: 76, fallback_score_max: 90 },
  { name: 'Ready', stage_type: 'closed_won', order: 5, color: '#10B981', fallback_score_min: 91, fallback_score_max: 100 },
];

const STAGE_NAME_BY_KEY: Record<string, string> = {
  cold: 'Cold',
  warming: 'Warming',
  warm: 'Warm',
  hot: 'Hot',
  ready: 'Ready',
};

async function seedWorkflowStages(
  merakiCompanyId: string,
  company: any,
): Promise<{ summary: { created: number; existing: number }; stageIdsByName: Record<string, string> }> {
  const Stage = MerakiWorkflowStage();
  const summary = { created: 0, existing: 0 };
  const stageIdsByName: Record<string, string> = {};
  const thresholds = company.stageThresholds || {};

  for (const def of STAGE_DEFAULTS) {
    const key = def.name.toLowerCase();
    const range = thresholds[key];
    const score_min = Array.isArray(range) ? Number(range[0] ?? def.fallback_score_min) : def.fallback_score_min;
    const score_max = Array.isArray(range) ? Number(range[1] ?? def.fallback_score_max) : def.fallback_score_max;

    const existing = await Stage.findOne({
      company_id: merakiCompanyId,
      type: 'lead_stages',
      name: def.name,
    });
    if (existing) {
      summary.existing += 1;
      stageIdsByName[def.name] = String((existing as any)._id);
      continue;
    }
    const created = await Stage.create({
      company_id: merakiCompanyId,
      type: 'lead_stages',
      stage_type: def.stage_type,
      name: def.name,
      order: def.order,
      color: def.color,
      score_min,
      score_max,
      seeded_by: 'meraki_onboarding',
    });
    summary.created += 1;
    stageIdsByName[def.name] = String((created as any)._id);
  }
  return { summary, stageIdsByName };
}

// -------- Leads --------

async function bridgeLeads(
  onboardingCompanyId: Types.ObjectId,
  merakiCompanyId: string,
  merakiUserId: string,
  stageIdsByName: Record<string, string>,
  accountIdByCompanyKey: Record<string, string>,
): Promise<{ bridged: number; updated: number; failed: number }> {
  const result = { bridged: 0, updated: 0, failed: 0 };
  const leads = await OnboardingLead.find({ companyId: onboardingCompanyId }).lean();
  if (leads.length === 0) return result;

  const Artifact = MerakiArtifact();

  // Fan out per (lead, employee) — same reason as bridgeAccounts: ownership
  // filters require employee_id to match the requester. Founder is included
  // first so the canonical artifact (if anyone asks) is hers.
  const User = MerakiUser();
  const employeeUsers = await User.find({
    company_id: merakiCompanyId,
    role: { $in: ['user', 'admin'] },
  }).lean();
  const employeeIds: string[] = [merakiUserId];
  for (const e of employeeUsers) {
    const id = String((e as any)._id);
    if (!employeeIds.includes(id)) employeeIds.push(id);
  }

  for (const lead of leads) {
    try {
      const stageName = STAGE_NAME_BY_KEY[lead.stage] || 'Cold';
      const stageId = stageIdsByName[stageName] || stageIdsByName.Cold || null;
      const accountKey = accountKeyForLead(lead);
      const accountId = accountIdByCompanyKey[accountKey] || null;

      // The data shape mirrors what MerakiBackend's lead-display code expects.
      // Display_data carries the human-readable card; data carries the searchable
      // fields. We keep field names admin-app-friendly (snake_case where possible).
      const data: Record<string, any> = {
        contact_name: lead.contactName,
        contact_title: lead.contactTitle,
        contact_email: lead.contactEmail,
        contact_email_verified: lead.contactEmailVerified,
        target_company: lead.targetCompany,
        target_company_website: lead.targetCompanyWebsite,
        city: lead.city,
        industry: lead.industry,
        sub_industry: lead.subIndustry,
        target_team_size: lead.targetTeamSize,
        match_percent: lead.matchPercent,
        score: lead.score,
        score_breakdown: lead.scoreBreakdown,
        founder_feedback: lead.founderFeedback,
        founder_feedback_note: lead.founderFeedbackNote,
        linkedin_url: lead.linkedinUrl,
        relevance_reason: lead.intel?.relevanceReason || '',
        match_rationale: lead.intel?.matchRationale || '',
        recommended_approach: lead.intel?.recommendedApproach || '',
        company_description: lead.intel?.companyDescription || '',
        department: lead.intel?.department || '',
        seniority: lead.intel?.seniority || '',
        lead_stage: stageId,
      };

      const display_data: Record<string, any> = {
        title: lead.contactName || lead.targetCompany || 'Untitled lead',
        description: [lead.contactTitle, lead.targetCompany, lead.city].filter(Boolean).join(' · '),
        feature: 'OnboardingLeadHunting',
        created_timestamp: new Date(lead.createdAt).toISOString(),
        updated_timestamp: new Date(lead.updatedAt).toISOString(),
        process_duration: 'Onboarding (AI-hunted)',
        process_duration_raw: null,
        employee_context: `Hunted during onboarding for company ${merakiCompanyId}`,
        download_count: 0,
        highlighted: lead.founderFeedback === 'pursue',
        lead_stage: stageId,
        match_percent: lead.matchPercent,
        score: lead.score,
      };

      // Mirror BKC's lead_hunting shape: top-level account_id + company_name,
      // richer data with contacts/seniority/relevance_reason, agent metadata.
      const richData: Record<string, any> = {
        ...data,
        account_id: accountId,
        company_name: lead.targetCompany,
        name: lead.contactName,
        role: lead.contactTitle,
        email: lead.contactEmail,
        linkedin_url: lead.linkedinUrl,
        department: lead.intel?.department || '',
        seniority: lead.intel?.seniority || '',
        priority: lead.founderFeedback === 'pursue' ? 'high' : 'medium',
        relevance_reason: lead.intel?.relevanceReason || '',
        source: 'meraki_onboarding',
        type: 'lead',
        agent: 'Onboarding Lead Hunter',
        data_confidence: lead.contactEmailVerified ? 'high' : 'medium',
        discovery_date: new Date(lead.createdAt).toISOString(),
        contacts: lead.contactName
          ? [{ name: lead.contactName, role: lead.contactTitle, email: lead.contactEmail, linkedin_url: lead.linkedinUrl }]
          : [],
      };
      const richDisplay: Record<string, any> = {
        ...display_data,
        title: lead.contactName || lead.targetCompany || 'Untitled lead',
        description: `${lead.contactName || ''} | Associated with ${lead.targetCompany} | ${lead.intel?.seniority || ''} | at ${lead.targetCompany}`.replace(/\s+\|\s+\|/g, ' |'),
        feature: 'Lead',
      };

      // Fan out: one lead_hunting artifact per (onboarding lead, employee).
      // Idempotent on (onboarding_lead_id, employee_id).
      for (const employeeId of employeeIds) {
        const existing = await Artifact.findOne({
          onboarding_lead_id: lead._id,
          employee_id: employeeId,
        });
        if (existing) {
          await Artifact.updateOne(
            { _id: (existing as any)._id },
            {
              $set: {
                data: richData,
                display_data: richDisplay,
                account_id: accountId,
                company_name: lead.targetCompany,
                employee_id: employeeId,
                company_id: merakiCompanyId,
                agent_name: 'lead_hunting',
                intent: 'hunt_leads',
                updated_at: new Date(),
              },
            },
          );
          result.updated += 1;
        } else {
          await Artifact.create({
            artifact_type: 'lead_hunting',
            artifact_id: `lead_${accountId || 'noaccount'}_${String(lead._id)}_${employeeId}`,
            account_id: accountId,
            company_name: lead.targetCompany,
            employee_id: employeeId,
            company_id: merakiCompanyId,
            session_id: `onboarding-${onboardingCompanyId.toString()}`,
            agent_name: 'lead_hunting',
            intent: 'hunt_leads',
            data: richData,
            display_data: richDisplay,
            onboarding_lead_id: lead._id,
            onboarding_source: 'meraki_onboarding',
            seeded_by: 'meraki_onboarding',
          });
          result.bridged += 1;
        }
      }
    } catch (err: any) {
      console.error('[bridge] lead bridge failed', lead._id, err?.message);
      result.failed += 1;
    }
  }
  return result;
}

// -------- Knowledge base (the 4 reviewable docs + uploaded brochure) --------

const KB_TITLES: Record<string, string> = {
  brand_guidelines: 'Brand Guidelines',
  nurture_strategy: 'Marketing & Nurture Strategy',
  scoring_framework: 'Lead Score Framework',
  knowledge_base: 'Product Knowledge Base',
  target_profile: 'Target Profile / ICP',
};

/** Flatten an OnboardingDoc.content blob into searchable plain text. The
 *  admin app's vectoriser will re-tokenise this; we just need a sensible
 *  string the founder can read in the KB list view today. */
function flattenContentToText(content: Record<string, any>, rawMarkdown?: string): string {
  if (rawMarkdown && rawMarkdown.trim().length > 0) return rawMarkdown;
  const parts: string[] = [];
  const walk = (v: any, key?: string): void => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') {
      parts.push(key ? `${key}: ${v}` : v);
    } else if (Array.isArray(v)) {
      v.forEach((item) => walk(item, key));
    } else if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) walk(val, k);
    } else {
      parts.push(String(v));
    }
  };
  walk(content);
  return parts.join('\n').slice(0, 50000);
}

async function bridgeKnowledgeBaseDocs(
  company: any,
  docs: any[],
  merakiCompanyId: string,
): Promise<{ bridged: string[]; skipped: string[]; failed: Array<{ kind: string; reason: string }> }> {
  const result = { bridged: [] as string[], skipped: [] as string[], failed: [] as Array<{ kind: string; reason: string }> };
  const Doc = MerakiKnowledgeBaseDoc();

  // (a) Each OnboardingDoc kind → a knowledgebase row in the EXACT shape
  //     /companies/knowledgeBaseDocs renders ({data:{file_name,created_at,
  //     status,info}, document_type, is_active, is_deleted}).
  for (const doc of docs) {
    try {
      const kind = doc.kind as string;
      const text = flattenContentToText(doc.content || {}, doc.rawMarkdown);
      const fileName = `${KB_TITLES[kind] || kind}.md`;
      const info = (text || '').slice(0, 240).replace(/\s+/g, ' ').trim();

      await Doc.findOneAndUpdate(
        { company_id: merakiCompanyId, onboarding_doc_id: doc._id },
        {
          $set: {
            company_id: merakiCompanyId,
            document_type: kind,
            data: {
              file_name: fileName,
              created_at: doc.approvedAt || doc.createdAt || new Date(),
              status: 'completed',
              info,
              content: text,
            },
            metadata: {
              author: 'Meraki Onboarding',
              source: 'meraki_onboarding',
              onboarding_kind: kind,
            },
            is_active: true,
            is_deleted: false,
            source: 'meraki_onboarding',
            onboarding_doc_id: doc._id,
            onboarding_kind: kind,
            updated_at: new Date(),
          },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true },
      );
      result.bridged.push(kind);
    } catch (err: any) {
      result.failed.push({ kind: doc.kind, reason: err?.message || 'unknown' });
    }
  }

  // (b) Uploaded product brochure — same collection, document_type:'product_brochure'.
  const kbDoc = docs.find((d: any) => d.kind === 'knowledge_base');
  const upload = kbDoc?.content?.uploadedCatalogue;
  if (upload && (upload.text || upload.filename)) {
    try {
      const text = upload.text || '';
      const info = text.slice(0, 240).replace(/\s+/g, ' ').trim();
      await Doc.findOneAndUpdate(
        { company_id: merakiCompanyId, onboarding_kind: 'product_brochure' },
        {
          $set: {
            company_id: merakiCompanyId,
            document_type: 'product_brochure',
            data: {
              file_name: upload.filename || 'Product Brochure',
              created_at: upload.uploadedAt || new Date(),
              status: 'completed',
              info,
              content: text,
            },
            metadata: {
              author: 'Founder upload',
              source: 'meraki_onboarding',
              onboarding_kind: 'product_brochure',
              filename: upload.filename || '',
              size_bytes: upload.sizeBytes || 0,
              format: upload.format || '',
              page_count: upload.pageCount || 0,
              truncated: !!upload.truncated,
            },
            is_active: true,
            is_deleted: false,
            source: 'meraki_onboarding',
            onboarding_kind: 'product_brochure',
            updated_at: new Date(),
          },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true },
      );
      result.bridged.push('product_brochure');
    } catch (err: any) {
      result.failed.push({ kind: 'product_brochure', reason: err?.message || 'unknown' });
    }
  }
  return result;
}

// -------- Roles & responsibilities --------
//
// MerakiBackend stores roles as a flat array on `companies.roles`, NOT a
// standalone collection. Each role object has the full KSAB-shaped detail
// (focus, definition, responsibilities[] with tasks). The catalogue lives in
// `roles_master` keyed by `field` (Marketing, Sales, …). On graduation:
//
//   1. Read every role doc from roles_master
//   2. Flatten into a single array of role objects
//   3. Mark `is_selected: true` for roles whose `field` matches an enabled
//      module's `field`. (Lead Generation lives under "Marketing" so the
//      Marketing roles light up; Call Compass lives under "Sales".)
//   4. Persist to companies.roles
//
// Idempotent: if companies.roles already has entries (admin/founder edited
// them post-graduation), we don't clobber.

async function seedCompanyRoles(
  merakiCompanyId: string,
  enabledModuleFields: string[],
): Promise<{ created: number; existing: number; selected_fields: string[] }> {
  const Company = MerakiCompany();
  const RolesMaster = MerakiRolesMaster();

  const existingCompany = await Company.findById(merakiCompanyId).lean();
  const existingRoles = (existingCompany as any)?.roles;
  if (Array.isArray(existingRoles) && existingRoles.length > 0) {
    return {
      created: 0,
      existing: existingRoles.length,
      selected_fields: enabledModuleFields,
    };
  }

  const rolesMasterDocs = await RolesMaster.find().lean();
  const enabledFieldSet = new Set(enabledModuleFields.map((f) => f.toLowerCase()));
  const flat: any[] = [];

  for (const doc of rolesMasterDocs) {
    // roles_master is one doc per field; the field NAME is a top-level key
    // whose value is the array of roles. We have to walk every key that
    // isn't _id and treat its value as the roles array if it's an array.
    for (const [fieldName, value] of Object.entries(doc as any)) {
      if (fieldName === '_id') continue;
      if (!Array.isArray(value)) continue;
      const isSelected = enabledFieldSet.has(fieldName.toLowerCase());
      for (const role of value) {
        if (!role || typeof role !== 'object') continue;
        flat.push({
          ...role,
          title: role.title || role.role || '',
          field: fieldName,
          is_selected: isSelected,
        });
      }
    }
  }

  if (flat.length === 0) {
    return { created: 0, existing: 0, selected_fields: enabledModuleFields };
  }

  await Company.updateOne(
    { _id: merakiCompanyId },
    { $set: { roles: flat, updated_at: new Date() } },
  );

  return {
    created: flat.length,
    existing: 0,
    selected_fields: enabledModuleFields,
  };
}

// -------- Default modules (Lead Generation + Call Compass enabled) --------

const DEFAULT_ENABLED_MODULES = ['Lead Generation', 'Call Compass'];

async function seedDefaultModules(
  merakiCompanyId: string,
): Promise<{ enabled: string[]; enabled_fields: string[]; total_available: number; skipped_existing: boolean }> {
  // If the company already has a modules array, don't clobber it — the founder
  // (or an admin) may have toggled things in SuperAdmin. Re-graduation is a
  // refresh, not a reset.
  const Company = MerakiCompany();
  const existing = await Company.findById(merakiCompanyId).lean();
  if (existing && Array.isArray((existing as any).modules) && (existing as any).modules.length > 0) {
    const selected = (existing as any).modules.filter((m: any) => m?.is_selected);
    return {
      enabled: selected.map((m: any) => m?.name).filter(Boolean),
      enabled_fields: Array.from(new Set(selected.map((m: any) => m?.field).filter(Boolean))),
      total_available: (existing as any).modules.length,
      skipped_existing: true,
    };
  }

  const Master = MerakiModulesMaster();
  const masterRows = await Master.find().lean();

  const modules = masterRows.map((m: any) => {
    const { _id, ...rest } = m;
    return {
      ...rest,
      id: String(_id),
      is_selected: DEFAULT_ENABLED_MODULES.includes(rest.name),
    };
  });

  await Company.updateOne(
    { _id: existing ? (existing as any)._id : merakiCompanyId },
    { $set: { modules, updated_at: new Date() } },
  );

  const selected = modules.filter((m) => m.is_selected);
  return {
    enabled: selected.map((m) => m.name),
    enabled_fields: Array.from(new Set(selected.map((m: any) => m.field).filter(Boolean))),
    total_available: modules.length,
    skipped_existing: false,
  };
}

// -------- Channels config --------

/** Map onboarding's per-stage channel arrays → flat boolean toggles in
 *  meraki_admin.Channels. Onboarding distinguishes LinkedIn-Connection vs
 *  LinkedIn-DM only implicitly (one "linkedin" pick), so we turn both on if
 *  any stage uses linkedin. */
function deriveChannelToggles(company: any): Record<string, boolean> {
  const all = new Set<string>();
  const channelStrategy = company.channelStrategy || {};
  for (const stageKey of ['cold', 'warming', 'warm', 'hot', 'ready']) {
    const arr = channelStrategy[stageKey];
    if (Array.isArray(arr)) arr.forEach((c: any) => typeof c === 'string' && all.add(c.toLowerCase()));
  }
  // Also fold in preferredChannels (set during messaging step before stages).
  const preferred = Array.isArray(company.preferredChannels) ? company.preferredChannels : [];
  preferred.forEach((c: any) => typeof c === 'string' && all.add(c.toLowerCase()));

  return {
    is_email_active: all.has('email'),
    is_whatsapp_active: all.has('whatsapp'),
    is_linkedIn_Connection_active: all.has('linkedin'),
    is_linkedin_dm_active: all.has('linkedin'),
    is_voice_agent_active: all.has('calling') || all.has('voice'),
    is_instagram_active: all.has('instagram'),
    is_communication_note_active: false,
  };
}

async function seedChannelsConfig(
  merakiCompanyId: string,
  company: any,
): Promise<{ applied: Record<string, boolean>; status: 'applied' | 'skipped_existing' }> {
  const Channels = MerakiChannelsConfig();
  // Don't overwrite a manually configured channel doc.
  const existing = await Channels.findOne({ company_id: merakiCompanyId });
  if (existing && (existing as any).seeded_by !== 'meraki_onboarding') {
    return { applied: {}, status: 'skipped_existing' };
  }
  const toggles = deriveChannelToggles(company);
  await Channels.findOneAndUpdate(
    { company_id: merakiCompanyId },
    {
      $set: {
        company_id: merakiCompanyId,
        ...toggles,
        seeded_by: 'meraki_onboarding',
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true },
  );
  return { applied: toggles, status: 'applied' };
}

// -------- General settings --------

const IST_TIMEZONE = {
  iana_key: 'Asia/Kolkata',
  utc_offset: '+05:30',
  abbreviation: 'IST',
  name: 'India Standard Time',
};

async function seedGeneralSettings(
  merakiCompanyId: string,
): Promise<{ status: 'applied' | 'skipped_existing'; time_zone: string }> {
  const Company = MerakiCompany();
  const existing = await Company.findById(merakiCompanyId).lean();
  const currentSettings = (existing as any)?.general_settings;

  // If the founder/admin has already set general_settings, don't clobber it
  // (re-graduation is a refresh, not a reset). We only seed the very first
  // time, when general_settings is missing.
  if (currentSettings && Object.keys(currentSettings).length > 0) {
    return {
      status: 'skipped_existing',
      time_zone: currentSettings.time_zone?.iana_key || currentSettings.timezone || 'unknown',
    };
  }

  const general_settings = {
    is_lead_next_action_enabled: true,
    is_lead_research_enabled: true,
    time_zone: IST_TIMEZONE,
  };

  await Company.updateOne(
    { _id: merakiCompanyId },
    { $set: { general_settings, updated_at: new Date() } },
  );

  return { status: 'applied', time_zone: IST_TIMEZONE.iana_key };
}

// ----------------- helpers -----------------

function kbContent(docs: any[]): any {
  return docs?.find((d) => d.kind === 'knowledge_base')?.content || {};
}
function brandContent(docs: any[]): any {
  return docs?.find((d) => d.kind === 'brand_guidelines')?.content || {};
}

function companyDescription(company: any, docs: any[]): string {
  // Prefer the AI-written companyDescription from the Knowledge Base doc —
  // that's a multi-sentence summary the founder approved. Fall back to the
  // website positioning + target-profile industry only when KB is missing
  // (early-stage companies who skipped Phase B docs).
  const kb = kbContent(docs);
  if (typeof kb.companyDescription === 'string' && kb.companyDescription.trim().length > 50) {
    return kb.companyDescription.slice(0, 1500);
  }
  const parts: string[] = [];
  if (company.research?.website?.positioning) parts.push(company.research.website.positioning);
  if (company.targetProfile?.industryFocus) {
    parts.push(`Targets ${company.targetProfile.industryFocus}.`);
  }
  return parts.join(' ').slice(0, 1000);
}

function buildIntelligenceData(company: any, docs: any[]): Record<string, any> {
  // Map onboarding research + AI-written docs into the shape MerakiBackend
  // expects. Knowledge Base is the SOURCE OF TRUTH for products / value
  // proposition / differentiators — the website signals are noisy fallbacks
  // (page titles vs. structured product names). Only fields we have evidence
  // for go in; gaps stay empty so SuperAdmin shows "needs review" rather
  // than fake data.
  const linkedin = company.research?.linkedin || {};
  const website = company.research?.website || {};
  const tp = company.targetProfile || {};
  const kb = kbContent(docs);
  const brand = brandContent(docs);
  const publicSources = company.research?.publicSources || {};

  const meta = {
    category: 'auto',
    extracted_at: new Date(),
    source: 'meraki_onboarding_graduation',
  };

  // Products: prefer KB's structured 7-9 item list. Website-products is page
  // titles like "Careers at X", "Leadership Team" — useless for sales context.
  const productsServices =
    Array.isArray(kb.productsServices) && kb.productsServices.length > 0
      ? kb.productsServices.filter((s: any) => typeof s === 'string')
      : Array.isArray(website.products)
        ? website.products
        : [];

  // Value proposition: KB's companyDescription is a multi-sentence pitch.
  // Website positioning is a one-line meta description. KB wins.
  const valueProposition =
    typeof kb.companyDescription === 'string' && kb.companyDescription.trim().length > 50
      ? kb.companyDescription
      : website.positioning || '';

  const positioningAngles = Array.isArray(kb.positioningAngles)
    ? kb.positioningAngles.filter((s: any) => typeof s === 'string')
    : [];
  const keyDifferentiators = Array.isArray(kb.keyDifferentiators)
    ? kb.keyDifferentiators.filter((s: any) => typeof s === 'string')
    : [];
  const competitors = Array.isArray(kb.competitors)
    ? kb.competitors.filter((s: any) => typeof s === 'string')
    : [];
  const targetMarket = typeof kb.targetMarket === 'string' ? kb.targetMarket : '';

  // Common objections come back as { objection, response } pairs in our schema.
  // Normalise to that shape even if a hand-edited doc returns plain strings.
  const commonObjections = Array.isArray(kb.commonObjections)
    ? kb.commonObjections.map((o: any) =>
        typeof o === 'string'
          ? { objection: o, response: '' }
          : { objection: String(o?.objection || ''), response: String(o?.response || '') },
      )
    : [];

  return {
    company_intelligence: {
      company_name: company.companyName,
      industry_sector: VERTICAL_TO_INDUSTRY[company.vertical] || 'Other',
      target_customer_segments: tp.industryFocus ? [tp.industryFocus] : [],
      primary_products_and_services: productsServices,
      value_proposition: valueProposition,
      // KB-derived fields — surface for SuperAdmin Company Overview.
      positioning_angles: positioningAngles,
      key_differentiators: keyDifferentiators,
      competitors,
      common_objections: commonObjections,
      target_market_description: targetMarket,
      key_decision_maker_roles: Array.isArray(tp.decisionMakers)
        ? tp.decisionMakers.map((role: string) => ({ role }))
        : [],
      pain_points_and_challenges: Array.isArray(tp.painSignals) ? tp.painSignals : [],
      primary_website_url: company.websiteUrl || '',
      employee_count: linkedin.employeeCount || '',
      // Brand voice — useful for SuperAdmin "how AI sounds" panels.
      brand_tone: brand?.voice?.tone || '',
      brand_voice_dos: Array.isArray(brand?.dos) ? brand.dos : [],
      brand_voice_donts: Array.isArray(brand?.donts) ? brand.donts : [],
      extraction_metadata: meta,
    },
    business_intelligence: {
      recent_news_and_developments: Array.isArray(publicSources.newsMentions)
        ? publicSources.newsMentions.join(' · ')
        : '',
      funding_signals: Array.isArray(publicSources.fundingSignals)
        ? publicSources.fundingSignals.join(' · ')
        : '',
      extraction_metadata: meta,
    },
    geographic_intelligence: linkedin.headquarters
      ? {
          Headquarters: { city: '', state: '', country: linkedin.headquarters },
          ServiceAreas: { details: tp.geography || '' },
          target_market: targetMarket,
        }
      : targetMarket
        ? { ServiceAreas: { details: tp.geography || '' }, target_market: targetMarket }
        : {},
    decision_maker_intelligence: Array.isArray(tp.decisionMakers)
      ? {
          keyDecisionMakerRolesAndTitles: tp.decisionMakers.map((role: string) => ({ role })),
          pain_signals: Array.isArray(tp.painSignals) ? tp.painSignals : [],
          decision_maker_pain_points: Array.isArray(tp.painSignals) ? tp.painSignals : [],
        }
      : {},
  };
}

async function buildPromptContext(
  company: any,
  docs: any[],
): Promise<Record<string, string>> {
  const tp = company.targetProfile || {};
  const website = company.research?.website || {};
  const docByKind = (kind: string) => docs.find((d) => d.kind === kind)?.content || {};
  const kb = docByKind('knowledge_base');
  const brand = docByKind('brand_guidelines');
  const nurture = docByKind('nurture_strategy');
  const scoring = docByKind('scoring_framework');

  const list = (arr: any): string =>
    Array.isArray(arr) ? arr.filter(Boolean).join(', ') : String(arr || '');

  return {
    COMPANY_NAME: company.companyName || '',
    INDUSTRY: VERTICAL_TO_INDUSTRY[company.vertical] || 'B2B',
    WEBSITE: company.websiteUrl || '',
    PRODUCTS_LIST: list(kb.productsServices || website.products || []),
    ICP_DESCRIPTION: tp.industryFocus
      ? `${tp.industryFocus} (${tp.geography || 'global'})`
      : '',
    BRAND_TONE: brand.voice?.tone || '',
    COMMON_OBJECTIONS:
      Array.isArray(kb.commonObjections)
        ? kb.commonObjections
            .map((o: any) => (o?.objection ? `${o.objection}: ${o.response || ''}` : String(o)))
            .join(' · ')
        : '',
    COMPETITORS: list(kb.competitors || []),
    PAIN_POINTS: list(tp.painSignals || []),
    SCORING_CRITERIA:
      typeof scoring?.rationale === 'string' ? scoring.rationale : '',
    CALL_SCRIPTS:
      typeof nurture?.coldOutreach?.firstMessageApproach === 'string'
        ? nurture.coldOutreach.firstMessageApproach
        : '',
    DISCOVERY_QUESTIONS: '',
  };
}

/**
 * Minimal scaffold for prompt types that don't yet have a YAML template in
 * server/src/prompt_templates/base/. Gives the founder something useful out
 * of the box; they can refine in SuperAdmin once the template library is
 * filled out.
 */
function scaffoldPrompt(promptType: string, ctx: Record<string, string>): string {
  const company = ctx.COMPANY_NAME || 'this company';
  const industry = ctx.INDUSTRY || 'B2B';
  const purpose = PROMPT_PURPOSE[promptType] || `the ${promptType.replace(/_/g, ' ')} feature`;
  return [
    `You are an AI assistant for ${company}, a ${industry} company.`,
    '',
    `Your task: ${purpose}.`,
    '',
    `Context about ${company}:`,
    ctx.ICP_DESCRIPTION ? `- Ideal customer: ${ctx.ICP_DESCRIPTION}` : '',
    ctx.PAIN_POINTS ? `- Customer pain points: ${ctx.PAIN_POINTS}` : '',
    ctx.PRODUCTS_LIST ? `- Products: ${ctx.PRODUCTS_LIST}` : '',
    ctx.BRAND_TONE ? `- Voice: ${ctx.BRAND_TONE}` : '',
    '',
    `[This is an auto-seeded scaffold — refine in SuperAdmin → System Setting Prompts to match your company voice.]`,
  ]
    .filter(Boolean)
    .join('\n');
}

const PROMPT_PURPOSE: Record<string, string> = {
  nurture_whatsapp: 'draft conversational, short WhatsApp nurture messages to leads',
  nurture_linkedin_connection_request: 'write LinkedIn connection request notes (under 300 chars)',
  nurture_linkedin_dm: 'write LinkedIn direct messages once a connection is accepted',
  nurture_calling_agent: 'guide a sales rep on a live call — opener, discovery flow, handling',
  your_campaign_Wa_template: 'draft WhatsApp campaign templates that comply with Meta policy',
  your_campaign_Wa_template_image_prompt: 'write image-generation prompts for WhatsApp campaign visuals',
  lead_next_action_planner: 'recommend the single best next action for a given lead, given their current signals',
  lead_call_analysis: 'analyse a finished call transcript — coaching feedback, sentiment, next-action capture',
  target_profile: 'help refine and expand the company\'s ideal customer profile based on data + feedback',
  product_suggestion: 'recommend which of the company\'s products best fit a given prospect',
  account_hunting: 'identify and shortlist new accounts that match the target profile',
  company_analysis: 'produce a structured account-research brief for a given company',
  lead_deep_research: 'go deep on a single lead — background, signals, recent activity, opening angle',
};

// Note: nurture_email, lead_call_preparation, lead_score have proper YAML
// templates already, so they don't appear in this scaffold map.

// -------- Target profiles --------
//
// Employees see Target Profiles via /employees/module-artifacts_artifact_type
// which filters `artifacts` by employee_id. So to prefit the rep view we need
// to write one target_profile artifact PER (employee, locked profile) pair.
// Idempotent on (employee_id, artifact_id) where artifact_id is derived from
// the onboarding profile's variantLabel — re-graduation refreshes content
// without dupes and picks up newly-added employees automatically.

const COMPANY_SIZE_NORMALISER: Array<[RegExp, string]> = [
  [/1-?10\b/i, 'small (1-10 employees)'],
  [/11-?50\b|10-?50\b/i, 'small (11-50 employees)'],
  [/51-?200\b|50-?200\b/i, 'medium (51-200 employees)'],
  [/100-?500\b/i, 'medium (100-500 employees)'],
  [/200-?500\b|201-?500\b/i, 'medium (200-500 employees)'],
  [/500-?1000\b|501-?1000\b/i, 'large (500-1000 employees)'],
  [/1000\+|enterprise/i, 'enterprise (1000+ employees)'],
];

function normaliseCompanySize(input: string | undefined): string {
  if (!input) return '';
  for (const [re, label] of COMPANY_SIZE_NORMALISER) {
    if (re.test(input)) return label;
  }
  return input.toLowerCase();
}

function inferIndustryPair(industryFocus: string | undefined): { industry: string; sub_industry: string } {
  if (!industryFocus) return { industry: '', sub_industry: '' };
  // Use the first comma-separated chunk as primary, the rest as sub-industry.
  const parts = industryFocus.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return {
    industry: parts[0] || '',
    sub_industry: parts.slice(1).join(', '),
  };
}

function parsePrimaryRegions(geography: string | undefined): string[] {
  if (!geography) return [];
  // Onboarding writes free-form like "India — Tier 1 cities (Mumbai, …)".
  // Pull out anything before an em-dash / hyphen / paren as the primary region.
  const head = geography.split(/[—\-(]/)[0].trim();
  return head ? [head] : [];
}

function buildTargetProfileArtifactData(
  candidate: any,
  fallback: any,
  onboardingCompanyId: string,
  variantIndex: number,
): { data: Record<string, any>; display_data: Record<string, any>; artifact_id: string } {
  const profile = candidate?.locked ? candidate : fallback;
  const variantLabel = candidate?.variantLabel || fallback?.variantLabel || `ICP ${variantIndex + 1}`;
  const variantThesis = candidate?.variantThesis || fallback?.variantThesis || '';
  const industryFocus = profile?.industryFocus || fallback?.industryFocus || '';
  const { industry, sub_industry } = inferIndustryPair(industryFocus);

  // Stable artifact_id so re-graduation upserts the same row instead of
  // creating duplicates. Derived from the onboarding company id + index, not
  // from any employee — every employee shares the same artifact_id per profile.
  const artifact_id = `tp_${onboardingCompanyId}_${variantIndex}`;

  const data = {
    industry,
    sub_industry,
    company_size: normaliseCompanySize(profile?.companySize || fallback?.companySize),
    geographic_focus: {
      primary_regions: parsePrimaryRegions(profile?.geography || fallback?.geography),
      exclude_regions: [],
    },
    pain_points: Array.isArray(profile?.painSignals) ? profile.painSignals : [],
    decision_makers: Array.isArray(profile?.decisionMakers) ? profile.decisionMakers : [],
    priority_level: 'high',
    profile_id: artifact_id,
    created_date: profile?.approvedAt || profile?.lockedAt || new Date(),
    agent: 'Target Profile Agent',
    status: 'active',
    type: 'target_profile',
    variant_label: variantLabel,
    variant_thesis: variantThesis,
  };

  const display_data = {
    title: variantLabel,
    description: variantThesis ? variantThesis.slice(0, 240) : `${industry || 'B2B'} target profile`,
    feature: 'Target Profile',
    created_timestamp: (profile?.approvedAt || new Date()).toString(),
    updated_timestamp: new Date().toString(),
    process_duration: 'Onboarding (founder-confirmed)',
    process_duration_raw: null,
    employee_context: '',
    download_count: 0,
    highlighted: false,
  };

  return { data, display_data, artifact_id };
}

/** Stable join key for grouping onboarding leads into accounts. Prefers the
 *  target company website (canonical) and falls back to a normalised company
 *  name when no website is available. */
function accountKeyForLead(lead: any): string {
  const url = (lead.targetCompanyWebsite || '').trim().toLowerCase();
  if (url) return `url:${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  return `name:${(lead.targetCompany || 'unknown').trim().toLowerCase()}`;
}

/** Step 6b: write canonical target_profiles docs for each locked variant.
 *  Returns ids both as a map (variantIndex → _id) and a "first" id used as
 *  the default target_profile_id on accounts. */
async function bridgeTargetProfileDocs(
  company: any,
  merakiCompanyId: string,
  merakiUserId: string,
): Promise<{ docIdsByVariant: Record<number, string>; firstTargetProfileId: string | null }> {
  const TPDoc = MerakiTargetProfileDoc();
  const candidates: any[] = (company.targetProfileCandidates || []).filter((c: any) => c?.locked);
  if (candidates.length === 0 && company.targetProfile?.locked) {
    candidates.push(company.targetProfile);
  }
  const docIdsByVariant: Record<number, string> = {};
  if (candidates.length === 0) {
    return { docIdsByVariant, firstTargetProfileId: null };
  }

  for (let i = 0; i < candidates.length; i++) {
    const { data, display_data, artifact_id } = buildTargetProfileArtifactData(
      candidates[i],
      company.targetProfile,
      String(company._id),
      i,
    );
    // Idempotent on (company_id, artifact_id).
    const doc = await TPDoc.findOneAndUpdate(
      { company_id: merakiCompanyId, artifact_id },
      {
        $set: {
          artifact_id,
          artifact_type: 'target_profile',
          employee_id: merakiUserId,
          company_id: merakiCompanyId,
          data: { ...data, profile_document_id: undefined }, // injected after we know _id
          display_data,
          updated_at: new Date(),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const docId = String((doc as any)._id);
    // Stamp profile_document_id on the doc itself for downstream consumers
    // that read it from data (mirrors how BKC's target_profiles look).
    await TPDoc.updateOne(
      { _id: (doc as any)._id },
      { $set: { 'data.profile_document_id': docId } },
    );
    docIdsByVariant[i] = docId;
  }

  return {
    docIdsByVariant,
    firstTargetProfileId: docIdsByVariant[0] || null,
  };
}

/** Step 6c: group onboarding leads by their target company, write one
 *  b2b_accounts doc per group with target_profile_id linked. Returns a
 *  map (accountKey → b2b_accounts._id) so bridgeLeads can attach. */
async function bridgeAccounts(
  onboardingCompanyId: Types.ObjectId,
  merakiCompanyId: string,
  merakiUserId: string,
  defaultTargetProfileId: string | null,
): Promise<{ accountIdByCompanyKey: Record<string, string>; summary: { bridged: number; updated: number; failed: number } }> {
  const accountIdByCompanyKey: Record<string, string> = {};
  const summary = { bridged: 0, updated: 0, failed: 0 };
  const leads = await OnboardingLead.find({ companyId: onboardingCompanyId }).lean();
  if (leads.length === 0) return { accountIdByCompanyKey, summary };

  // Group by account key — many leads can share one account.
  const groups = new Map<string, any[]>();
  for (const lead of leads) {
    const key = accountKeyForLead(lead);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(lead);
  }

  // Every employee + admin in the company gets their own copy. Without
  // fan-out, only the founder would see the bridged accounts because the
  // rep-facing list filters by ownership ($or of employee_id/owner_id/
  // assigned_to). Founder is always first in the list so accountIdByCompanyKey
  // canonically points at the founder's row (downstream lead writes use it).
  const User = MerakiUser();
  const employeeUsers = await User.find({
    company_id: merakiCompanyId,
    role: { $in: ['user', 'admin'] },
  }).lean();
  const employeeIds: string[] = [];
  // Founder first, so the canonical account_id we return is the founder's.
  const founderIdx = employeeUsers.findIndex((e: any) => String(e._id) === merakiUserId);
  if (founderIdx >= 0) {
    employeeIds.push(merakiUserId);
    employeeUsers.forEach((e: any) => {
      const id = String(e._id);
      if (id !== merakiUserId) employeeIds.push(id);
    });
  } else {
    // Founder isn't in the users collection (shouldn't happen post-graduation
    // but guard anyway) — just take whatever we have.
    employeeUsers.forEach((e: any) => employeeIds.push(String(e._id)));
    if (employeeIds.length === 0) employeeIds.push(merakiUserId);
  }

  const Account = MerakiB2bAccount();
  const sessionId = `onboarding-${onboardingCompanyId.toString()}`;
  const batchId = `hunt_${onboardingCompanyId.toString()}_${Date.now()}`;

  for (const [accountKey, ledLeads] of groups) {
    try {
      // Pick the most-detailed lead in the group as the source of truth.
      const repr = ledLeads.find((l: any) => l.intel?.companyDescription) || ledLeads[0];
      const matchPercent = Math.max(...ledLeads.map((l: any) => l.matchPercent || 0));
      const websiteVerified = !!repr.targetCompanyWebsite;

      const display_data = {
        title: repr.targetCompany || 'Untitled account',
        description: `${repr.targetCompany} | ${repr.industry || ''} | ${repr.targetTeamSize || 'team size unknown'} | ${repr.city || ''} | ${matchPercent}% match`.replace(/\|\s+\|/g, '|').replace(/\s+/g, ' '),
        feature: 'Account',
        created_timestamp: new Date(repr.createdAt).toISOString(),
        updated_timestamp: new Date().toISOString(),
        process_duration: 'Onboarding (founder-confirmed)',
        process_duration_raw: null,
        employee_context: 'Hunted during onboarding',
        download_count: 0,
        highlighted: ledLeads.some((l: any) => l.founderFeedback === 'pursue'),
      };

      const baseSet = {
        target_profile_id: defaultTargetProfileId || undefined,
        company_id: merakiCompanyId,
        session_id: sessionId,
        batch_id: batchId,
        company_name: repr.targetCompany,
        website: repr.targetCompanyWebsite || '',
        website_verified: websiteVerified,
        industry: repr.industry || '',
        location: repr.city || '',
        description: repr.intel?.companyDescription || '',
        tech_stack: [] as string[],
        size_estimate: repr.targetTeamSize || '',
        status: ledLeads.some((l: any) => l.founderFeedback === 'pursue') ? 'qualified' : 'discovered',
        account_type: 'discovered',
        discovery_date: new Date(repr.createdAt).toISOString(),
        research_date: new Date().toISOString(),
        research_source: 'meraki_onboarding',
        // The employee app renders relevance_score as `(score * 100).toFixed(1) + "%"`,
        // so it expects a 0..1 fraction. matchPercent from onboarding is already a
        // percentage (e.g. 87), so divide here. target_fit_score follows the same
        // 0..1 convention (BKC reference: 0.9), with the deeper UI multiplying by 10
        // for "x/10" badges. Without these scales, "87%" rendered as "8700%".
        relevance_score: matchPercent / 100,
        score_breakdown: {
          product_fit: { score: repr.scoreBreakdown?.companyFit || 0, max_score: 30, reasoning: repr.intel?.matchRationale || '' },
          industry_match: { score: matchPercent / 5, max_score: 20, reasoning: `${repr.industry || ''} match` },
          geographic_relativity: { score: 15, max_score: 20, reasoning: repr.city || '' },
        },
        product_fit_analysis: {
          target_fit_score: matchPercent / 100,
          target_fit_reasons: repr.intel?.matchRationale ? [repr.intel.matchRationale] : [],
          recommended_approach: repr.intel?.recommendedApproach || '',
        },
        recent_activity: [] as any[],
        display_data,
        agent: 'Onboarding Account Hunter',
        onboarding_lead_account_key: accountKey,
        onboarding_source: 'meraki_onboarding',
        seeded_by: 'meraki_onboarding',
        updated_at: new Date(),
      };

      let canonicalAccId: string | null = null;
      for (const employeeId of employeeIds) {
        try {
          const acc = await Account.findOneAndUpdate(
            { company_id: merakiCompanyId, onboarding_lead_account_key: accountKey, employee_id: employeeId },
            {
              $set: { ...baseSet, employee_id: employeeId },
              $setOnInsert: { created_at: new Date() },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
          const accId = String((acc as any)._id);
          if (canonicalAccId === null) canonicalAccId = accId;
          if ((acc as any).created_at?.getTime?.() === (acc as any).updated_at?.getTime?.()) {
            summary.bridged += 1;
          } else {
            summary.updated += 1;
          }
        } catch (err: any) {
          console.error('[bridge] account row failed', accountKey, employeeId, err?.message);
          summary.failed += 1;
        }
      }
      if (canonicalAccId) accountIdByCompanyKey[accountKey] = canonicalAccId;
    } catch (err: any) {
      console.error('[bridge] account bridge failed', accountKey, err?.message);
      summary.failed += 1;
    }
  }

  return { accountIdByCompanyKey, summary };
}

/** Step 13: fan out one target_profile artifact per (employee, profile) using
 *  the canonical target_profiles._id from step 6b as data.profile_document_id. */
async function bridgeTargetProfileArtifacts(
  company: any,
  merakiCompanyId: string,
  docIdsByVariant: Record<number, string>,
): Promise<{ profiles: number; employees: number; artifacts_written: number }> {
  const variantCount = Object.keys(docIdsByVariant).length;
  if (variantCount === 0) {
    return { profiles: 0, employees: 0, artifacts_written: 0 };
  }

  // "Employees" in MerakiBackend = users where role='user'. We include admins
  // too so the founder also sees their own ICPs in any view filtering by
  // employee_id.
  const User = MerakiUser();
  const employees = await User.find({
    company_id: merakiCompanyId,
    role: { $in: ['user', 'admin'] },
  }).lean();
  if (employees.length === 0) {
    return { profiles: variantCount, employees: 0, artifacts_written: 0 };
  }

  const candidates: any[] = (company.targetProfileCandidates || []).filter((c: any) => c?.locked);
  if (candidates.length === 0 && company.targetProfile?.locked) {
    candidates.push(company.targetProfile);
  }

  const Artifact = MerakiArtifact();
  let written = 0;

  for (let i = 0; i < candidates.length; i++) {
    const docId = docIdsByVariant[i];
    if (!docId) continue;
    const { data, display_data, artifact_id } = buildTargetProfileArtifactData(
      candidates[i],
      company.targetProfile,
      String(company._id),
      i,
    );
    const dataWithDocId = { ...data, profile_document_id: docId };

    for (const emp of employees) {
      const employeeId = String((emp as any)._id);
      try {
        await Artifact.findOneAndUpdate(
          { artifact_id, employee_id: employeeId, artifact_type: 'target_profile' },
          {
            $set: {
              artifact_type: 'target_profile',
              artifact_id,
              employee_id: employeeId,
              company_id: merakiCompanyId,
              session_id: `onboarding-tp-${String(company._id)}`,
              data: dataWithDocId,
              display_data,
              agent_name: 'target_profile',
              intent: 'create_target_profile',
              onboarding_source: 'meraki_onboarding',
              seeded_by: 'meraki_onboarding',
              updated_at: new Date(),
            },
            $setOnInsert: { created_at: new Date() },
          },
          { upsert: true },
        );
        written += 1;
      } catch (err: any) {
        console.error('[bridge] target_profile artifact write failed', employeeId, artifact_id, err?.message);
      }
    }
  }

  return {
    profiles: candidates.length,
    employees: employees.length,
    artifacts_written: written,
  };
}
