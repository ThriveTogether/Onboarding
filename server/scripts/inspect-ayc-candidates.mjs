#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';

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

  const c = await onb.collection('onboardingcompanies').findOne({ _id: new ObjectId('69f721acd41bb2ea37b13140') });
  if (!c) { console.log('not found'); return; }

  console.log('Company:', c.companyName, '· vertical:', c.vertical, '· website:', c.websiteUrl);
  console.log('updatedAt:', c.updatedAt);
  console.log('research.website.status:', c.research?.website?.status);
  console.log('research.website.positioning:');
  console.log('  ', c.research?.website?.positioning?.slice(0, 250));
  console.log('research.linkedin.status:', c.research?.linkedin?.status);
  console.log('research.linkedin.about:');
  console.log('  ', c.research?.linkedin?.about?.slice(0, 250));
  console.log('research.publicSources.status:', c.research?.publicSources?.status);
  console.log('research.publicSources.newsMentions:', c.research?.publicSources?.newsMentions?.length);
  console.log('research.publicSources.fundingSignals:', c.research?.publicSources?.fundingSignals?.length);

  console.log('\ntargetProfileCandidates count:', (c.targetProfileCandidates || []).length);
  for (const v of (c.targetProfileCandidates || [])) {
    console.log(`\n--- ${v.variantLabel} ---`);
    console.log('  thesis:   ', v.variantThesis);
    console.log('  industry: ', v.industryFocus);
    console.log('  geo+size: ', v.companySize, '·', v.geography);
    console.log('  DMs:      ', (v.decisionMakers || []).join(', '));
    console.log('  pain:     ', (v.painSignals || []).slice(0, 3).join(' | '));
  }

  console.log('\ntargetProfile.locked:', c.targetProfile?.locked);
  console.log('targetProfile.industryFocus:', c.targetProfile?.industryFocus);

  await client.close();
})().catch(async (e) => { console.error(e); await client.close().catch(()=>{}); process.exit(1); });
