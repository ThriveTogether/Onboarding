import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { onboardingAPI } from '../api/onboarding';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';

interface PlaybookData {
  rep: { email: string; name: string; cvUploaded: boolean };
  company: { companyName: string; vertical: string };
  needsYou: Array<{
    _id: string;
    contactName: string;
    targetCompany: string;
    score: number;
    stage: string;
    industry: string;
    city: string;
    matchPercent: number;
  }>;
  systemHandles: { cold: number; warming: number; warm: number };
  yesterday: { calls: number; avgScore: number; leadsMoved: { coldToWarm: number; warmToHot: number } };
}

export default function RepMorningPlaybookPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PlaybookData | null>(null);
  const [error, setError] = useState('');
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  useEffect(() => {
    if (!token) return;
    onboardingAPI
      .repPlaybook(token)
      .then(({ data }) => setData(data))
      .catch((e) => setError(e.response?.data?.error || 'Failed to load playbook'));
  }, [token]);

  if (error) {
    return (
      <div className="mp-center">
        <Card padding="lg" style={{ maxWidth: 420 }}><p className="mp-muted">{error}</p></Card>
      </div>
    );
  }

  if (!data) {
    return <div className="mp-center"><p className="mp-muted">Loading your Morning Playbook…</p></div>;
  }

  const totalSystem = data.systemHandles.cold + data.systemHandles.warming + data.systemHandles.warm;

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard mp-wizard--wide" style={{ maxWidth: 960, padding: 'var(--space-8) var(--space-5)' }}>
        <header style={{ marginBottom: 24 }}>
          <div className="mp-brand-header__overline">Morning Playbook · {today}</div>
          <h1 className="mp-h3" style={{ marginTop: 4, marginBottom: 2 }}>
            {data.rep.name || data.rep.email}
          </h1>
          <p className="mp-body-sm mp-muted" style={{ margin: 0 }}>{data.company.companyName}</p>
        </header>

        {/* Today's focus */}
        <Card style={{ marginBottom: 16 }}>
          <div className="mp-overline" style={{ marginBottom: 8 }}>Today's focus</div>
          <div className="mp-flex-between">
            <div>
              <div style={{ fontWeight: 500 }}>Skill spotlight: Discovery questions</div>
              <div className="mp-meta" style={{ marginTop: 2 }}>
                {data.rep.cvUploaded ? 'Tailored to your background.' : 'Upload your CV to personalise.'}
              </div>
            </div>
            <Button variant="outline" size="sm">Voice sim (coming soon)</Button>
          </div>
        </Card>

        {/* Needs you */}
        <Card style={{ marginBottom: 16 }}>
          <div className="mp-flex-between" style={{ marginBottom: 16 }}>
            <h4 className="mp-h4" style={{ margin: 0 }}>
              Needs you <Badge tone="accent">{data.needsYou.length}</Badge>
            </h4>
            <span className="mp-meta">sorted by score</span>
          </div>

          {data.needsYou.length === 0 ? (
            <p className="mp-body-sm mp-muted mp-text-center" style={{ padding: '16px 0' }}>
              Your AI is warming up leads — check back tomorrow.
            </p>
          ) : (
            <>
            <div className="mp-body-sm" style={{
              background: 'var(--bg-brand-soft)',
              color: 'var(--mp-indigo)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 12,
            }}>
              <strong>AI-suggested — verify before outreach.</strong>{' '}
              <span className="mp-muted">Companies are real; contact names need enrichment.</span>
            </div>
            <div className="mp-stack" style={{ '--gap': 'var(--space-2)' } as any}>
              {data.needsYou.map((l) => (
                <div key={l._id} style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: 12,
                  borderRadius: 'var(--radius-md)', border: '1px solid transparent',
                  transition: 'background-color 200ms, border-color 200ms',
                }}>
                  <div className="mp-score-pill">{l.score}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>
                      {l.contactName}
                      <span className="mp-muted" style={{ fontWeight: 400 }}> · {l.targetCompany}</span>
                    </div>
                    <div className="mp-meta">
                      {l.stage.toUpperCase()} · {l.industry} · {l.city}
                    </div>
                  </div>
                  <Button size="sm">Call prep →</Button>
                </div>
              ))}
            </div>
            </>
          )}
        </Card>

        {/* System handles */}
        <Card style={{ marginBottom: 16 }}>
          <div className="mp-flex-between" style={{ marginBottom: 16 }}>
            <h4 className="mp-h4" style={{ margin: 0 }}>
              System handles <span className="mp-muted">({totalSystem})</span>
            </h4>
            <span className="mp-meta">Last auto-action: just now</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <MetricTile label="in cold outreach" value={data.systemHandles.cold} />
            <MetricTile label="in warming" value={data.systemHandles.warming} tone="warning" />
            <MetricTile label="in warm nurture" value={data.systemHandles.warm} tone="success" />
          </div>
        </Card>

        {/* Yesterday */}
        <Card>
          <h4 className="mp-h4" style={{ margin: '0 0 12px' }}>Yesterday</h4>
          <p className="mp-body-sm mp-muted" style={{ margin: 0 }}>
            Calls: {data.yesterday.calls} · Avg score: {data.yesterday.avgScore}/100 · Leads moved:{' '}
            {data.yesterday.leadsMoved.coldToWarm} cold → warm, {data.yesterday.leadsMoved.warmToHot} warm → hot
          </p>
        </Card>
      </div>
    </div>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' }) {
  const valueClass = `mp-metric-tile__value${tone === 'success' ? ' mp-metric-tile__value--success' : tone === 'warning' ? ' mp-metric-tile__value--warning' : ''}`;
  return (
    <div className="mp-metric-tile">
      <div className={valueClass}>{value}</div>
      <div className="mp-metric-tile__label">{label}</div>
    </div>
  );
}
