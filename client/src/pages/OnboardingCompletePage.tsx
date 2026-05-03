import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Check,
  Building2,
  Users,
  FileText,
  MessageSquare,
  Flame,
  TrendingUp,
  Mail,
  ExternalLink,
  KeyRound,
} from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import { authAPI } from '../api/auth';
import Card from '../components/Card';

// Where graduated founders sign in. Compile-time fallback — production
// builds should override via VITE_MERAKI_ADMIN_APP_URL. We read it via a
// loose `any` cast because this client tsconfig doesn't pull in vite/client
// types and we don't want to expand the type surface for a single env read.
const MERAKI_ADMIN_URL =
  ((import.meta as any).env?.VITE_MERAKI_ADMIN_APP_URL as string | undefined) ||
  'https://merakiadmin-staging.t2ai.ai';

// What we surface on the final screen, per item 11:
//   (a) live counts — what the founder built / found
//   (b) shaped insights — what the data is telling us about who buys
//   (c) next-action prompts — top leads to start with today
interface SessionSummary {
  successMetric: string;
  companyName: string;
  // (a)
  leadCount: number;
  accountCount: number;
  docsApproved: number;
  docsTotal: number;
  messageTemplates: number;
  painSignals: number;
  // (b) shaped insights
  topIndustry: string | null;
  topCity: string | null;
  topPainSignal: string | null;
  // (c) top-5 hottest leads
  topLeads: Array<{
    _id: string;
    contactName: string;
    contactTitle: string;
    targetCompany: string;
    matchPercent: number;
    industry?: string;
    city?: string;
  }>;
}

