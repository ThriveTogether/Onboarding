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
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const ADMIN_DB = process.env.MERAKI_ADMIN_DB || 'meraki_admin';
const client = new MongoClient(process.env.MONGODB_URI);

(async () => {
  await client.connect();
  const adm = client.db(ADMIN_DB);

  // Find ALL companies that look like Zentree.
  const cs = await adm.collection('companies').find({
    $or: [
      { name: { $regex: /zentree/i } },
      { website: { $regex: /zentree/i } },
      { domain: { $regex: /zentree/i } },
    ],
  }).toArray();

  console.log(`Found ${cs.length} Zentree-like company records in ${ADMIN_DB}.companies\n`);

  for (const c of cs) {
    console.log(`_id: ${c._id}`);
    console.log(`  name: ${c.name}`);
    console.log(`  website: ${c.website}`);
    console.log(`  onboarding_company_id: ${c.onboarding_company_id}`);
    console.log(`  description (first 100): ${(c.description || '').slice(0, 100)}`);
    console.log(`  intelligence_data.company_intelligence.value_proposition (first 100): ${(c.intelligence_data?.company_intelligence?.value_proposition || '').slice(0, 100)}`);
    console.log(`  intelligence_data.company_intelligence.primary_products_and_services (count): ${(c.intelligence_data?.company_intelligence?.primary_products_and_services || []).length}`);
    if ((c.intelligence_data?.company_intelligence?.primary_products_and_services || []).length > 0) {
      console.log(`    sample[0]: ${c.intelligence_data.company_intelligence.primary_products_and_services[0]?.slice?.(0, 100) || ''}`);
    }
    console.log(`  updated_at: ${c.updated_at}`);
    console.log(`  created_by: ${c.created_by}`);
    console.log('');
  }

  // Find users linked to Zentree to see which company they use.
  const users = await adm.collection('users').find({
    $or: [
      { email: { $regex: /zentree/i } },
      { company_id: { $in: cs.map((c) => String(c._id)) } },
    ],
  }).project({ _id: 1, email: 1, company_id: 1, role: 1 }).toArray();
  console.log(`\n--- Zentree-related users (${users.length}) ---`);
  for (const u of users) {
    console.log(`  ${u.email} · company_id=${u.company_id} · role=${u.role || '-'}`);
  }

  await client.close();
})().catch(async (e) => { console.error('FATAL', e); await client.close().catch(()=>{}); process.exit(1); });
