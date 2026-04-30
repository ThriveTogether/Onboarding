import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { onboardingAPI } from '../../api/onboarding';
import Card from '../../components/Card';
import { Search, MessageSquare, ArrowRight, Flame, ChevronDown, ChevronUp } from 'lucide-react';

interface Lead {
  _id: string;
  contactName: string;
  contactTitle: string;
  targetCompany: string;
  city: string;
  industry: string;
  score: number;
  stage: string;
  matchPercent: number;
  scoreBreakdown: { companyFit: number; engagement: number; intent: number; recency: number };
  intel?: {
    matchRationale?: string;
    relevanceReason?: string;
    recommendedApproach?: string;
    companyDescription?: string;
  };
}

export default function LeadsPage() {
  const { company, loading: stateLoading } = useOnboarding();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [stageFilter, setStageFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [fitFilter, setFitFilter] = useState('all');

  const toggleExpanded = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    if (!company) return;
    onboardingAPI
      .listLeads(company._id)
      .then(({ data }) => setLeads(data.leads))
      .finally(() => setLoading(false));
  }, [company]);

  const counts = useMemo(() => {
    const stageCounts: Record<string, number> = { all: leads.length };
    ['cold', 'warming', 'warm', 'hot', 'ready'].forEach((s) => {
      stageCounts[s] = leads.filter((l) => l.stage === s).length;
    });
    const scoreCounts = {
      all: leads.length,
      low: leads.filter((l) => l.score < 30).length,
      medium: leads.filter((l) => l.score >= 30 && l.score < 60).length,
      high: leads.filter((l) => l.score >= 60).length,
    };
    const fitCounts = {
      all: leads.length,
      low: leads.filter((l) => l.scoreBreakdown.companyFit < 15).length,
      medium: leads.filter((l) => l.scoreBreakdown.companyFit >= 15 && l.scoreBreakdown.companyFit < 30).length,
      high: leads.filter((l) => l.scoreBreakdown.companyFit >= 30).length,
    };
    return { stageCounts, scoreCounts, fitCounts };
  }, [leads]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (stageFilter !== 'all' && l.stage !== stageFilter) return false;
      if (scoreFilter === 'low' && l.score >= 30) return false;
      if (scoreFilter === 'medium' && (l.score < 30 || l.score >= 60)) return false;
      if (scoreFilter === 'high' && l.score < 60) return false;
      if (fitFilter === 'low' && l.scoreBreakdown.companyFit >= 15) return false;
      if (fitFilter === 'medium' && (l.scoreBreakdown.companyFit < 15 || l.scoreBreakdown.companyFit >= 30)) return false;
      if (fitFilter === 'high' && l.scoreBreakdown.companyFit < 30) return false;
      return true;
    });
  }, [leads, stageFilter, scoreFilter, fitFilter]);

  if (stateLoading || loading) return <p className="mp-muted">Loading leads…</p>;

  if (!company) {
    return (
      <>
        <header className="mp-page-header">
          <h1 className="mp-page-header__title">Leads</h1>
        </header>
        <Card padding="lg" className="mp-text-center">
          <p className="mp-muted">Run onboarding to populate your pipeline.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <header className="mp-page-header">
        <h1 className="mp-page-header__title">Leads</h1>
        <p className="mp-page-header__subtitle">
          {leads.length} prospects matching {company.companyName}'s target profile · AI-suggested, verify before outreach
        </p>
      </header>

      <div className="mp-filter-bar">
        <FilterRow label="Stage" value={stageFilter} onChange={setStageFilter} options={[
          { value: 'all', label: 'All', count: counts.stageCounts.all },
          { value: 'cold', label: 'Cold', count: counts.stageCounts.cold },
          { value: 'warming', label: 'Warming', count: counts.stageCounts.warming },
          { value: 'warm', label: 'Warm', count: counts.stageCounts.warm },
          { value: 'hot', label: 'Hot', count: counts.stageCounts.hot },
          { value: 'ready', label: 'Ready', count: counts.stageCounts.ready },
        ]} />
        <FilterRow label="Score" value={scoreFilter} onChange={setScoreFilter} options={[
          { value: 'all', label: 'All', count: counts.scoreCounts.all },
          { value: 'low', label: 'Low (<30)', count: counts.scoreCounts.low },
          { value: 'medium', label: 'Medium (30–60)', count: counts.scoreCounts.medium },
          { value: 'high', label: 'High (60+)', count: counts.scoreCounts.high },
        ]} />
        <FilterRow label="Fit" value={fitFilter} onChange={setFitFilter} options={[
          { value: 'all', label: 'All', count: counts.fitCounts.all },
          { value: 'low', label: 'Low (<15)', count: counts.fitCounts.low },
          { value: 'medium', label: 'Medium (15–30)', count: counts.fitCounts.medium },
          { value: 'high', label: 'High (30+)', count: counts.fitCounts.high },
        ]} />
      </div>

      <div style={{ marginBottom: 12, fontSize: 'var(--fs-sm)', color: 'var(--fg-2)' }}>
        Showing <strong>{filtered.length}</strong> of {leads.length} leads
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {filtered.map((l) => (
          <div key={l._id} className="mp-lead-card">
            <div className="mp-flex-between" style={{ marginBottom: 8 }}>
              <div>
                <h3 className="mp-lead-card__name">{l.contactName}</h3>
                <div className="mp-body-sm mp-muted">{l.contactTitle}</div>
              </div>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: l.score >= 76 ? 'var(--mp-coral-100)' : 'var(--bg-brand-soft)',
                color: l.score >= 76 ? 'var(--mp-coral)' : 'var(--mp-indigo)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 'var(--fs-md)',
              }}>
                {l.score}
              </div>
            </div>

            <div className="mp-body-sm" style={{ color: 'var(--fg-1)', marginBottom: 4 }}>
              <strong>{l.targetCompany}</strong> · {l.city}
            </div>
            {l.intel?.companyDescription && (
              <div className="mp-meta" style={{ marginBottom: 12 }}>{l.intel.companyDescription}</div>
            )}

            <div className="mp-lead-card__chips">
              <span className="mp-lead-card__chip">{stageLabel(l.stage)}</span>
              <span className="mp-lead-card__chip">{l.industry}</span>
              <span className="mp-lead-card__chip mp-lead-card__chip--coral">{l.matchPercent}% match</span>
              {l.score >= 76 && (
                <span className="mp-lead-card__chip mp-lead-card__chip--coral">
                  <Flame size={10} /> Hot
                </span>
              )}
            </div>

            {(l.intel?.matchRationale || l.intel?.relevanceReason || l.intel?.recommendedApproach) && (
              <div style={{ marginTop: 8 }}>
                <button className="mp-why-disclosure" onClick={() => toggleExpanded(l._id)}>
                  {expanded[l._id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {expanded[l._id] ? 'Hide why' : 'Why this lead?'}
                </button>
                {expanded[l._id] && (
                  <div className="mp-why-body">
                    {l.intel?.matchRationale && (
                      <div>
                        <div className="mp-why-body__label">Why this company</div>
                        <div>{l.intel.matchRationale}</div>
                      </div>
                    )}
                    {l.intel?.relevanceReason && (
                      <div>
                        <div className="mp-why-body__label">Why them</div>
                        <div>{l.intel.relevanceReason}</div>
                      </div>
                    )}
                    {l.intel?.recommendedApproach && (
                      <div>
                        <div className="mp-why-body__label">Opening angle</div>
                        <div>{l.intel.recommendedApproach}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mp-lead-card__footer">
              <span className="mp-meta">AI-suggested</span>
              <div className="mp-lead-card__actions">
                <button className="mp-lead-action"><Search size={12} /> Research</button>
                <button className="mp-lead-action"><MessageSquare size={12} /> Nurture</button>
                <Link to={`/app/leads/${l._id}`} className="mp-lead-action">
                  View <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FilterRow({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string; count: number }>;
}) {
  return (
    <div className="mp-filter-row">
      <span className="mp-filter-row__label">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          className={`mp-filter-chip ${value === o.value ? 'mp-filter-chip--active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label} <span className="mp-filter-chip__count">({o.count})</span>
        </button>
      ))}
    </div>
  );
}

function stageLabel(s: string): string {
  switch (s) {
    case 'cold': return 'Cold';
    case 'warming': return 'Warming';
    case 'warm': return 'Warm';
    case 'hot': return 'Hot';
    case 'ready': return 'Ready';
    default: return s;
  }
}
