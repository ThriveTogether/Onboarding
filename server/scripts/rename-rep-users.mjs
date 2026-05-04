#!/usr/bin/env node
// Strip the trailing " (Rep)" suffix from synthetic +rep@ users in
// meraki_admin.users — they were created by older bridge runs that
// appended (Rep) to the founder's name. The current bridge no longer
// adds that suffix, and Employee Management hides these users entirely
// via a server-side +rep@ filter, but cleaning the names removes the
// label from any internal audit / debug surface that still shows them.
//
// Usage:
//   APPLY=1 MONGODB_URI=... node server/scripts/rename-rep-users.mjs

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

  const reps = await adm.collection('users').find({ email: { $regex: /\+rep@/i } }).toArray();
  console.log(`Found ${reps.length} +rep@ users.`);

  let toRename = 0;
  for (const u of reps) {
    const stripped = (u.name || '').replace(/\s*\(Rep\)\s*$/, '').trim();
    if (stripped !== u.name) {
      console.log(`  ${u.email}: "${u.name}" → "${stripped}"`);
      toRename += 1;
    }
  }
  console.log(`\n${toRename} renames pending.`);

  if (!process.env.APPLY) {
    console.log('[dry-run] APPLY=1 to write.');
    await client.close();
    return;
  }

  let modified = 0;
  for (const u of reps) {
    const stripped = (u.name || '').replace(/\s*\(Rep\)\s*$/, '').trim();
    if (stripped !== u.name) {
      const r = await adm.collection('users').updateOne(
        { _id: u._id },
        { $set: { name: stripped, updated_at: new Date() } },
      );
      modified += r.modifiedCount;
    }
  }
  console.log(`[applied] modified=${modified}`);

  await client.close();
})().catch(async (e) => { console.error('FATAL', e); await client.close().catch(()=>{}); process.exit(1); });
