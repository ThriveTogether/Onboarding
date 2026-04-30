import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Rocket, Linkedin, Building2, User, Calendar, Sparkles, Check, Info, Search, X,
  Target, TrendingUp, MessageCircle, Briefcase,
} from 'lucide-react';
import { onboardingAPI } from '../../api/onboarding';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import EvidenceSection from '../../components/EvidenceSection';
import CollapsibleInsight from '../../components/CollapsibleInsight';

interface Intel {
  department: string;
  seniority: string;
  relevanceReason: string;
  matchRationale: string;
  recommendedApproach: string;
  companyDescription?: string;
  researchEvents: Array<{ timestamp: string; kind: string; message: string }>;
  lastResearchedAt: string | null;
}

interface Lead {
  _id: string;
  contactName: string;
  contactTitle: string;
  targetCompany: string;
  city: string;
  industry: string;
  matchPercent: number;
  score: number;
  stage: string;
  scoreBreakdown: { companyFit: number; engagement: number; intent: number; recency: number };
  intel: Intel;
  linkedinUrl?: string;
  createdAt: string;
}

interface Company {
  _id: string;
  companyName: string;
  targetProfile: {
    industryFocus: string;
    companySize: string;
    salesTeamSize: string;
    geography: string;
  };
}

export default function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [tab, setTab] = useState<'overview' | 'nurture'>('overview');
  const [researchPanelOpen, setResearchPanelOpen] = useState(false);
  const [researching, setResearching] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    onboardingAPI.getLead(leadId).then(({ data }) => {
      setLead(data.lead);
      setCompany(data.company);
    });
  }, [leadId]);

  const handleResearch = async () => {
    if (!leadId) return;
    setResearching(true);
    setResearchPanelOpen(true);
    try {
      const { data } = await onboardingAPI.researchLead(leadId);
      setLead(data.lead);
    } finally {
      setResearching(false);
    }
  };

  if (!lead || !company) return <p className="mp-muted">Loading lead…</p>;

  const events = lead.intel?.researchEvents || [];

  return (
    <div className="mp-lead-detail">
      <div>
        <Link to="/app/leads" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--mp-indigo)', textDecoration: 'none', fontSize: 'var(--fs-sm)', fontWeight: 500 }}>
          <ArrowLeft size={14} /> Back to Leads
        </Link>
      </div>

      <div className="mp-flex-between" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="outline" onClick={handleResearch} disabled={researching}>
            <RefreshCw size={14} className={researching ? '' : ''} /> {researching ? 'Researching…' : 'Update intel'}
          </Button>
          <Button variant="primary" onClick={handleResearch} disabled={researching}>
            <Rocket size={14} /> Research lead
          </Button>
        </div>
      </div>

      {/* TP banner */}
      <div className="mp-tp-banner">
        <div className="mp-tp-banner__icon"><Sparkles size={20} strokeWidth={2} /></div>
        <div style={{ flex: 1 }}>
          <div className="mp-tp-banner__overline">Target profile</div>
          <h2 className="mp-tp-banner__title">TP01 — {company.companyName} ICP</h2>
          <p className="mp-tp-banner__body">
            {company.targetProfile.industryFocus}. Targeting {company.targetProfile.companySize} with{' '}
            {company.targetProfile.salesTeamSize}. Geography: {company.targetProfile.geography}.
          </p>
        </div>
      </div>

      {/* Lead identity header */}
      <div className="mp-lead-detail__header">
        <div>
          <span className="mp-lead-detail__id-chip">{lead._id.slice(-12)}</span>
          <Badge tone="accent" dot="">{lead.matchPercent}% match</Badge>
        </div>
        <h1 className="mp-lead-detail__name">{lead.contactName}</h1>
        <p className="mp-lead-detail__title-line">
          {lead.contactName} | {lead.contactTitle} | {lead.intel?.department || 'Leadership'} | at {lead.targetCompany}
        </p>

        <div className="mp-lead-detail__meta-row">
          <div className="mp-lead-detail__meta-item">
            <Linkedin size={14} /> <strong>LinkedIn</strong>
            <span style={{ opacity: 0.6 }}>(verify before outreach)</span>
          </div>
          <div className="mp-lead-detail__meta-item">
            <Building2 size={14} /> <strong>{lead.targetCompany}</strong>
          </div>
          <div className="mp-lead-detail__meta-item">
            <User size={14} /> <strong>You</strong>
          </div>
          <div className="mp-lead-detail__meta-item">
            <Calendar size={14} /> {new Date(lead.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="mp-tabs">
          <button className={`mp-tab ${tab === 'overview' ? 'mp-tab--active' : ''}`} onClick={() => setTab('overview')}>
            <Info size={14} /> Overview
          </button>
          <button className={`mp-tab ${tab === 'nurture' ? 'mp-tab--active' : ''}`} onClick={() => setTab('nurture')}>
            <Sparkles size={14} /> Nurture
          </button>
        </div>

        {tab === 'overview' ? (
          <div className="mp-lead-overview">
            {/* Quick facts row — small kv pills */}
            <div className="mp-lead-facts">
              <FactPill label="Department" value={lead.intel?.department || '—'} />
              <FactPill label="Seniority" value={lead.intel?.seniority || '—'} />
              <FactPill label="Stage" value={lead.stage.charAt(0).toUpperCase() + lead.stage.slice(1)} />
              <FactPill label="Match" value={`${lead.matchPercent}%`} />
              <FactPill label="Score" value={`${lead.score}/100`} />
            </div>

            {/* AI insight cards — one per concept, with evidence */}
            <div className="mp-insight-grid">
              <ThemedInsightCard
                theme="indigo"
                icon={<Target size={16} />}
                title="Why this lead matches"
                body={lead.intel?.relevanceReason || lead.intel?.matchRationale || 'No rationale captured yet.'}
                evidence={
                  lead.intel?.matchRationale && lead.intel.matchRationale !== lead.intel?.relevanceReason
                    ? { 'Match rationale': lead.intel.matchRationale, 'Match %': `${lead.matchPercent}%` }
                    : null
                }
              />

              <ThemedInsightCard
                theme="orange"
                icon={<MessageCircle size={16} />}
                title="Recommended approach"
                body={lead.intel?.recommendedApproach || 'No approach generated yet — try Update intel.'}
              />

              <ThemedInsightCard
                theme="blue"
                icon={<Briefcase size={16} />}
                title="About the company"
                body={lead.intel?.companyDescription || `${lead.industry || 'B2B'} · ${lead.targetCompany}`}
                evidence={
                  events.find((e) => e.kind === 'hunt')
                    ? { Source: events.find((e) => e.kind === 'hunt')!.message }
                    : null
                }
              />

              <ThemedInsightCard
                theme="green"
                icon={<TrendingUp size={16} />}
                title="Score breakdown"
                body=""
              >
                <div className="mp-score-grid">
                  <ScorePart label="Company fit" value={lead.scoreBreakdown.companyFit} max={35} />
                  <ScorePart label="Engagement" value={lead.scoreBreakdown.engagement} max={35} />
                  <ScorePart label="Intent" value={lead.scoreBreakdown.intent} max={25} />
                  <ScorePart label="Recency" value={lead.scoreBreakdown.recency} max={10} />
                </div>
              </ThemedInsightCard>
            </div>

            {/* Research events — collapsible per item */}
            {events.length > 0 && (
              <div className="mp-doc-section">
                <div className="mp-doc-section__label">Research events ({events.length})</div>
                <div className="mp-stack" style={{ '--gap': '6px' } as any}>
                  {events.slice(0, 6).map((e, i) => (
                    <CollapsibleInsight
                      key={i}
                      tone={e.kind === 'match' ? 'strength' : e.kind === 'hunt' ? 'magic' : 'info'}
                      title={e.message}
                      description={
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-2)' }}>
                          {new Date(e.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {e.kind}
                        </span>
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mp-intel-section">
            <div className="mp-intel-section__header">
              <div className="mp-intel-section__icon"><Sparkles size={18} /></div>
              <div>
                <h3 className="mp-intel-section__title">Nurture plan</h3>
                <p className="mp-intel-section__subtitle">What your AI will do next for this lead</p>
              </div>
            </div>

            <NurtureRow
              stage="Cold outreach"
              status={lead.stage === 'cold' ? 'active' : 'done'}
              body={`First WhatsApp message lands within 24h. Tone from your approved brand guidelines. ${lead.intel?.recommendedApproach || ''}`}
            />
            <NurtureRow
              stage="Warming"
              status={['warming'].includes(lead.stage) ? 'active' : lead.stage === 'cold' ? 'pending' : 'done'}
              body="If the lead engages, system switches to conversational mode and tracks reply speed + question depth."
            />
            <NurtureRow
              stage="Warm → Hot"
              status={['warm', 'hot'].includes(lead.stage) ? 'active' : 'pending'}
              body="When score crosses 76 with meaningful replies + pricing/timeline signal, handoff to you with auto-generated Call Prep."
            />
            <NurtureRow
              stage="Rep-ready"
              status={lead.stage === 'ready' ? 'active' : 'pending'}
              body="Lead appears in your Morning Playbook under 'Needs you'. Call Prep brief ready."
            />
          </div>
        )}
      </div>

      {/* Floating research events panel */}
      {researchPanelOpen && (
        <div className="mp-research-panel">
          <div className="mp-research-panel__header">
            <div className="mp-research-panel__title">
              <Search size={14} /> Lead research
              <span className="mp-research-panel__count">{events.length} events</span>
            </div>
            <button className="mp-research-panel__close" onClick={() => setResearchPanelOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="mp-research-panel__body">
            {events.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'var(--fs-xs)' }}>No events yet.</p>
            ) : (
              events.map((e, i) => <EventRow key={i} event={e} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FactPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="mp-fact-pill">
      <span className="mp-fact-pill__label">{label}</span>
      <span className="mp-fact-pill__value">{value}</span>
    </div>
  );
}

function ThemedInsightCard({
  theme,
  icon,
  title,
  body,
  evidence,
  children,
}: {
  theme: 'indigo' | 'orange' | 'blue' | 'green' | 'purple' | 'pink';
  icon: React.ReactNode;
  title: string;
  body: string;
  evidence?: Record<string, any> | string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className={`mp-themed-card mp-theme-${theme}`}>
      <h4 className="mp-themed-card__title">
        {icon} {title}
      </h4>
      {body && <p className="mp-body-sm" style={{ margin: 0, lineHeight: 'var(--lh-relaxed)' }}>{body}</p>}
      {children}
      {evidence && <EvidenceSection evidence={evidence} compact label="Show source" />}
    </div>
  );
}

function ScorePart({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div className="mp-score-part">
      <div className="mp-score-part__top">
        <span className="mp-score-part__label">{label}</span>
        <strong className="mp-score-part__value">+{value}<span className="mp-score-part__max"> / {max}</span></strong>
      </div>
      <div className="mp-score-part__track">
        <div className="mp-score-part__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NurtureRow({ stage, status, body }: { stage: string; status: 'done' | 'active' | 'pending'; body: string }) {
  const icon =
    status === 'done' ? <Check size={14} color="var(--mp-success)" /> :
    status === 'active' ? <Sparkles size={14} color="var(--mp-coral)" /> :
    <Info size={14} color="var(--fg-3)" />;
  return (
    <div style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border-1)' }}>
      <div style={{ width: 28, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 2 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: 'var(--fg-1)', fontSize: 'var(--fs-sm)' }}>
          {stage}
          {status === 'active' && <Badge tone="accent" dot="" style={{ marginLeft: 8 }}>In progress</Badge>}
          {status === 'done' && <Badge tone="success" dot="" style={{ marginLeft: 8 }}>Done</Badge>}
        </div>
        <p className="mp-body-sm mp-muted" style={{ margin: '4px 0 0' }}>{body}</p>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: { timestamp: string; kind: string; message: string } }) {
  const iconClass =
    event.kind === 'research_done' || event.kind === 'match' ? 'mp-research-event__icon--success' :
    event.kind === 'research_start' || event.kind === 'hunt' ? 'mp-research-event__icon--info' : '';
  const Icon = event.kind === 'research_done' || event.kind === 'match' ? Check : Search;
  const time = new Date(event.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="mp-research-event">
      <div className={`mp-research-event__icon ${iconClass}`}><Icon size={12} /></div>
      <div className="mp-research-event__body">
        <div className="mp-research-event__msg">{event.message}</div>
        <div className="mp-research-event__time">{time}</div>
      </div>
    </div>
  );
}
