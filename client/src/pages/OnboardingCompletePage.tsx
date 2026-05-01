import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import Card from '../components/Card';

interface SessionSummary {
  successMetric: string;
  // The four stats we surface — "what you built during onboarding".
  // Each one reflects a distinct axis of work so no two cards collide.
  leadCount: number;          // pipeline depth   (output)
  docsApproved: number;       // strategy ready   (decisions)
  docsTotal: number;
  messageTemplates: number;   // voice authored   (channel × stage)
  painSignals: number;        // customer insight (ICP articulation)
}

export default function OnboardingCompletePage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  useEffect(() => {
    if (!id) return;
    onboardingAPI.state(id).then(({ data }) => {
      const company: any = data.company || {};
      const docs: any[] = (data as any).docs || [];
      // Reviewable docs only (4 — nurture, scoring, brand, knowledge). The
      // target_profile is an auto-approved separate doc and shouldn't count
      // against this stat (otherwise the founder sees "5/4 ready").
      const reviewableKinds = new Set([
        'nurture_strategy',
        'scoring_framework',
        'brand_guidelines',
        'knowledge_base',
      ]);
      const approvedStatuses = new Set(['approved', 'auto_approved']);
      const docsApproved = docs.filter(
        (d) => reviewableKinds.has(d.kind) && approvedStatuses.has(d.status),
      ).length;

      // Pain signals the founder articulated in their target profile — the
      // customer-problem axis, distinct from leads (output), docs (strategy),
      // and message templates (channels).
      const painSignals = Array.isArray(company.targetProfile?.painSignals)
        ? company.targetProfile.painSignals.filter((p: string) => p && p.trim()).length
        : 0;

      setSummary({
        successMetric: company.successMetric || '',
        leadCount: data.leadCount || 0,
        docsApproved,
        docsTotal: 4,
        messageTemplates: Array.isArray(company.messageTemplates)
          ? company.messageTemplates.filter((t: any) => t?.body).length
          : 0,
        painSignals,
      });
    });
  }, [id]);

  return (
    <div className="mp-app-shell mp-center">
      <div style={{ width: '100%', maxWidth: 560 }}>
        <Card padding="lg" className="mp-text-center">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--mp-coral-100)',
              color: 'var(--mp-coral)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Check size={32} strokeWidth={2.5} />
          </div>

          <h2 className="mp-h2" style={{ margin: 0 }}>Your sales engine is live.</h2>
          <p className="mp-body-sm mp-muted" style={{ marginTop: 6, marginBottom: 32 }}>
            AI nurturing begins now.
          </p>

          {summary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                marginBottom: 24,
              }}
            >
              <Stat value={summary.leadCount} label="leads in your pipeline" />
              <Stat
                value={`${summary.docsApproved}/${summary.docsTotal}`}
                label="strategy docs ready"
              />
              <Stat value={summary.messageTemplates} label="message templates drafted" />
              <Stat value={summary.painSignals} label="customer pain signals captured" />
            </div>
          )}

          {summary?.successMetric && (
            <div style={{ padding: 16, background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', marginBottom: 16, textAlign: 'left' }}>
              <div className="mp-overline" style={{ marginBottom: 4 }}>Your 90-day north star</div>
              <div>{summary.successMetric}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link to="/app/target-profile">
              <button className="mp-btn mp-btn--primary mp-btn--lg">Open MerakiPeople →</button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', padding: 16 }}>
      <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 700, color: 'var(--mp-coral)', letterSpacing: 'var(--tracking-tight)', lineHeight: 1 }}>
        {value}
      </div>
      <div className="mp-meta" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}
