import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, LayoutGrid, Table as TableIcon, Target as TargetIcon, Calendar, Pencil } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { onboardingAPI, TargetProfile } from '../../api/onboarding';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import TargetProfileEditor from '../../components/TargetProfileEditor';

interface ProfileRow {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  description: string;
  accountCount: number;
  createdAt: string;
  approved: boolean;
  isPrimary: boolean;
  candidate: TargetProfile;
  editable: boolean;
}

export default function TargetProfilePage() {
  const { company, leadCount, loading, refresh } = useOnboarding();
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [favourite, setFavourite] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [editError, setEditError] = useState('');
  const [toast, setToast] = useState('');

  if (loading) return <p className="mp-muted">Loading…</p>;

  if (!company) {
    return (
      <>
        <header className="mp-page-header">
          <h1 className="mp-page-header__title">Target Profile</h1>
          <p className="mp-page-header__subtitle">Manage and explore your ideal customer profiles</p>
        </header>
        <Card padding="lg" className="mp-text-center">
          <p className="mp-body-sm mp-muted">No target profile yet. Run onboarding to create one.</p>
          <Link to="/onboarding"><Button style={{ marginTop: 16 }}>Start onboarding</Button></Link>
        </Card>
      </>
    );
  }

  const candidates: TargetProfile[] =
    company.targetProfileCandidates && company.targetProfileCandidates.length > 0
      ? company.targetProfileCandidates
      : [company.targetProfile];

  const primaryLabel = company.targetProfile?.variantLabel;

  const profiles: ProfileRow[] = candidates.map((c, i) => {
    const isPrimary = !!primaryLabel && c.variantLabel === primaryLabel;
    return {
      id: `tp${String(i + 1).padStart(2, '0')}`,
      index: i,
      title: c.variantLabel || `Variant ${String.fromCharCode(65 + i)}`,
      subtitle: c.variantThesis || c.industryFocus,
      description: `${c.industryFocus}. Target size ${c.companySize}. Geography: ${c.geography}.`,
      accountCount: isPrimary ? leadCount : 0,
      createdAt: company.phaseACompletedAt || new Date().toISOString(),
      approved: isPrimary || !!c.isSelected,
      isPrimary,
      candidate: c,
      editable: true,
    };
  });

  const handleSave = async (row: ProfileRow, patch: Partial<TargetProfile>) => {
    setSavingIndex(row.index);
    setEditError('');
    try {
      const rescore = row.isPrimary && leadCount > 0;
      const { data } = await onboardingAPI.editTargetProfileCandidate(
        company._id,
        row.index,
        patch,
        rescore
      );
      const changes = Number(data?.stageChanges || 0);
      await refresh();
      setEditingIndex(null);
      if (rescore && changes > 0) {
        setToast(`Saved. ${changes} lead${changes === 1 ? ' was' : 's were'} re-scored against the new profile.`);
      } else {
        setToast('Saved.');
      }
      setTimeout(() => setToast(''), 4000);
    } catch (e: any) {
      setEditError(e.response?.data?.error || 'Failed to save changes');
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <>
      <header className="mp-page-header">
        <div className="mp-flex-between">
          <div>
            <h1 className="mp-page-header__title">Target Profile</h1>
            <p className="mp-page-header__subtitle">Manage and explore your ideal customer profiles</p>
          </div>
          <div style={{ display: 'flex', gap: 2, padding: 4, background: 'var(--bg-2)', borderRadius: 'var(--radius-md)' }}>
            <button
              className={`mp-btn ${view === 'cards' ? 'mp-btn--primary' : 'mp-btn--ghost'} mp-btn--sm`}
              onClick={() => setView('cards')}
            >
              <LayoutGrid size={14} /> Cards
            </button>
            <button
              className={`mp-btn ${view === 'table' ? 'mp-btn--primary' : 'mp-btn--ghost'} mp-btn--sm`}
              onClick={() => setView('table')}
            >
              <TableIcon size={14} /> Table
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div className="mp-toast mp-toast--success" style={{ marginBottom: 16 }}>
          {toast}
        </div>
      )}

      {view === 'cards' ? (
        <div className="mp-tp-grid">
          {profiles.map((p) => (
            <TPCard
              key={p.id}
              p={p}
              editing={editingIndex === p.index}
              saving={savingIndex === p.index}
              editError={editingIndex === p.index ? editError : ''}
              onStartEdit={() => { setEditingIndex(p.index); setEditError(''); }}
              onCancelEdit={() => { setEditingIndex(null); setEditError(''); }}
              onSave={(patch) => handleSave(p, patch)}
              onToggleFav={() => setFavourite((v) => !v)}
              favourite={p.isPrimary ? favourite : false}
            />
          ))}
        </div>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-2)' }}>
                <th style={thStyle}>Profile</th>
                <th style={thStyle}>Accounts</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border-1)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 'var(--fs-sm)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--mp-indigo)' }}>{p.title}</div>
                    <div className="mp-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 2 }}>
                      {p.description.slice(0, 80)}…
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 'var(--fs-sm)' }}>{p.accountCount}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {p.isPrimary ? <Badge tone="success" dot="">Primary</Badge>
                      : p.approved ? <Badge tone="info" dot="">Active</Badge>
                      : <Badge tone="neutral">Draft</Badge>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 'var(--fs-sm)', color: 'var(--fg-2)' }}>
                    {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 'var(--fs-xs)',
  color: 'var(--fg-2)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-caps)' as any,
};

