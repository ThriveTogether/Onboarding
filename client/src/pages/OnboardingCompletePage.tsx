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
  ArrowRight,
} from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import Card from '../components/Card';

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
  const [handoffState, setHandoffState] = useState<
    | { kind: 'idle' }
    | { kind: 'minting' }
    | { kind: 'ready'; redirectUrl: string }
    | { kind: 'unavailable'; reason: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // On mount, try to mint the handoff token in parallel with the summary
  // load. If the bridge isn't configured yet (HANDOFF_DISABLED), we silently
  // fall back to the "Team Meraki will reach out" card.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setHandoffState({ kind: 'minting' });
    onboardingAPI
      .handoffToken(id)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.redirectUrl) {
          setHandoffState({ kind: 'ready', redirectUrl: res.data.redirectUrl });
        } else {
          setHandoffState({ kind: 'unavailable', reason: 'No redirect URL returned' });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const code = err?.response?.data?.code;
        if (err?.response?.status === 503 || code === 'HANDOFF_DISABLED') {
          setHandoffState({
            kind: 'unavailable',
            reason: 'SSO handoff not configured on the server',
          });
        } else {
          setHandoffState({
            kind: 'error',
            message: err?.response?.data?.error || err?.message || 'Could not mint handoff token',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const openMerakiPeople = async () => {
    if (!id) return;
    // If we already have a fresh URL, use it. Otherwise re-mint (handles the
    // case where the founder sat on this page longer than the 120s TTL).
    if (handoffState.kind === 'ready') {
      window.location.href = handoffState.redirectUrl;
      return;
    }
    setHandoffState({ kind: 'minting' });
    try {
      const res = await onboardingAPI.handoffToken(id);
      if (res.data?.redirectUrl) {
        window.location.href = res.data.redirectUrl;
      } else {
        setHandoffState({ kind: 'error', message: 'No redirect URL returned' });
      }
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (err?.response?.status === 503 || code === 'HANDOFF_DISABLED') {
        setHandoffState({
          kind: 'unavailable',
          reason: 'SSO handoff not configured on the server',
        });
      } else {
        setHandoffState({
          kind: 'error',
          message: err?.response?.data?.error || err?.message || 'Handoff failed',
        });
      }
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

        {/* Hand-off — seamless SSO into MerakiPeople admin. If the bridge is
            unconfigured (e.g. dev or staging without the secret), we fall
            back to the "Team Meraki will reach out" card instead of showing
            a broken button. */}
        {handoffState.kind === 'unavailable' ? (
          <Card padding="lg" tone="tinted" className="mp-text-center">
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--bg-brand-soft)',
                color: 'var(--mp-indigo)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <Mail size={22} strokeWidth={2} />
            </div>
            <h3 className="mp-h4" style={{ margin: '0 0 6px' }}>Team Meraki will reach out shortly</h3>
            <p className="mp-body-sm mp-muted" style={{ margin: 0 }}>
              We'll walk you through the leads, your strategy docs, and how to start your first conversations. Keep an eye on your inbox.
            </p>
          </Card>
        ) : (
          <Card padding="lg" tone="tinted" className="mp-text-center">
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--bg-brand-soft)',
                color: 'var(--mp-indigo)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <ArrowRight size={22} strokeWidth={2} />
            </div>
            <h3 className="mp-h4" style={{ margin: '0 0 6px' }}>Your MerakiPeople workspace is ready</h3>
            <p className="mp-body-sm mp-muted" style={{ margin: '0 0 16px' }}>
              Your company profile, target accounts, hunted leads, strategy docs and customised AI prompts are already loaded. Click below to log in — no password needed.
            </p>
            <button
              type="button"
              className="mp-btn mp-btn-primary"
              onClick={openMerakiPeople}
              disabled={handoffState.kind === 'minting'}
              style={{ minWidth: 220 }}
            >
              {handoffState.kind === 'minting' ? 'Preparing your workspace…' : 'Open MerakiPeople →'}
            </button>
            {handoffState.kind === 'error' && (
              <p className="mp-body-xs" style={{ marginTop: 10, color: 'var(--mp-coral)' }}>
                {handoffState.message} — Team Meraki will reach out instead.
              </p>
            )}
          </Card>
        )}
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
