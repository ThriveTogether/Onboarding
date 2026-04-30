import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { TargetProfile } from '../api/onboarding';
import Button from './Button';
import Field from './Field';

interface Props {
  initial: TargetProfile;
  onSave: (patch: Partial<TargetProfile>) => Promise<void> | void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string;
  saveLabel?: string;
  compact?: boolean;
}

/**
 * Structured editor for a single target-profile candidate. Used inline on the
 * A2 candidate cards (before lock) and on the TP gallery (after lock).
 * Keeps state local — parent decides how to persist via `onSave`.
 */
export default function TargetProfileEditor({
  initial,
  onSave,
  onCancel,
  submitting = false,
  error,
  saveLabel = 'Save changes',
  compact = false,
}: Props) {
  const [thesis, setThesis] = useState(initial.variantThesis || '');
  const [industry, setIndustry] = useState(initial.industryFocus || '');
  const [size, setSize] = useState(initial.companySize || '');
  const [geography, setGeography] = useState(initial.geography || '');
  const [decisionMakers, setDM] = useState<string[]>([...(initial.decisionMakers || [])]);
  const [painSignals, setPS] = useState<string[]>([...(initial.painSignals || [])]);
  const [notes, setNotes] = useState(initial.confidenceNotes || '');

  const patch = (): Partial<TargetProfile> => ({
    variantThesis: thesis.trim(),
    industryFocus: industry.trim(),
    companySize: size.trim(),
    geography: geography.trim(),
    decisionMakers: decisionMakers.map((s) => s.trim()).filter(Boolean),
    painSignals: painSignals.map((s) => s.trim()).filter(Boolean),
    confidenceNotes: notes.trim(),
  });

  const handleSave = () => {
    return onSave(patch());
  };

  return (
    <div className={`mp-tp-editor ${compact ? 'mp-tp-editor--compact' : ''}`}>
      <Field label="Thesis (one line — who are we selling to?)">
        <textarea
          className="mp-textarea"
          rows={2}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="e.g. Early-stage manufacturers in Tier-2 cities…"
        />
      </Field>

      <div className="mp-row" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Industry focus">
            <input
              className="mp-input"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Steel fabrication, Auto components"
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Company size">
            <input
              className="mp-input"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="e.g. 50-500 employees"
            />
          </Field>
        </div>
      </div>

      <Field label="Geography">
        <input
          className="mp-input"
          value={geography}
          onChange={(e) => setGeography(e.target.value)}
          placeholder="e.g. India, Tier-1 + Tier-2 cities"
        />
      </Field>

      <TokenEditor
        label="Decision makers"
        helper="Titles that typically sign off on the purchase"
        values={decisionMakers}
        onChange={setDM}
        placeholder="e.g. VP Engineering"
      />

      <TokenEditor
        label="Pain signals"
        helper="Observable signs that this company is likely to buy now"
        values={painSignals}
        onChange={setPS}
        placeholder="e.g. Just raised Series A"
      />

      <Field label="Notes (optional)">
        <textarea
          className="mp-textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything you'd like the AI to keep in mind when hunting leads for this profile"
        />
      </Field>

      {error && <p className="mp-help mp-help--error">{error}</p>}

      <div className="mp-row" style={{ gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={submitting}>
          {submitting ? 'Saving…' : saveLabel}
        </Button>
      </div>
    </div>
  );
}

function TokenEditor({
  label,
  helper,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  helper?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) { setDraft(''); return; }
    onChange([...values, v]);
    setDraft('');
  };

  const remove = (i: number) => {
    const next = [...values];
    next.splice(i, 1);
    onChange(next);
  };

  const update = (i: number, val: string) => {
    const next = [...values];
    next[i] = val;
    onChange(next);
  };

  return (
    <Field label={label} helper={helper}>
      <div className="mp-tokens">
        {values.map((v, i) => (
          <div key={i} className="mp-token">
            <input
              className="mp-token__input"
              value={v}
              onChange={(e) => update(i, e.target.value)}
            />
            <button
              type="button"
              className="mp-token__remove"
              onClick={() => remove(i)}
              aria-label={`Remove ${v}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="mp-row" style={{ gap: 8, marginTop: 8 }}>
        <input
          className="mp-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
          }}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        <Button variant="outline" size="sm" onClick={add}>
          <Plus size={14} /> Add
        </Button>
      </div>
    </Field>
  );
}