export default function OnboardingCompletePage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [founderEmail, setFounderEmail] = useState<string>('');
  const [emailCopied, setEmailCopied] = useState(false);

  // Pull the logged-in founder's email so we can show it as the admin login
  // hint without making them remember what they typed at signup.
  useEffect(() => {
    authAPI
      .me()
      .then((res) => {
        const email = (res.data as any)?.user?.email || '';
        if (email) setFounderEmail(email);
      })
      .catch(() => {
        /* email shown as blank — they can still type it manually on the admin login */
      });
  }, []);

  const copyEmail = async () => {
    if (!founderEmail) return;
    try {
      await navigator.clipboard.writeText(founderEmail);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      /* clipboard API unavailable — manual select still works */
    }
  };

  useEffect(() => {
    if (!id) return;
    Promise.all([onboardingAPI.state(id), onboardingAPI.listLeads(id)]).then(
      ([stateRes, leadsRes]) => {
        const company: any = stateRes.data.company || {};
        const docs: any[] = (stateRes.data as any).docs || [];
        const leads: any[] = leadsRes.data.leads || [];

        // Per item 9 we surface 3 reviewable docs in the founder UI: brochure
        // (knowledge_base), nurture, brand. Scoring is auto-generated.
        const reviewableKinds = new Set([
          'knowledge_base',
          'nurture_strategy',
          'brand_guidelines',
        ]);
        const approvedStatuses = new Set(['approved', 'auto_approved']);
        const docsApproved = docs.filter(
          (d) => reviewableKinds.has(d.kind) && approvedStatuses.has(d.status),
        ).length;
        const docsTotal = 3;

        const painSignals = Array.isArray(company.targetProfile?.painSignals)
          ? company.targetProfile.painSignals.filter((p: string) => p && p.trim()).length
          : 0;
        const topPainSignal: string | null =
          (company.targetProfile?.painSignals || []).find((p: string) => p && p.trim()) || null;

        // Account count = unique target companies among the leads.
        const accountSet = new Set<string>();
        leads.forEach((l) => l.targetCompany && accountSet.add(l.targetCompany));

        setSummary({
          successMetric: company.successMetric || '',
          companyName: company.companyName || '',
          leadCount: stateRes.data.leadCount || 0,
          accountCount: accountSet.size,
          docsApproved,
          docsTotal,
          messageTemplates: Array.isArray(company.messageTemplates)
            ? company.messageTemplates.filter((t: any) => t?.body).length
            : 0,
          painSignals,
          topIndustry: modeOf(leads.map((l) => l.industry).filter(Boolean)),
          topCity: modeOf(leads.map((l) => l.city).filter(Boolean)),
          topPainSignal,
          topLeads: [...leads]
            .sort((a, b) => (b.matchPercent || 0) - (a.matchPercent || 0))
            .slice(0, 5)
            .map((l) => ({
              _id: l._id,
              contactName: l.contactName,
              contactTitle: l.contactTitle,
              targetCompany: l.targetCompany,
              matchPercent: l.matchPercent || 0,
              industry: l.industry,
              city: l.city,
            })),
        });
      },
    );
  }, [id]);

  return (
    <div className="mp-app-shell" style={{ padding: 'var(--space-6) var(--space-4)' }}>
      <div style={{ width: '100%', maxWidth: 880, margin: '0 auto' }}>
        {/* Hero */}
        <Card padding="lg" className="mp-text-center" style={{ marginBottom: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--mp-coral-100)',
              color: 'var(--mp-coral)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Check size={28} strokeWidth={2.5} />
          </div>
          <h2 className="mp-h2" style={{ margin: 0 }}>
            {summary?.companyName ? `${summary.companyName} — you're all set.` : "You're all set."}
          </h2>
          <p className="mp-body-sm mp-muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Here's everything we put together with you. Team Meraki will reach out shortly to walk you through what's next.
          </p>
        </Card>

        {/* (a) Live counts — what the founder built / found during onboarding */}
        {summary && (
          <div className="mp-complete-stats" style={{ marginBottom: 16 }}>
            <BigStat icon={Building2} value={summary.accountCount} label="accounts in your ICP" />
            <BigStat icon={Users} value={summary.leadCount} label="leads in your pipeline" />
            <BigStat
              icon={FileText}
              value={`${summary.docsApproved}/${summary.docsTotal}`}
              label="strategy docs ready"
            />
            <BigStat icon={MessageSquare} value={summary.messageTemplates} label="message templates drafted" />
          </div>
        )}

        {/* (b) Shaped insights — what the data tells us about who buys */}
        {summary && (summary.topIndustry || summary.topCity || summary.topPainSignal) && (
          <Card padding="lg" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <TrendingUp size={16} style={{ color: 'var(--mp-indigo)' }} />
              <h3 className="mp-h4" style={{ margin: 0 }}>What the data is telling us</h3>
            </div>
            <div className="mp-complete-insights">
              {summary.topIndustry && (
                <Insight
                  label="Hottest segment"
                  body={summary.topIndustry}
                  detail={summary.topCity ? `Concentrated in ${summary.topCity}` : undefined}
                />
              )}
              {summary.topPainSignal && (
                <Insight
                  label="Top pain you solve"
                  body={summary.topPainSignal}
                />
              )}
              {summary.painSignals > 1 && (
                <Insight
                  label="Other pains captured"
                  body={`${summary.painSignals - 1} more`}
                  detail="Your AI weaves these into messaging by stage."
                />
              )}
            </div>
          </Card>
        )}

        {/* (c) Next-action prompts — top 5 leads to start with today */}
        {summary && summary.topLeads.length > 0 && (
          <Card padding="lg" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Flame size={16} style={{ color: 'var(--mp-coral)' }} />
              <h3 className="mp-h4" style={{ margin: 0 }}>Start with these {summary.topLeads.length} today</h3>
            </div>
            <p className="mp-body-sm mp-muted" style={{ marginTop: 0, marginBottom: 12 }}>
              Highest match against your ICP. Your AI is already warming the rest.
            </p>
            <ol className="mp-complete-leads">
              {summary.topLeads.map((l, i) => (
                <li key={l._id} className="mp-complete-lead">
                  <div className="mp-complete-lead__rank">{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mp-complete-lead__name">{l.contactName}</div>
                    <div className="mp-complete-lead__sub">
                      {l.contactTitle} · {l.targetCompany}
                      {l.city ? ` · ${l.city}` : ''}
                    </div>
                  </div>
                  <div className="mp-complete-lead__match">{l.matchPercent}%</div>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {/* Success metric anchor */}
        {summary?.successMetric && (
          <Card padding="md" tone="tinted" style={{ marginBottom: 16 }}>
            <div className="mp-overline" style={{ marginBottom: 4 }}>Your 90-day north star</div>
            <div style={{ fontWeight: 'var(--fw-semibold)' }}>{summary.successMetric}</div>
          </Card>
        )}

        {/* Sign-in card — header + email field + two CTAs (primary: open admin
            sign-in, ghost: reset password). Uses Meraki design tokens (mp-btn--*,
            mp-overline, brand colours) so it matches the rest of the wizard. */}
        <Card padding="lg" tone="tinted">
          {/* Header: brand badge + title */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--mp-indigo)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(21,43,104,0.08))',
              }}
            >
              <KeyRound size={20} strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="mp-h4" style={{ margin: 0 }}>
                Sign in to MerakiPeople
              </h3>
              <p className="mp-body-sm mp-muted" style={{ margin: '4px 0 0' }}>
                Your workspace is ready — company, leads, strategy docs and AI prompts already loaded.
              </p>
            </div>
          </div>

          {/* Email "field" — looks like a real input row, with Copy button */}
          <div className="mp-overline" style={{ marginBottom: 8 }}>
            Your sign-in email
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              background: '#fff',
              border: '1px solid var(--border-subtle, #E1E5EE)',
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <Mail size={16} strokeWidth={2} style={{ color: 'var(--mp-indigo)', flexShrink: 0 }} />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 14,
                fontWeight: 'var(--fw-medium, 500)',
                color: 'var(--text-strong, #152B68)',
              }}
            >
              {founderEmail || <span className="mp-muted">Loading your email…</span>}
            </span>
            {founderEmail && (
              <button
                type="button"
                onClick={copyEmail}
                className="mp-btn mp-btn--ghost mp-btn--sm"
                style={{ flexShrink: 0 }}
                aria-label="Copy email"
              >
                {emailCopied ? '✓ Copied' : 'Copy'}
              </button>
            )}
          </div>

          <p
            className="mp-body-sm"
            style={{
              margin: '0 0 18px',
              color: 'var(--text-strong, #152B68)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <KeyRound size={16} strokeWidth={2} style={{ color: 'var(--mp-indigo)', flexShrink: 0, marginTop: 2 }} />
            <span>
              Use the <strong>same password</strong> you created when signing up here.
            </span>
          </p>

          {/* Primary action: open the admin sign-in page in a new tab.
              ?fresh=1 tells the admin SignIn page to clear any cached token
              first (otherwise a tester logged in to a different tenant from
              an earlier session would land in THAT tenant's dashboard).
              ?email=... pre-fills the email field so the founder doesn't
              have to retype it. */}
          <a
            href={`${MERAKI_ADMIN_URL.replace(/\/+$/, '')}/signin?fresh=1${
              founderEmail ? `&email=${encodeURIComponent(founderEmail)}` : ''
            }`}
            target="_blank"
            rel="noopener noreferrer"
            className="mp-btn mp-btn--primary mp-btn--block"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 8,
              textDecoration: 'none',
            }}
          >
            Open MerakiPeople sign-in
            <ExternalLink size={16} strokeWidth={2} />
          </a>

          {/* Secondary action: direct link to forgot-password — saves the founder
              from hunting for the link on the sign-in page itself. */}
          <a
            href={`${MERAKI_ADMIN_URL.replace(/\/+$/, '')}/forgot-password`}
            target="_blank"
            rel="noopener noreferrer"
            className="mp-btn mp-btn--ghost mp-btn--sm mp-btn--block"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              textDecoration: 'none',
            }}
          >
            Forgot your password? Reset it →
          </a>
        </Card>
      </div>
    </div>
  );
}

function BigStat({ icon: Icon, value, label }: { icon: any; value: number | string; label: string }) {
  return (
    <div className="mp-complete-stat">
      <div className="mp-complete-stat__icon">
        <Icon size={16} strokeWidth={2.5} />
      </div>
      <div className="mp-complete-stat__value">{value}</div>
      <div className="mp-complete-stat__label">{label}</div>
    </div>
  );
}

function Insight({ label, body, detail }: { label: string; body: string; detail?: string }) {
  return (
    <div className="mp-complete-insight">
      <div className="mp-overline">{label}</div>
      <div className="mp-complete-insight__body">{body}</div>
      {detail && <div className="mp-meta" style={{ marginTop: 2 }}>{detail}</div>}
    </div>
  );
}

function modeOf(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}
