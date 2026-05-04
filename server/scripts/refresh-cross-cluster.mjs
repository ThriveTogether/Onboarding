#!/usr/bin/env node
// Cross-cluster refresh: read OnboardingCompany + docs from one Mongo
// cluster, write the rich intelligence_data to a meraki_admin company on
// a different cluster. Required when staging admin and the onboarding
// wizard live on different Atlas clusters.
//
// Usage:
//   APPLY=1 ONBOARDING_URI=mongodb+srv://...a204r... ADMIN_URI=mongodb+srv://...3ebbfbf... \
//     node server/scripts/refresh-cross-cluster.mjs <onboarding_company_id>

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
  manufacturing: 'Manufacturing', bfsi: 'BFSI', hr_recruitment: 'HR & Recruitment',
  b2b_services: 'B2B Services', b2b_saas: 'B2B SaaS', edtech_b2c: 'EdTech (B2C)', other: 'General B2B',
};

function kbContent(docs) { return docs?.find((d) => d.kind === 'knowledge_base')?.content || {}; }
function brandContent(docs) { return docs?.find((d) => d.kind === 'brand_guidelines')?.content || {}; }

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
  const meta = { category: 'auto', extracted_at: new Date(), source: 'meraki_onboarding_overview_refresh' };

  const productsServices = Array.isArray(kb.productsServices) && kb.productsServices.length > 0
    ? kb.productsServices.filter((s) => typeof s === 'string')
    : Array.isArray(website.products) ? website.products : [];
  const valueProposition = typeof kb.companyDescription === 'string' && kb.companyDescription.trim().length > 50
    ? kb.companyDescription : (website.positioning || '');
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

const onboardingId = (process.argv[2] || '').trim();
const ONBOARDING_URI = process.env.ONBOARDING_URI || process.env.MONGODB_URI;
const ADMIN_URI = process.env.ADMIN_URI || process.env.MONGODB_URI;
const ADMIN_DB = process.env.MERAKI_ADMIN_DB || 'meraki_admin';

if (!onboardingId) { console.error('Usage: refresh-cross-cluster.mjs <onboarding_company_id>'); process.exit(1); }
if (!ONBOARDING_URI || !ADMIN_URI) { console.error('Set ONBOARDING_URI + ADMIN_URI (or MONGODB_URI for both).'); process.exit(1); }

const onbClient = new MongoClient(ONBOARDING_URI);
const admClient = ONBOARDING_URI === ADMIN_URI ? onbClient : new MongoClient(ADMIN_URI);

(async () => {
  await onbClient.connect();
  if (admClient !== onbClient) await admClient.connect();

  const company = await onbClient.db('meraki_onboarding').collection('onboardingcompanies').findOne({ _id: new ObjectId(onboardingId) });
  if (!company) { console.error(`OnboardingCompany ${onboardingId} not found in source cluster.`); process.exit(1); }
  console.log(`[source] OnboardingCompany "${company.companyName}" (${company._id})`);

  const docs = await onbClient.db('meraki_onboarding').collection('onboardingdocs').find({ companyId: company._id }).toArray();
  console.log(`[source] ${docs.length} docs (${docs.map((d) => d.kind).join(', ') || 'none'})`);

  const adminCompany = await admClient.db(ADMIN_DB).collection('companies').findOne({ onboarding_company_id: company._id });
  if (!adminCompany) { console.error(`[target] No admin company linked to onboarding_company_id=${onboardingId}`); process.exit(1); }
  console.log(`[target] Admin company "${adminCompany.name}" (${adminCompany._id})`);

  const description = companyDescription(company, docs);
  const intelligence_data = buildIntelligenceData(company, docs);

  const ci = intelligence_data.company_intelligence;
  console.log('\n--- preview ---');
  console.log(`  value_proposition (200): ${(ci.value_proposition || '').slice(0, 200)}`);
  console.log(`  products: ${ci.primary_products_and_services.length} · diff: ${ci.key_differentiators.length} · comp: ${ci.competitors.length} · obj: ${ci.common_objections.length}`);

  if (!process.env.APPLY) {
    console.log('\n[dry-run] APPLY=1 to write.');
    await onbClient.close();
    if (admClient !== onbClient) await admClient.close();
    return;
  }

  const r = await admClient.db(ADMIN_DB).collection('companies').updateOne(
    { _id: adminCompany._id },
    { $set: { description, intelligence_data, updated_at: new Date() } },
  );
  console.log(`\n[applied] matched=${r.matchedCount} modified=${r.modifiedCount}`);

  await onbClient.close();
  if (admClient !== onbClient) await admClient.close();
})().catch(async (e) => {
  console.error('FATAL', e);
  try { await onbClient.close(); } catch {}
  try { if (admClient !== onbClient) await admClient.close(); } catch {}
  process.exit(1);
});
