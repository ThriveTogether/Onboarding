import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, Users, ArrowRight, Flame } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { onboardingAPI } from '../../api/onboarding';
import Card from '../../components/Card';

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
  intel?: {
    matchRationale?: string;
    companyDescription?: string;
  };
}

interface AccountRow {
  /** Canonical company name (from leads.targetCompany). */
  name: string;
  city: string;
  industry: string;
  contactCount: number;
  topScore: number;
  topMatchPercent: number;
  hottestStage: string;
  description: string;
  contacts: Array<{ name: string; title: string }>;
}

const STAGE_ORDER = ['ready', 'hot', 'warm', 'warming', 'cold'];
const STAGE_LABEL: Record<string, string> = {
  cold: 'Cold',
  warming: 'Warming',
  warm: 'Warm',
  hot: 'Hot',
  ready: 'Ready',
};

/**
 * Account-level rollup of the leads pipeline. Each card = one company we've
 * found, summarising the top contact + how many people at that company are
 * in pipeline. Click → drill into the Leads page (filtered to that account
 * once filtering is wired; for now navigates to all leads).
 */
export default function AccountsPage() {
  const { company, loading: ctxLoading } = useOnboarding();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!company?._id) return;
    setLoading(true);
    onboardingAPI
      .listLeads(company._id)
      .then(({ data }) => setLeads(data.leads || []))
      .finally(() => setLoading(false));
  }, [company?._id]);

  // Group leads by their target company. The same company may surface
  // multiple times in pipeline (different contacts at the same place); we
  // collapse those into one Account row with a contact count.
  const accounts: AccountRow[] = useMemo(() => {
    const map = new Map<string, AccountRow>();
    for (const l of leads) {
      const key = (l.targetCompany || '').trim();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          name: key,
          city: l.city || '',
          industry: l.industry || '',
          contactCount: 1,
          topScore: l.score,
          topMatchPercent: l.matchPercent,
          hottestStage: l.stage,
          description: l.intel?.companyDescription || l.intel?.matchRationale || '',
          contacts: [{ name: l.contactName, title: l.contactTitle }],
        });
      } else {
        existing.contactCount += 1;
        existing.contacts.push({ name: l.contactName, title: l.contactTitle });
        if (l.score > existing.topScore) existing.topScore = l.score;
        if (l.matchPercent > existing.topMatchPercent) existing.topMatchPercent = l.matchPercent;
        // Keep the hottest stage (earliest in STAGE_ORDER wins).
        const currentRank = STAGE_ORDER.indexOf(existing.hottestStage);
        const newRank = STAGE_ORDER.indexOf(l.stage);
        if (newRank >= 0 && (currentRank < 0 || newRank < currentRank)) {
          existing.hottestStage = l.stage;
        }
        if (!existing.description && l.intel?.companyDescription) {
          existing.description = l.intel.companyDescription;
        }
      }
    }
    // Sort: hottest stage first, then by top score
    return Array.from(map.values()).sort((a, b) => {
      const sa = STAGE_ORDER.indexOf(a.hottestStage);
      const sb = STAGE_ORDER.indexOf(b.hottestStage);
      if (sa !== sb) return sa - sb;
      return b.topScore - a.topScore;
    });
  }, [leads]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (stageFilter !== 'all' && a.hottestStage !== stageFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !a.name.toLowerCase().includes(q) &&
          !a.industry.toLowerCase().includes(q) &&
          !a.city.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [accounts, stageFilter, search]);

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = { all: accounts.length };
    for (const s of STAGE_ORDER) c[s] = accounts.filter((a) => a.hottestStage === s).length;
    return c;
  }, [accounts]);

  if (ctxLoading || loading) return <p className="mp-muted">Loading accounts…</p>;

  if (!company) {
    return (
      <>
        <header className="mp-page-header">
          <h1 className="mp-page-header__title">Accounts</h1>
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
        <h1 className="mp-page-header__title">Accounts</h1>
        <p className="mp-page-header__subtitle">
          {accounts.length} compan{accounts.length === 1 ? 'y' : 'ies'} we've found ·{' '}
          {leads.length} contacts in pipeline · grouped by company
        </p>
      </header>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          placeholder="Search company, industry, city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mp-input"
          style={{ flex: 1, minWidth: 220, maxWidth: 360 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <FilterChip
            active={stageFilter === 'all'}
            label={`All (${stageCounts.all})`}
            onClick={() => setStageFilter('all')}
          />
          {STAGE_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={stageFilter === s}
              label={`${STAGE_LABEL[s]} (${stageCounts[s] || 0})`}
              onClick={() => setStageFilter(s)}
              hot={s === 'hot' || s === 'ready'}
            />
          ))}
        </div>
      </div>

      {filteredAccounts.length === 0 ? (
        <Card padding="lg" className="mp-text-center">
          <p className="mp-muted">No accounts match your filters.</p>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
          }}
        >
          {filteredAccounts.map((a) => (
            <AccountCard
              key={a.name}
              account={a}
              onView={() => navigate(`/app/leads?account=${encodeURIComponent(a.name)}`)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AccountCard({
  account,
  onView,
}: {
  account: AccountRow;
  onView: () => void;
}) {
  const isHot = account.hottestStage === 'hot' || account.hottestStage === 'ready';
  return (
    <Card padding="md">
      {/* Header: company + score */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, color: 'var(--fg-0)' }}
          >
            <Building2 size={14} style={{ color: 'var(--fg-2)', flexShrink: 0 }} />
            <h3 style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 600 }}>{account.name}</h3>
          </div>
          {(account.city || account.industry) && (
            <div className="mp-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={11} />
              {account.city}
              {account.city && account.industry ? ' · ' : ''}
              {account.industry}
            </div>
          )}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: isHot ? 'var(--mp-coral-100)' : 'var(--bg-brand-soft)',
            color: isHot ? 'var(--mp-coral)' : 'var(--mp-indigo)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 'var(--fs-sm)',
            flexShrink: 0,
          }}
          title="Top contact score"
        >
          {account.topScore}
        </div>
      </div>

      {account.description && (
        <p className="mp-body-sm mp-muted" style={{ margin: '8px 0 12px', lineHeight: 1.5 }}>
          {account.description}
        </p>
      )}

      {/* Chips: stage + match + contact count */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <span className={`mp-lead-card__chip ${isHot ? 'mp-lead-card__chip--coral' : ''}`}>
          {isHot && <Flame size={10} />}
          {STAGE_LABEL[account.hottestStage] || account.hottestStage}
        </span>
        <span className="mp-lead-card__chip mp-lead-card__chip--coral">
          {account.topMatchPercent}% match
        </span>
        <span className="mp-lead-card__chip">
          <Users size={10} />
          {account.contactCount} {account.contactCount === 1 ? 'contact' : 'contacts'}
        </span>
      </div>

      {/* Top contact preview */}
      {account.contacts.length > 0 && (
        <div
          style={{
            padding: '8px 10px',
            background: 'var(--bg-2)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 12,
          }}
        >
          <div className="mp-meta" style={{ marginBottom: 2 }}>
            {account.contactCount === 1 ? 'Decision-maker' : `Top ${Math.min(account.contacts.length, 2)} of ${account.contactCount}`}
          </div>
          {account.contacts.slice(0, 2).map((c, i) => (
            <div key={i} className="mp-body-sm" style={{ marginTop: i ? 4 : 0 }}>
              <strong>{c.name}</strong>
              {c.title && <span className="mp-muted"> · {c.title}</span>}
            </div>
          ))}
          {account.contactCount > 2 && (
            <div className="mp-meta" style={{ marginTop: 4 }}>
              + {account.contactCount - 2} more
            </div>
          )}
        </div>
      )}

      {/* View leads link */}
      <button
        onClick={onView}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'transparent',
          border: 0,
          color: 'var(--mp-indigo)',
          fontSize: 'var(--fs-sm)',
          fontWeight: 500,
          padding: 0,
          cursor: 'pointer',
        }}
      >
        View {account.contactCount === 1 ? 'contact' : 'contacts'}
        <ArrowRight size={14} />
      </button>
    </Card>
  );
}

function FilterChip({
  active,
  label,
  onClick,
  hot = false,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  hot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        border: '1px solid',
        borderColor: active ? (hot ? 'var(--mp-coral)' : 'var(--mp-indigo)') : 'var(--border-1)',
        background: active ? (hot ? 'var(--mp-coral-100)' : 'var(--bg-brand-soft)') : 'transparent',
        color: active ? (hot ? 'var(--mp-coral)' : 'var(--mp-indigo)') : 'var(--fg-1)',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--fs-sm)',
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
