#!/usr/bin/env node
// Refresh the meraki_admin Company Overview for an already-graduated
// onboarding company. Use this AFTER a bridge fix when you want the new
// rich content to land on records that were graduated under the old code.
//
// Usage:
//   MONGODB_URI=... node server/scripts/refresh-admin-company-overview.mjs zentree
// Match arg matches OnboardingCompany.companyName (case-insensitive substring).

import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dns.setServers(['8.8.8.8', '1.1.1.1']);

{
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const VERTICAL_TO_INDUSTRY = {
  manufacturing: 'Manufacturing',
  bfsi: 'BFSI',
  hr_recruitment: 'HR & Recruitment',
  b2b_services: 'B2B Services',
  b2b_saas: 'B2B SaaS',
  edtech_b2c: 'EdTech (B2C)',
  other: 'General B2B',
};

// Mirrors graduate.ts companyDescription + buildIntelligenceData. Kept in
// sync manually because this is a one-shot patcher; the production code
// path now uses the same logic on every launch.
function kbContent(docs) {
  return docs?.find((d) => d.kind === 'knowledge_base')?.content || {};
}
function brandContent(docs) {
  return docs?.find((d) => d.kind === 'brand_guidelines')?.content || {};
}

function companyDescription(company, docs) {
  const kb = kbContent(docs);
  if (typeof kb.companyDescription === 'string' && kb.companyDescription.trim().length > 50) {
    return kb.companyDescription.slice(0, 1500);
  }
  const parts = [];
  if (company.research?.website?.positioning) parts.push(company.research.website.positioning);
  if (company.targetProfile?.industryFocus) parts.push(`Targets ${company.targetProfile.industryFocus}.`);
  return parts.join(' ').slice(0, 1000);
}

function buildIntelligenceData(company, docs) {
  const linkedin = company.research?.linkedin || {};
  const website = company.research?.website || {};
  const tp = company.targetProfile || {};
  const kb = kbContent(docs);
  const brand = brandContent(docs);
  const publicSources = company.research?.publicSources || {};

  const meta = {
    category: 'auto',
    extracted_at: new Date(),
    source: 'meraki_onboarding_overview_refresh',
  };

  const productsServices =
    Array.isArray(kb.productsServices) && kb.productsServices.length > 0
      ? kb.productsServices.filter((s) => typeof s === 'string')
      : Array.isArray(website.products) ? website.products : [];
  const valueProposition =
    typeof kb.companyDescription === 'string' && kb.companyDescription.trim().length > 50
      ? kb.companyDescription
      : (website.positioning || '');
  const positioningAngles = Array.isArray(kb.positioningAngles) ? kb.positioningAngles.filter((s) => typeof s === 'string') : [];
  const keyDifferentiators = Array.isArray(kb.keyDifferentiators) ? kb.keyDifferentiators.filter((s) => typeof s === 'string') : [];
  const competitors = Array.isArray(kb.competitors) ? kb.competitors.filter((s) => typeof s === 'string') : [];
  const targetMarket = typeof kb.targetMarket === 'string' ? kb.targetMarket : '';
  const commonObjections = Array.isArray(kb.commonObjections)
    ? kb.commonObjections.map((o) => typeof o === 'string'
        ? { objection: o, response: '' }
        : { objection: String(o?.objection || ''), response: String(o?.response || '') })
    : [];

  return {
    company_intelligence: {
      company_name: company.companyName,
      industry_sector: VERTICAL_TO_INDUSTRY[company.vertical] || 'Other',
      target_customer_segments: tp.industryFocus ? [tp.industryFocus] : [],
      primary_products_and_services: productsServices,
      value_proposition: valueProposition,
      positioning_angles: positioningAngles,
      key_differentiators: keyDifferentiators,
      competitors,
      common_objections: commonObjections,
      target_market_description: targetMarket,
      key_decision_maker_roles: Array.isArray(tp.decisionMakers) ? tp.decisionMakers.map((role) => ({ role })) : [],
      pain_points_and_challenges: Array.isArray(tp.painSignals) ? tp.painSignals : [],
      primary_website_url: company.websiteUrl || '',
      employee_count: linkedin.employeeCount || '',
      brand_tone: brand?.voice?.tone || '',
      brand_voice_dos: Array.isArray(brand?.dos) ? brand.dos : [],
      brand_voice_donts: Array.isArray(brand?.donts) ? brand.donts : [],
      extraction_metadata: meta,
    },
    business_intelligence: {
      recent_news_and_developments: Array.isArray(publicSources.newsMentions) ? publicSources.newsMentions.join(' · ') : '',
      funding_signals: Array.isArray(publicSources.fundingSignals) ? publicSources.fundingSignals.join(' · ') : '',
      extraction_metadata: meta,
    },
    geographic_intelligence: linkedin.headquarters
      ? { Headquarters: { city: '', state: '', country: linkedin.headquarters }, ServiceAreas: { details: tp.geography || '' }, target_market: targetMarket }
      : (targetMarket ? { ServiceAreas: { details: tp.geography || '' }, target_market: targetMarket } : {}),
    decision_maker_intelligence: Array.isArray(tp.decisionMakers)
      ? {
          keyDecisionMakerRolesAndTitles: tp.decisionMakers.map((role) => ({ role })),
          pain_signals: Array.isArray(tp.painSignals) ? tp.painSignals : [],
          decision_maker_pain_points: Array.isArray(tp.painSignals) ? tp.painSignals : [],
        }
      : {},
  };
}

const matchArg = (process.argv[2] || '').trim();
if (!matchArg) {
  console.error('Usage: refresh-admin-company-overview.mjs <name-substring>');
  process.exit(1);
}

const ADMIN_DB = process.env.MERAKI_ADMIN_DB || 'meraki_admin';
const client = new MongoClient(process.env.MONGODB_URI);

(async () => {
  await client.connect();
  const onb = client.db('meraki_onboarding');
  const adm = client.db(ADMIN_DB);

  const company = await onb.collection('onboardingcompanies').findOne({
    companyName: { $regex: new RegExp(matchArg, 'i') },
  });
  if (!company) {
    console.error(`No OnboardingCompany matching "${matchArg}".`);
    process.exit(1);
  }
  console.log(`Onboarding company: "${company.companyName}" (${company._id})`);

  const docs = await onb.collection('onboardingdocs').find({ companyId: company._id }).toArray();
  console.log(`Loaded ${docs.length} onboarding docs (${docs.map((d) => d.kind).join(', ')})`);

  // Find admin company by onboarding_company_id link
  const adminCompany = await adm.collection('companies').findOne({ onboarding_company_id: company._id });
  if (!adminCompany) {
    console.error(`No meraki_admin company linked to onboarding_company_id=${company._id}.`);
    console.error('Did this company graduate? Check the onboarding launch flow.');
    process.exit(1);
  }
  console.log(`Admin company: "${adminCompany.name}" (${adminCompany._id})`);

  const description = companyDescription(company, docs);
  const intelligence_data = buildIntelligenceData(company, docs);

  console.log('\n--- preview of refreshed company_intelligence ---');
  const ci = intelligence_data.company_intelligence;
  console.log('  value_proposition (first 200 chars):', (ci.value_proposition || '').slice(0, 200));
  console.log('  primary_products_and_services count:', ci.primary_products_and_services.length);
  console.log('  positioning_angles count:', ci.positioning_angles.length);
  console.log('  key_differentiators count:', ci.key_differentiators.length);
  console.log('  competitors count:', ci.competitors.length);
  console.log('  common_objections count:', ci.common_objections.length);
  console.log('  target_market chars:', (ci.target_market_description || '').length);
  console.log('  brand_tone:', (ci.brand_tone || '').slice(0, 100));

  // Confirm before writing.
  if (!process.env.APPLY) {
    console.log('\n[dry-run] Re-run with APPLY=1 in env to actually write to meraki_admin.companies.');
    await client.close();
    return;
  }

  const result = await adm.collection('companies').updateOne(
    { _id: adminCompany._id },
    { $set: { description, intelligence_data, updated_at: new Date() } },
  );
  console.log(`\n[applied] matched=${result.matchedCount} modified=${result.modifiedCount}`);

  await client.close();
})().catch(async (e) => { console.error('FATAL', e); await client.close().catch(()=>{}); process.exit(1); });
