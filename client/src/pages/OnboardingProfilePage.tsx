import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Pencil, Info, FileUp } from 'lucide-react';
import { onboardingAPI, TargetProfile } from '../api/onboarding';
import { useOnboarding } from '../contexts/OnboardingContext';
import PhaseProgress from '../components/PhaseProgress';
import Button from '../components/Button';
import Card from '../components/Card';
import ThinkingPanel, { ReasoningSession } from '../components/ThinkingPanel';
import WizardBackLink from '../components/WizardBackLink';
import TargetProfileEditor from '../components/TargetProfileEditor';
import CustomICPModal from '../components/CustomICPModal';

export default function OnboardingProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refresh } = useOnboarding();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<TargetProfile[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set([0]));
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [customError, setCustomError] = useState('');

  useEffect(() => {
    if (!id) return;
    onboardingAPI
      .predictProfile(id)
      .then(({ data }) => {
        if (Array.isArray(data.prediction?.candidates) && data.prediction.candidates.length > 0) {
          setCandidates(data.prediction.candidates);
          const preselected = new Set<number>();
          data.prediction.candidates.forEach((c: TargetProfile, i: number) => {
            if (c.isSelected) preselected.add(i);
          });
          setSelected(preselected.size > 0 ? preselected : new Set([0]));
        } else if (data.sessionId) {
          setSessionId(data.sessionId);
        } else if (data.prediction?.geography) {
          setCandidates([data.prediction]);
          setSelected(new Set([0]));
        }
      })
      .catch((e) => setError(e.response?.data?.error || 'Prediction failed'));
  }, [id]);

  const handleSessionDone = (session: ReasoningSession) => {
    const result = session.result?.candidates as TargetProfile[] | undefined;
    if (Array.isArray(result) && result.length > 0) {
      setCandidates(result);
      const preselected = new Set<number>();
      result.forEach((c, i) => { if (c.isSelected) preselected.add(i); });
      setSelected(preselected.size > 0 ? preselected : new Set([0]));
    }
  };

  const toggleSelect = (idx: number) => {
    if (editingIdx !== null) return;
    const next = new Set(selected);
    if (next.has(idx)) {
      if (next.size === 1) return;
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelected(next);
  };

  const handleLock = async () => {
    if (!id || !candidates) return;
    setSubmitting(true);
    setError('');
    try {
      const indices = Array.from(selected).sort((a, b) => a - b);
      await onboardingAPI.lockTargetProfiles(id, indices);
      await refresh();
      navigate(`/onboarding/leads/${id}`);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to lock profile');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCustomSubmit = async (text: string) => {
    if (!id) return;
    setCustomSubmitting(true);
    setCustomError('');
    try {
      const { data } = await onboardingAPI.addCustomICP(id, text);
      const next = data.company?.targetProfileCandidates;
      if (Array.isArray(next) && next.length > 0) {
        setCandidates(next);
        // Auto-select the new variant the founder just added
        if (typeof data.addedIndex === 'number') {
          setSelected(new Set([data.addedIndex]));
        }
      }
      setCustomOpen(false);
    } catch (e: any) {
      setCustomError(e.response?.data?.error || 'Could not parse your ICP. Try simplifying the text.');
    } finally {
      setCustomSubmitting(false);
    }
  };

  const handleSaveEdit = async (idx: number, patch: Partial<TargetProfile>) => {
    if (!id || !candidates) return;
    setEditSaving(true);
    setEditError('');
    try {
      const { data } = await onboardingAPI.editTargetProfileCandidate(id, idx, patch, false);
      const nextCandidates =
        data.company?.targetProfileCandidates?.length
          ? (data.company.targetProfileCandidates as TargetProfile[])
          : candidates.map((c, i) => (i === idx ? { ...c, ...patch } : c));
      setCandidates(nextCandidates);
      setEditingIdx(null);
    } catch (e: any) {
      setEditError(e.response?.data?.error || 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  if (!candidates) {
    return (
      <div className="mp-app-shell">
        <div className="mp-wizard mp-wizard--wide">
          <WizardBackLink to="/onboarding" label="Back to company basics" />
          <PhaseProgress phase="phase_a" step="a2" />

          <div className="mp-text-center" style={{ marginBottom: 24 }}>
            <h2 className="mp-h2" style={{ margin: 0 }}>Figuring out who you should sell to</h2>
            <p className="mp-body-sm mp-muted" style={{ marginTop: 6 }}>
              Reading your website, LinkedIn, and the news. Sketching three customer profiles you can choose from.
            </p>
          </div>

          {sessionId ? (
            <ThinkingPanel
              sessionId={sessionId}
              title="Working out your ideal customer"
              subtitle="Reading your story, then drafting three options"
              onDone={handleSessionDone}
              onError={() => setError('We hit a snag drafting your profiles. Try again.')}
            />
          ) : error ? (
            <Card padding="lg" className="mp-text-center"><p className="mp-help mp-help--error">{error}</p></Card>
          ) : (
            <Card padding="lg" className="mp-text-center"><p className="mp-muted">Warming up the research engine…</p></Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard mp-wizard--wide" style={{ maxWidth: 1200 }}>
        <WizardBackLink to="/onboarding" label="Back to company basics" />
        <PhaseProgress phase="phase_a" step="a2" />

        <div className="mp-text-center" style={{ marginBottom: 12 }}>
          <h2 className="mp-h2" style={{ margin: 0 }}>Pick the ICPs you want to pursue</h2>
          <p className="mp-body-sm mp-muted" style={{ marginTop: 6 }}>
            Three variants, based on your company and research. Select one or more — we'll hunt leads across all of them.
            Want to tweak a variant? Click <strong>Edit variant</strong>. Have your own ICP already? Click <strong>Use my own ICP</strong>.
          </p>
        </div>

        {/* Plain-English explainer — many founders don't know the acronym */}
        <div className="mp-icp-explainer" style={{ marginBottom: 16 }}>
          <Info size={16} className="mp-icp-explainer__icon" />
          <div>
            <strong>What's an ICP?</strong> Short for <em>Ideal Customer Profile</em> — the exact kind
            of company you want to sell to. A good ICP narrows your hunt: instead of every B2B company
            in India, you focus on the slice where your product wins fastest (right industry, right
            size, right pain). Each card below is one such slice.
          </div>
        </div>

        {/* Top-right action: bring your own ICP */}
        <div className="mp-row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button variant="outline" size="sm" onClick={() => { setCustomOpen(true); setCustomError(''); }}>
            <FileUp size={14} /> Use my own ICP
          </Button>
        </div>

        <div className="mp-tp-candidate-grid">
          {candidates.map((c, i) => (
            <TPCandidate
              key={i}
              candidate={c}
              index={i}
              selected={selected.has(i)}
              editing={editingIdx === i}
              disabledByOtherEdit={editingIdx !== null && editingIdx !== i}
              onToggle={() => toggleSelect(i)}
              onStartEdit={() => { setEditingIdx(i); setEditError(''); }}
              onCancelEdit={() => { setEditingIdx(null); setEditError(''); }}
              onSaveEdit={(patch) => handleSaveEdit(i, patch)}
              editSaving={editSaving}
              editError={editingIdx === i ? editError : ''}
            />
          ))}
        </div>

        {error && <p className="mp-help mp-help--error" style={{ marginBottom: 12 }}>{error}</p>}

        <div className="mp-row" style={{ gap: 12 }}>
          <Button
            block
            size="lg"
            onClick={handleLock}
            disabled={submitting || selected.size === 0 || editingIdx !== null}
          >
            {submitting
              ? 'Locking profiles…'
              : editingIdx !== null
              ? 'Finish editing to continue'
              : selected.size === 1
              ? 'Lock this profile — start hunting'
              : `Lock ${selected.size} profiles — hunt across all`}
          </Button>
        </div>

        <p className="mp-meta" style={{ marginTop: 12, textAlign: 'center' }}>
          Unselected variants are saved as drafts. You can activate them later from your Target Profile gallery.
        </p>
      </div>

      <CustomICPModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        onSubmit={handleCustomSubmit}
        submitting={customSubmitting}
        error={customError}
      />
    </div>
  );
}

function TPCandidate({
  candidate,
  index,
  selected,
  editing,
  disabledByOtherEdit,
  onToggle,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  editSaving,
  editError,
}: {
  candidate: TargetProfile;
  index: number;
  selected: boolean;
  editing: boolean;
  disabledByOtherEdit: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (patch: Partial<TargetProfile>) => Promise<void> | void;
  editSaving: boolean;
  editError: string;
}) {
  const baseClasses = [
    'mp-tp-candidate',
    selected && !editing ? 'mp-tp-candidate--selected' : '',
    editing ? 'mp-tp-candidate--editing' : '',
  ].filter(Boolean).join(' ');

  if (editing) {
    return (
      <div className={baseClasses} style={{ gridColumn: '1 / -1' }}>
        <div className="mp-tp-candidate__header">
          <div>
            <div className="mp-tp-candidate__label">
              {candidate.variantLabel || `Variant ${String.fromCharCode(65 + index)}`} · Editing
            </div>
            <h3 className="mp-tp-candidate__thesis">Tweak the fields below, then save.</h3>
          </div>
        </div>
        <TargetProfileEditor
          initial={candidate}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
          submitting={editSaving}
          error={editError}
          saveLabel="Save changes"
          compact
        />
      </div>
    );
  }

  return (
    <div
      className={baseClasses}
      onClick={disabledByOtherEdit ? undefined : onToggle}
      role="checkbox"
      aria-checked={selected}
      tabIndex={disabledByOtherEdit ? -1 : 0}
      onKeyDown={(e) => {
        if (disabledByOtherEdit) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
      }}
      style={disabledByOtherEdit ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
    >
      <div className="mp-tp-candidate__header">
        <div>
          <div className="mp-tp-candidate__label">
            {candidate.variantLabel || `Variant ${String.fromCharCode(65 + index)}`}
          </div>
          <h3 className="mp-tp-candidate__thesis">{candidate.variantThesis || 'Draft ICP variant'}</h3>
        </div>
        <div className="mp-tp-candidate__check">
          {selected && <Check size={14} strokeWidth={3} />}
        </div>
      </div>

      <div className="mp-tp-candidate__fields">
        <div className="mp-tp-candidate__field">
          <div className="mp-tp-candidate__field-label">Industry focus</div>
          <div className="mp-tp-candidate__field-value">{candidate.industryFocus}</div>
        </div>
        <div className="mp-tp-candidate__field">
          <div className="mp-tp-candidate__field-label">Size + geography</div>
          <div className="mp-tp-candidate__field-value">
            {candidate.companySize} · {candidate.geography}
          </div>
        </div>
        <div className="mp-tp-candidate__field">
          <div className="mp-tp-candidate__field-label">Decision makers</div>
          <div className="mp-tp-candidate__chips">
            {candidate.decisionMakers.slice(0, 4).map((d, i) => (
              <span key={i} className="mp-tp-candidate__chip">{d}</span>
            ))}
          </div>
        </div>
        <div className="mp-tp-candidate__field">
          <div className="mp-tp-candidate__field-label">Top pain signals</div>
          <ul className="mp-tp-candidate__pain-list">
            {candidate.painSignals.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      </div>

      <button
        type="button"
        className="mp-tp-candidate__edit-btn"
        onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
        aria-label="Edit this variant"
      >
        <Pencil size={12} /> Edit variant
      </button>
    </div>
  );
}
