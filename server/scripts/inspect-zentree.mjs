#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

// Local resolver was timing out on Atlas SRV records — pin to Google DNS.
dns.setServers(['8.8.8.8', '1.1.1.1']);

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

  const c = await onb.collection('onboardingcompanies').findOne({
    $or: [
      { companyName: { $regex: /zentree/i } },
      { websiteUrl: { $regex: /zentree/i } },
      { linkedinUrl: { $regex: /zentree/i } },
    ],
  });

  if (!c) {
    console.log('No Zentree company found in meraki_onboarding.onboardingcompanies (this DB).');
    console.log('It may live on a different cluster (the prod VM uses its own .env).');
    await client.close();
    return;
  }

  console.log('=== Zentree Labs onboarding company ===');
  console.log('_id:', c._id);
  console.log('companyName:', c.companyName);
  console.log('website:', c.websiteUrl, '· linkedin:', c.linkedinUrl);
  console.log('vertical:', c.vertical, '· salesTeamSize:', c.salesTeamSize);
  console.log('createdAt:', c.createdAt, '· updatedAt:', c.updatedAt);
  console.log('quick_setup_complete:', c.quick_setup_complete, '· current_onboarding_step:', c.current_onboarding_step);

  console.log('\n--- research.linkedin ---');
  console.log('status:', c.research?.linkedin?.status);
  console.log('about:', c.research?.linkedin?.about);
  console.log('employeeCount:', c.research?.linkedin?.employeeCount);
  console.log('headquarters:', c.research?.linkedin?.headquarters);

  console.log('\n--- research.website ---');
  console.log('status:', c.research?.website?.status);
  console.log('positioning:', c.research?.website?.positioning);
  console.log('products:', c.research?.website?.products);
  console.log('toneSignals:', c.research?.website?.toneSignals);
  console.log('freshness:', c.research?.website?.freshness);

  console.log('\n--- research.publicSources ---');
  console.log('status:', c.research?.publicSources?.status);
  console.log('newsMentions:', c.research?.publicSources?.newsMentions);
  console.log('fundingSignals:', c.research?.publicSources?.fundingSignals);

  console.log('\n--- targetProfile (primary, locked=' + (c.targetProfile?.locked) + ') ---');
  if (c.targetProfile) {
    console.log('industry:', c.targetProfile.industryFocus);
    console.log('size+geo:', c.targetProfile.companySize, '·', c.targetProfile.geography);
    console.log('DMs:', (c.targetProfile.decisionMakers || []).join(', '));
    console.log('pain:', (c.targetProfile.painSignals || []).join(' | '));
  }

  console.log('\n--- targetProfileCandidates count:', (c.targetProfileCandidates || []).length, '---');
  for (const v of (c.targetProfileCandidates || [])) {
    console.log(`\n  [${v.variantLabel}] selected=${v.isSelected} locked=${v.locked}`);
    console.log('    thesis:  ', v.variantThesis);
    console.log('    industry:', v.industryFocus);
    console.log('    geo+size:', v.companySize, '·', v.geography);
    console.log('    DMs:     ', (v.decisionMakers || []).join(', '));
    console.log('    pain:    ', (v.painSignals || []).slice(0, 3).join(' | '));
  }

  // Look for the Knowledge Base doc — that's the actual "company overview" the
  // wizard generates ("What your AI knows").
  const docs = await onb.collection('onboardingdocs').find({ companyId: c._id }).toArray();
  console.log('\n--- onboardingdocs:', docs.length, '---');
  for (const d of docs) {
    console.log('\n>>> kind:', d.kind, '· status:', d.status, '· version:', d.currentVersion);
    if (d.kind === 'knowledge_base' && d.content) {
      console.log('--- KB content ---');
      const k = d.content;
      console.log('companyDescription:', k.companyDescription);
      console.log('productsServices:', k.productsServices);
      console.log('positioningAngles:', k.positioningAngles);
      console.log('targetMarket:', k.targetMarket);
      console.log('keyDifferentiators:', k.keyDifferentiators);
      console.log('competitors:', k.competitors);
      console.log('commonObjections:');
      for (const o of (k.commonObjections || [])) {
        console.log('  -', o.objection, '→', o.response);
      }
    } else if (d.kind === 'brand_guidelines' && d.content) {
      console.log('  voice.tone:', d.content.voice?.tone);
      console.log('  sample cold:', d.content.samples?.coldWhatsApp?.slice(0, 200));
    } else if (d.rawMarkdown) {
      console.log(d.rawMarkdown.slice(0, 500));
    }
  }

  await client.close();
})().catch(async (e) => { console.error(e); await client.close().catch(()=>{}); process.exit(1); });
