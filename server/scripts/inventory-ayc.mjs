#!/usr/bin/env node
// READ-ONLY inventory of all aYc Analytics records in production.
// Lists what's there so we can decide scope before deleting anything.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

{
  const envPath = path.resolve(__dirname, '../.env');
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const URI = process.env.MONGODB_URI;
const ADMIN_DB = process.env.MERAKI_ADMIN_DB || 'meraki_admin';

const client = new MongoClient(URI);

const NAME_RE = /ayc\s*analytics/i;
const DOMAIN_RE = /aycanalytics/i;

(async () => {
  await client.connect();
  console.log('Connected to', URI.replace(/mongodb(\+srv)?:\/\/[^@]*@/, 'mongodb$1://***@').split('?')[0]);

  // -- Onboarding side --
  const onb = client.db('meraki_onboarding');
  console.log('\n=== meraki_onboarding ===');

  const companies = await onb
    .collection('onboardingcompanies')
    .find({
      $or: [
        { companyName: { $regex: NAME_RE } },
        { websiteUrl: { $regex: DOMAIN_RE } },
        { linkedinUrl: { $regex: DOMAIN_RE } },
      ],
    })
    .project({ _id: 1, companyName: 1, websiteUrl: 1, linkedinUrl: 1, vertical: 1, createdAt: 1, 'targetProfile.locked': 1 })
    .toArray();
  console.log(`OnboardingCompany matches: ${companies.length}`);
  for (const c of companies) {
    console.log(
      `  - _id=${c._id} · "${c.companyName}" · ${c.websiteUrl} · vertical=${c.vertical} · locked=${c.targetProfile?.locked} · created=${c.createdAt?.toISOString?.() || c.createdAt}`,
    );
  }
  const companyIds = companies.map((c) => c._id);

  for (const coll of ['onboardingdocs', 'onboardingleads', 'onboardingaccounts', 'onboardingreasoningsessions']) {
    const n = await onb.collection(coll).countDocuments({ companyId: { $in: companyIds } });
    console.log(`${coll}: ${n}`);
  }

  const users = await onb
    .collection('users')
    .find({
      $or: [
        { email: { $regex: DOMAIN_RE } },
        { companyId: { $in: companyIds } },
      ],
    })
    .project({ _id: 1, email: 1, companyId: 1, createdAt: 1 })
    .toArray();
  console.log(`User records: ${users.length}`);
  for (const u of users) {
    console.log(`  - _id=${u._id} · email=${u.email} · companyId=${u.companyId} · created=${u.createdAt?.toISOString?.() || u.createdAt}`);
  }

  // -- Admin side --
  const adm = client.db(ADMIN_DB);
  console.log(`\n=== ${ADMIN_DB} ===`);

  const adminCompanies = await adm
    .collection('companies')
    .find({
      $or: [{ name: { $regex: NAME_RE } }, { website: { $regex: DOMAIN_RE } }, { domain: { $regex: DOMAIN_RE } }],
    })
    .project({ _id: 1, name: 1, website: 1, domain: 1, createdAt: 1 })
    .toArray();
  console.log(`companies matches: ${adminCompanies.length}`);
  for (const c of adminCompanies) {
    console.log(`  - _id=${c._id} · "${c.name}" · ${c.website || c.domain} · created=${c.createdAt?.toISOString?.() || c.createdAt}`);
  }
  const adminCompanyIds = adminCompanies.map((c) => c._id);

  const adminUsers = await adm
    .collection('users')
    .find({
      $or: [{ email: { $regex: DOMAIN_RE } }, { company_id: { $in: adminCompanyIds.map((i) => String(i)) } }],
    })
    .project({ _id: 1, email: 1, company_id: 1 })
    .toArray();
  console.log(`users matches: ${adminUsers.length}`);
  for (const u of adminUsers) {
    console.log(`  - _id=${u._id} · email=${u.email} · company_id=${u.company_id}`);
  }

  // Check potentially-bridged collections — counts only.
  const bridgedColls = [
    'leads',
    'accounts',
    'roles',
    'modules',
    'channels',
    'general_settings',
    'workflow_stages',
    'knowledge_base',
    'target_profiles',
    'bulk_batch_jobs',
    'bulk_job_leads',
    'bulk_job_activities',
  ];
  for (const coll of bridgedColls) {
    try {
      const candidate1 = await adm
        .collection(coll)
        .countDocuments({ company_id: { $in: adminCompanyIds.map((i) => String(i)) } });
      const candidate2 = await adm
        .collection(coll)
        .countDocuments({ companyId: { $in: adminCompanyIds } });
      const total = candidate1 + candidate2;
      if (total > 0) console.log(`${coll}: ${candidate1} (company_id) + ${candidate2} (companyId) = ${total}`);
    } catch {
      /* ignore non-existent collections */
    }
  }

  await client.close();
})().catch(async (e) => {
  console.error('FATAL', e);
  try { await client.close(); } catch {}
  process.exit(1);
});
