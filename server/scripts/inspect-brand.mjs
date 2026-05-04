#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dns.setServers(['8.8.8.8', '1.1.1.1']);

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
  const c = await onb.collection('onboardingcompanies').findOne({ companyName: { $regex: /zentree/i } });
  if (!c) { console.log('not found'); return; }
  const doc = await onb.collection('onboardingdocs').findOne({ companyId: c._id, kind: 'brand_guidelines' });
  if (!doc) { console.log('no brand doc'); return; }
  console.log('--- Brand rationale ---');
  console.log(doc.content?.rationale);
  console.log('\n--- length:', (doc.content?.rationale || '').length);
  console.log('\n--- voice ---');
  console.log(JSON.stringify(doc.content?.voice, null, 2));
  await client.close();
})().catch(async (e) => { console.error(e); await client.close().catch(()=>{}); process.exit(1); });
