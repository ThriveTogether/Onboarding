import { Types } from 'mongoose';
import { OnboardingCompany } from '../../models/OnboardingCompany';
import { User as OnboardingUser } from '../../models/User';
import { OnboardingDoc } from '../../models/OnboardingDoc';
import { MerakiCompany, MerakiUser, MerakiSystemPrompt, MerakiCompanyKey } from './merakiAdminClient';
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
  status: 'success' | 'error';
  meraki_company_id?: string;
  meraki_user_id?: string;
  prompts_seeded: string[];
  prompts_skipped: string[];
  prompts_failed: Array<{ type: string; reason: string }>;
  api_keys_seeded: string[];
  api_keys_skipped: string[];
  created: { company: boolean; user: boolean };
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
      created: { company: false, user: false },
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
      created: { company: false, user: false },
    };
  }

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
        description: companyDescription(company),
        intelligence_data: buildIntelligenceData(company),
        current_onboarding_step: 'graduated',
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
        is_authenticated_via_sso: true,
        password: null,
        created_at: new Date(),
        graduated_at: new Date(),
      },
      $set: {
        name: founder.name || '',
        role: 'admin',
        company_id: merakiCompanyId,
        company_name: company.companyName,
        is_active: true,
        is_verified: true,
        updated_at: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const merakiUserId = (userDoc as any)._id.toString();
  const createdUser = (userDoc as any).graduated_at?.getTime?.() === (userDoc as any).updated_at?.getTime?.();

  // 3. Build prompt context — used to interpolate every per-company prompt.
  const docs = await OnboardingDoc.find({ companyId: company._id });
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

  return {
    status: 'success',
    meraki_company_id: merakiCompanyId,
    meraki_user_id: merakiUserId,
    prompts_seeded: promptsSeeded,
    prompts_skipped: promptsSkipped,
    prompts_failed: promptsFailed,
    api_keys_seeded: apiKeysSeeded,
    api_keys_skipped: apiKeysSkipped,
    created: { company: createdCompany, user: createdUser },
  };
}

// ----------------- helpers -----------------

function companyDescription(company: any): string {
  const parts: string[] = [];
  if (company.research?.website?.positioning) parts.push(company.research.website.positioning);
  if (company.targetProfile?.industryFocus) {
    parts.push(`Targets ${company.targetProfile.industryFocus}.`);
  }
  return parts.join(' ').slice(0, 1000);
}

function buildIntelligenceData(company: any): Record<string, any> {
  // Map onboarding research signals into the shape MerakiBackend expects.
  // Only the fields we have evidence for go in — gaps stay empty so the
  // SuperAdmin UI shows "needs review" rather than fake data.
  const linkedin = company.research?.linkedin || {};
  const website = company.research?.website || {};
  const tp = company.targetProfile || {};
  const meta = {
    category: 'auto',
    extracted_at: new Date(),
    source: 'meraki_onboarding_graduation',
  };
  return {
    company_intelligence: {
      company_name: company.companyName,
      industry_sector: VERTICAL_TO_INDUSTRY[company.vertical] || 'Other',
      target_customer_segments: tp.industryFocus ? [tp.industryFocus] : [],
      primary_products_and_services: Array.isArray(website.products) ? website.products : [],
      value_proposition: website.positioning || '',
      key_decision_maker_roles: Array.isArray(tp.decisionMakers)
        ? tp.decisionMakers.map((role: string) => ({ role }))
        : [],
      pain_points_and_challenges: Array.isArray(tp.painSignals) ? tp.painSignals : [],
      primary_website_url: company.websiteUrl || '',
      employee_count: linkedin.employeeCount || '',
      extraction_metadata: meta,
    },
    business_intelligence: {
      recent_news_and_developments: Array.isArray(company.research?.publicSources?.newsMentions)
        ? company.research.publicSources.newsMentions.join(' · ')
        : '',
      extraction_metadata: meta,
    },
    geographic_intelligence: linkedin.headquarters
      ? {
          Headquarters: { city: '', state: '', country: linkedin.headquarters },
          ServiceAreas: { details: tp.geography || '' },
        }
      : {},
    decision_maker_intelligence: Array.isArray(tp.decisionMakers)
      ? {
          keyDecisionMakerRolesAndTitles: tp.decisionMakers.map((role: string) => ({ role })),
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
