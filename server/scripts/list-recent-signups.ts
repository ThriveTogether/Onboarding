/**
 * List recent signups, optionally filtered by a "since" timestamp.
 *
 * Usage:
 *   tsx scripts/list-recent-signups.ts                           # all signups today (server-local TZ)
 *   tsx scripts/list-recent-signups.ts --since "2026-05-01T17:30:00+05:30"
 *   tsx scripts/list-recent-signups.ts --since "today 17:30 IST"
 *   MONGODB_URI=mongodb+srv://... tsx scripts/list-recent-signups.ts --since ...
 *
 * Output: tab-separated rows (createdAt, email, name, companyName, _id) +
 * a trailing count. Pipe to a file or pbcopy as needed.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../src/models/User';
import { OnboardingCompany } from '../src/models/OnboardingCompany';

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function parseSince(input: string | undefined): Date {
  if (!input) {
    // Default: start of today in IST (UTC+05:30) — matches the user's "after 5:30pm today" framing.
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const istMidnight = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
    return new Date(istMidnight.getTime() - istOffsetMs);
  }
  // Convenience: "today 17:30 IST"
  const m = /^today\s+(\d{1,2}):(\d{2})\s+IST$/i.exec(input.trim());
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const istTarget = new Date(Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate(),
      hh,
      mm,
      0,
      0,
    ));
    return new Date(istTarget.getTime() - istOffsetMs);
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    console.error(`[list-recent-signups] Could not parse --since "${input}". Use ISO 8601 (e.g. 2026-05-01T17:30:00+05:30) or "today HH:MM IST".`);
    process.exit(1);
  }
  return d;
}

async function main() {
  const sinceArg = getArg('--since');
  const since = parseSince(sinceArg);

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/meraki_onboarding';
  await mongoose.connect(uri);
  console.error(`[list-recent-signups] Connected to ${uri.replace(/:\/\/[^@]+@/, '://<redacted>@')}`);
  console.error(`[list-recent-signups] Filter: createdAt >= ${since.toISOString()} (${since.toString()})`);

  const users = await User.find({ createdAt: { $gte: since } })
    .sort({ createdAt: 1 })
    .lean();

  if (users.length === 0) {
    console.error('[list-recent-signups] No signups in window.');
    await mongoose.disconnect();
    return;
  }

  // Header + rows (tab-separated for easy paste into a sheet).
  console.log(['createdAt', 'email', 'name', 'companyName', 'companyId', 'lastLoginAt', 'userId'].join('\t'));
  for (const u of users) {
    console.log([
      new Date(u.createdAt).toISOString(),
      u.email,
      u.name || '',
      u.companyName || '',
      u.companyId ? String(u.companyId) : '',
      u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '',
      String(u._id),
    ].join('\t'));
  }
  console.error(`[list-recent-signups] ${users.length} user(s) since ${since.toISOString()}.`);

  // Bonus: count companies + leads attached to those users so you can see
  // how far each one progressed.
  const companyIds = users.map((u) => u.companyId).filter(Boolean);
  if (companyIds.length > 0) {
    const companies = await OnboardingCompany.find({ _id: { $in: companyIds } })
      .select({ _id: 1, companyName: 1, vertical: 1, websiteUrl: 1, phaseAComplete: 1, channelsConfiguredAt: 1, previewSeenAt: 1 })
      .lean();
    console.error('');
    console.error('[list-recent-signups] Onboarding progress for the above users:');
    for (const c of companies) {
      console.error(`  - ${c.companyName} (vertical=${(c as any).vertical || '-'}, site=${(c as any).websiteUrl || '-'}) phaseA=${(c as any).phaseAComplete ? 'yes' : 'no'} channelsConfigured=${(c as any).channelsConfiguredAt ? 'yes' : 'no'} previewSeen=${(c as any).previewSeenAt ? 'yes' : 'no'}`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