function TPCard({
  p,
  editing,
  saving,
  editError,
  favourite,
  onStartEdit,
  onCancelEdit,
  onSave,
  onToggleFav,
}: {
  p: ProfileRow;
  editing: boolean;
  saving: boolean;
  editError: string;
  favourite: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<TargetProfile>) => Promise<void>;
  onToggleFav: () => void;
}) {
  if (editing) {
    return (
      <div className="mp-tp-card mp-tp-card--editing" style={{ gridColumn: '1 / -1' }}>
        <div className="mp-tp-card__header">
          <h3 className="mp-tp-card__title">
            {p.title} · <span style={{ color: 'var(--mp-coral)' }}>Editing</span>
          </h3>
        </div>
        {p.isPrimary && p.accountCount > 0 && (
          <p className="mp-help" style={{ marginBottom: 12 }}>
            This is your primary profile. Saving changes will re-score the {p.accountCount} leads already hunted against the new ICP.
          </p>
        )}
        <TargetProfileEditor
          initial={p.candidate}
          onSave={onSave}
          onCancel={onCancelEdit}
          submitting={saving}
          error={editError}
          saveLabel={p.isPrimary && p.accountCount > 0 ? 'Save + re-score leads' : 'Save changes'}
          compact
        />
      </div>
    );
  }

  return (
    <div className="mp-tp-card">
      <div className="mp-tp-card__header">
        <h3 className="mp-tp-card__title">{p.title}</h3>
        <button
          className={`mp-tp-card__star ${favourite ? '' : 'mp-tp-card__star--empty'}`}
          onClick={onToggleFav}
          aria-label="Toggle favourite"
        >
          <Star size={18} fill={favourite ? 'var(--mp-coral)' : 'none'} strokeWidth={1.8} />
        </button>
      </div>
      {p.subtitle && (
        <p className="mp-tp-card__description" style={{ fontStyle: 'italic', color: 'var(--fg-2)' }}>
          {p.subtitle}
        </p>
      )}
      <p className="mp-tp-card__description">{p.description}</p>
      <div className="mp-tp-card__count">
        <TargetIcon size={12} /> {p.accountCount} accounts
      </div>
      <div className="mp-tp-card__footer">
        <div className="mp-flex-between">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={12} />{' '}
            {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <span>
            {p.isPrimary ? <Badge tone="success" dot="">Primary</Badge>
              : p.approved ? <Badge tone="info" dot="">Active</Badge>
              : <Badge tone="neutral">Draft</Badge>}
          </span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button variant="outline" size="sm" onClick={onStartEdit} block>
            <Pencil size={12} /> Edit profile
          </Button>
          {p.isPrimary && (
            <Link to="/app/leads">
              <button className="mp-btn mp-btn--ghost mp-btn--sm">View leads →</button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
