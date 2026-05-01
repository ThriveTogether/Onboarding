/**
 * One-off: cleanup all data for a single test user so the same email can
 * walk the onboarding flow again from scratch.
 *
 * Usage:
 *   tsx scripts/cleanup-user.ts --query "Mahesh Gupta"     # inspect
 *   tsx scripts/cleanup-user.ts --query "Mahesh Gupta" --delete   # delete
 *
 * --query matches against user.name (case-insensitive) OR user.email.
 * Wipes: User row, their OnboardingCompany, OnboardingDocs, OnboardingLeads,
 * FunnelEvents, ReasoningSessions, and (optionally) the bridged company in
 * meraki_admin if MERAKI_ADMIN_MONGODB_URI is set.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../src/models/User';
import { OnboardingCompany } from '../src/models/OnboardingCompany';
import { OnboardingDoc } from '../src/models/OnboardingDoc';
import { OnboardingLead } from '../src/models/OnboardingLead';
import { FunnelEvent } from '../src/models/FunnelEvent';
import { ReasoningSession } from '../src/models/ReasoningSession';

const args = process.argv.slice(2);
const queryIdx = args.indexOf('--query');
const query = queryIdx >= 0 ? args[queryIdx + 1] : '';
const doDelete = args.includes('--delete');

if (!query) {
  console.error('Missing --query "name or email"');
  process.exit(1);
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/meraki_onboarding';
  await mongoose.connect(uri);
  console.log(`[cleanup] Connected to ${uri}`);

  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const users = await User.find({ $or: [{ name: re }, { email: re }] }).lean();

  if (users.length === 0) {
    console.log(`[cleanup] No users matched "${query}"`);
    await mongoose.disconnect();
    return;
  }

  console.log(`[cleanup] Matched ${users.length} user(s):`);
  for (const u of users) {
    console.log(`  - ${u.name || '(no name)'} <${u.email}> _id=${u._id} companyId=${u.companyId || 'none'}`);
  }

  const userIds = users.map((u) => u._id);
  const companyIds = users.map((u) => u.companyId).filter(Boolean) as mongoose.Types.ObjectId[];

  // Tally everything that would be deleted.
  const [docCount, leadCount, eventCount, sessionCount, companies] = await Promise.all([
    OnboardingDoc.countDocuments({ companyId: { $in: companyIds } }),
    OnboardingLead.countDocuments({ companyId: { $in: companyIds } }),
    FunnelEvent.countDocuments({ companyId: { $in: companyIds } }),
    ReasoningSession.countDocuments({ companyId: { $in: companyIds } }),
    OnboardingCompany.find({ _id: { $in: companyIds } }).lean(),
  ]);

  console.log('');
  console.log('[cleanup] Records that would be deleted:');
  console.log(`  Users:                 ${users.length}`);
  console.log(`  OnboardingCompanies:   ${companies.length}`);
  console.log(`  OnboardingDocs:        ${docCount}`);
  console.log(`  OnboardingLeads:       ${leadCount}`);
  console.log(`  FunnelEvents:          ${eventCount}`);
  console.log(`  ReasoningSessions:     ${sessionCount}`);

  // meraki_admin bridge cleanup is opt-in (only if env is set + we know the
  // founder graduated). We surface the IDs but don't auto-touch them here.
  const adminUri = process.env.MERAKI_ADMIN_MONGODB_URI;
  if (adminUri && companies.length > 0) {
    console.log('');
    console.log(`[cleanup] meraki_admin bridge cleanup also possible (set MERAKI_ADMIN_MONGODB_URI):`);
    for (const c of companies) {
      console.log(`  Onboarding company "${c.companyName}" (_id=${c._id})`);
      console.log(`    -> meraki_admin.companies where onboarding_company_id=${c._id}`);
    }
    console.log('  (Run with --delete to also wipe matching meraki_admin records.)');
  }

  if (!doDelete) {
    console.log('');
    console.log('[cleanup] Inspect-only mode. Re-run with --delete to actually wipe.');
    await mongoose.disconnect();
    return;
  }

  // ----- Actual deletion -----
  console.log('');
  console.log('[cleanup] DELETING…');

  const [delDocs, delLeads, delEvents, delSessions, delCompanies, delUsers] = await Promise.all([
    OnboardingDoc.deleteMany({ companyId: { $in: companyIds } }),
    OnboardingLead.deleteMany({ companyId: { $in: companyIds } }),
    FunnelEvent.deleteMany({ companyId: { $in: companyIds } }),
    ReasoningSession.deleteMany({ companyId: { $in: companyIds } }),
    OnboardingCompany.deleteMany({ _id: { $in: companyIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);

  console.log(`  OnboardingDocs:      deleted ${delDocs.deletedCount}`);
  console.log(`  OnboardingLeads:     deleted ${delLeads.deletedCount}`);
  console.log(`  FunnelEvents:        deleted ${delEvents.deletedCount}`);
  console.log(`  ReasoningSessions:   deleted ${delSessions.deletedCount}`);
  console.log(`  OnboardingCompanies: deleted ${delCompanies.deletedCount}`);
  console.log(`  Users:               deleted ${delUsers.deletedCount}`);

  // Optional meraki_admin sweep.
  if (adminUri && companies.length > 0) {
    console.log('');
    console.log('[cleanup] Sweeping meraki_admin bridge records…');
    const adminConn = await mongoose.createConnection(adminUri).asPromise();
    try {
      const adminDb = adminConn.useDb(process.env.MERAKI_ADMIN_DB || 'meraki_admin');
      for (const c of companies) {
        const adminCompany = await adminDb
          .collection('companies')
          .findOne({ onboarding_company_id: c._id.toString() });
        if (!adminCompany) {
          console.log(`  No meraki_admin company found for onboarding_company_id=${c._id}`);
          continue;
        }
        const merakiCompanyId = adminCompany._id;
        const [delPrompts, delKeys, delAdminUsers, delAdminCompany] = await Promise.all([
          adminDb.collection('system_prompts').deleteMany({ company_id: merakiCompanyId }),
          adminDb.collection('company_keys').deleteMany({ company_id: merakiCompanyId }),
          adminDb.collection('users').deleteMany({ company_id: merakiCompanyId }),
          adminDb.collection('companies').deleteOne({ _id: merakiCompanyId }),
        ]);
        console.log(`  meraki_admin company ${merakiCompanyId} (${c.companyName}):`);
        console.log(`    system_prompts: ${delPrompts.deletedCount}`);
        console.log(`    company_keys:   ${delKeys.deletedCount}`);
        console.log(`    users:          ${delAdminUsers.deletedCount}`);
        console.log(`    company:        ${delAdminCompany.deletedCount}`);
      }
    } finally {
      await adminConn.close();
    }
  }

  console.log('');
  console.log('[cleanup] Done.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
