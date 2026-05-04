#!/usr/bin/env node
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

const client = new MongoClient(process.env.MONGODB_URI);

(async () => {
  await client.connect();
  const onb = client.db('meraki_onboarding');

  // All recent companies, sorted by most recent activity.
  const all = await onb
    .collection('onboardingcompanies')
    .find({})
    .sort({ updatedAt: -1 })
    .limit(20)
    .project({
      _id: 1,
      companyName: 1,
      websiteUrl: 1,
      vertical: 1,
      createdAt: 1,
      updatedAt: 1,
      'targetProfile.locked': 1,
      'targetProfileCandidates.industryFocus': 1,
    })
    .toArray();

  console.log(`Total companies (showing 20 most recent): ${all.length}\n`);
  for (const c of all) {
    console.log(`_id=${c._id}`);
    console.log(`  name="${c.companyName}" · website=${c.websiteUrl} · vertical=${c.vertical}`);
    console.log(`  created=${c.createdAt?.toISOString?.() || c.createdAt} · updated=${c.updatedAt?.toISOString?.() || c.updatedAt}`);
    console.log(`  locked=${c.targetProfile?.locked} · candidate count=${(c.targetProfileCandidates || []).length}`);
    if (c.targetProfileCandidates?.length) {
      c.targetProfileCandidates.forEach((v, i) => {
        console.log(`    [${i}] ${v.industryFocus?.slice(0, 100)}`);
      });
    }
    console.log('');
  }

  await client.close();
})().catch(async (e) => { console.error(e); await client.close().catch(()=>{}); process.exit(1); });
