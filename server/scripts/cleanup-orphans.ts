/**
 * Find onboarding companies with no User pointing at them (orphans from
 * abandoned tests / demos) and optionally wipe them + their related rows.
 *
 *   tsx scripts/cleanup-orphans.ts            # inspect
 *   tsx scripts/cleanup-orphans.ts --delete   # wipe
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../src/models/User';
import { OnboardingCompany } from '../src/models/OnboardingCompany';
import { OnboardingDoc } from '../src/models/OnboardingDoc';
import { OnboardingLead } from '../src/models/OnboardingLead';
import { FunnelEvent } from '../src/models/FunnelEvent';
import { ReasoningSession } from '../src/models/ReasoningSession';

const doDelete = process.argv.includes('--delete');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/meraki_onboarding';
  await mongoose.connect(uri);
  console.log(`[orphans] Connected to ${uri}`);

  const users = await User.find({}, { companyId: 1 }).lean();
  const linked = new Set(
    users.map((u) => (u.companyId ? String(u.companyId) : null)).filter(Boolean) as string[]
  );

  const companies = await OnboardingCompany.find(
    {},
    { companyName: 1, createdAt: 1, websiteUrl: 1 }
  )
    .sort({ createdAt: 1 })
    .lean();

  const orphans = companies.filter((c) => !linked.has(String(c._id)));
  console.log(`[orphans] ${orphans.length} orphan companies of ${companies.length} total`);

  if (orphans.length === 0) {
    await mongoose.disconnect();
    return;
  }

  for (const c of orphans) {
    const [docs, leads, events, sessions] = await Promise.all([
      OnboardingDoc.countDocuments({ companyId: c._id }),
      OnboardingLead.countDocuments({ companyId: c._id }),
      FunnelEvent.countDocuments({ companyId: c._id }),
      ReasoningSession.countDocuments({ companyId: c._id }),
    ]);
    console.log(
      `  - ${c.companyName} (_id=${c._id}) docs=${docs} leads=${leads} events=${events} sessions=${sessions} website=${c.websiteUrl || ''}`
    );
  }

  if (!doDelete) {
    console.log('');
    console.log('[orphans] Inspect-only mode. Re-run with --delete to actually wipe.');
    await mongoose.disconnect();
    return;
  }

  console.log('');
  console.log('[orphans] DELETING…');

  const ids = orphans.map((c) => c._id);
  const [delDocs, delLeads, delEvents, delSessions, delCompanies] = await Promise.all([
    OnboardingDoc.deleteMany({ companyId: { $in: ids } }),
    OnboardingLead.deleteMany({ companyId: { $in: ids } }),
    FunnelEvent.deleteMany({ companyId: { $in: ids } }),
    ReasoningSession.deleteMany({ companyId: { $in: ids } }),
    OnboardingCompany.deleteMany({ _id: { $in: ids } }),
  ]);

  console.log(`  OnboardingDocs:      deleted ${delDocs.deletedCount}`);
  console.log(`  OnboardingLeads:     deleted ${delLeads.deletedCount}`);
  console.log(`  FunnelEvents:        deleted ${delEvents.deletedCount}`);
  console.log(`  ReasoningSessions:   deleted ${delSessions.deletedCount}`);
  console.log(`  OnboardingCompanies: deleted ${delCompanies.deletedCount}`);

  console.log('[orphans] Done.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
