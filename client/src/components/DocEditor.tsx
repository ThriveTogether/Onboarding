import React, { useState } from 'react';
import { Snowflake, Zap, Flame, X, Plus } from 'lucide-react';
import { OnboardingDoc } from '../api/onboarding';
import Badge from './Badge';

interface DocEditorProps {
  doc: OnboardingDoc;
  value: any;
  onChange: (next: any) => void;
}

/**
 * Structured form editor for each doc kind. Replaces the raw JSON textarea —
 * founders see the same fields they were looking at in read mode, now editable.
 */
export default function DocEditor({ doc, value, onChange }: DocEditorProps) {
  switch (doc.kind) {
    case 'nurture_strategy':
      return <NurtureEditor value={value} onChange={onChange} />;
    case 'scoring_framework':
      return <ScoringEditor value={value} onChange={onChange} />;
    case 'brand_guidelines':
      return <BrandEditor value={value} onChange={onChange} />;
    case 'knowledge_base':
      return <KnowledgeEditor value={value} onChange={onChange} />;
    case 'target_profile':
      return <TargetProfileEditor value={value} onChange={onChange} />;
    default:
      return <p className="mp-muted">Editing not supported for this doc kind.</p>;
  }
}

// ---------- Generic field primitives ----------

function FieldRow({ label, children, stack }: { label: string; children: React.ReactNode; stack?: boolean }) {
  return (
    <div className={`mp-editor-row${stack ? ' mp-editor-row--stack' : ''}`}>
      <div className="mp-editor-row__label">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      className="mp-input"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      className="mp-textarea"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
    />
  );
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      className="mp-input"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      style={{ width: 120 }}
    />
  );
}

function StringListEditor({
  values,
  onChange,
  placeholder,
  multiline,
  addLabel = 'Add',
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  multiline?: boolean;
  addLabel?: string;
}) {
  const list = Array.isArray(values) ? values : [];
  const setAt = (i: number, v: string) => onChange(list.map((x, idx) => (idx === i ? v : x)));
  const removeAt = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  const add = () => onChange([...list, '']);
  return (
    <div>
      {list.map((v, i) => (
        <div key={i} className="mp-list-editor-row">
          {multiline ? (
            <textarea
              className="mp-textarea"
              value={v}
              onChange={(e) => setAt(i, e.target.value)}
              rows={2}
              placeholder={placeholder}
            />
          ) : (
            <input
              type="text"
              className="mp-input"
              value={v}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={placeholder}
            />
          )}
          <button className="mp-list-editor-remove" onClick={() => removeAt(i)} type="button">
            <X size={14} />
          </button>
        </div>
      ))}
      <button className="mp-list-editor-add" onClick={add} type="button">
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  );
}

// ---------- Nurture editor ----------

function NurtureEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const [tab, setTab] = useState<'cold' | 'warm' | 'hot'>('cold');
  const update = (path: string[], v: any) => {
    const next = { ...value };
    let cursor: any = next;
    for (let i = 0; i < path.length - 1; i++) {
      cursor[path[i]] = { ...(cursor[path[i]] || {}) };
      cursor = cursor[path[i]];
    }
    cursor[path[path.length - 1]] = v;
    onChange(next);
  };

  const cold = value?.coldOutreach || {};
  const warm = value?.warmEngaged || {};
  const hot = value?.hotRepReady || {};

  return (
    <div className="mp-doc-sections">
      <div className="mp-tabs" style={{ marginBottom: 16 }}>
        {[
          { key: 'cold' as const, label: 'Stage 1 · Cold outreach', Icon: Snowflake, color: 'var(--mp-chart-2)' },
          { key: 'warm' as const, label: 'Stage 2 · Warm / engaged', Icon: Zap, color: 'var(--mp-chart-4)' },
          { key: 'hot' as const, label: 'Stage 3 · Hot / rep-ready', Icon: Flame, color: 'var(--mp-coral)' },
        ].map((s) => {
          const active = tab === s.key;
          return (
            <button
              key={s.key}
              className={`mp-tab ${active ? 'mp-tab--active' : ''}`}
              onClick={() => setTab(s.key)}
              type="button"
            >
              <s.Icon size={14} color={active ? s.color : undefined} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'cold' && (
        <div className="mp-doc-stage mp-doc-stage--cold">
          <FieldRow label="Channel (primary)">
            <TextInput value={cold.channelPrimary} onChange={(v) => update(['coldOutreach', 'channelPrimary'], v)} placeholder="WhatsApp" />
          </FieldRow>
          <FieldRow label="Channel (secondary)">
            <TextInput value={cold.channelSecondary} onChange={(v) => update(['coldOutreach', 'channelSecondary'], v)} placeholder="Email" />
          </FieldRow>
          <FieldRow label="Tone" stack>
            <TextArea value={cold.tone} onChange={(v) => update(['coldOutreach', 'tone'], v)} rows={2} />
          </FieldRow>
          <FieldRow label="First message" stack>
            <TextArea value={cold.firstMessageApproach} onChange={(v) => update(['coldOutreach', 'firstMessageApproach'], v)} rows={4} />
          </FieldRow>
          <FieldRow label="Frequency (days)">
            <TextInput
              value={(cold.frequencyDays || []).join(', ')}
              onChange={(v) => update(['coldOutreach', 'frequencyDays'], v.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n)))}
              placeholder="1, 3, 7"
            />
          </FieldRow>
          <FieldRow label="Escalation" stack>
            <TextArea value={cold.escalation} onChange={(v) => update(['coldOutreach', 'escalation'], v)} rows={3} />
          </FieldRow>
        </div>
      )}

      {tab === 'warm' && (
        <div className="mp-doc-stage mp-doc-stage--warm">
          <FieldRow label="Channel">
            <TextInput value={warm.channel} onChange={(v) => update(['warmEngaged', 'channel'], v)} />
          </FieldRow>
          <FieldRow label="Tone" stack>
            <TextArea value={warm.tone} onChange={(v) => update(['warmEngaged', 'tone'], v)} rows={2} />
          </FieldRow>
          <FieldRow label="Approach" stack>
            <TextArea value={warm.approach} onChange={(v) => update(['warmEngaged', 'approach'], v)} rows={3} />
          </FieldRow>
          <FieldRow label="Proactive every (days)">
            <NumberInput value={warm.proactiveIntervalDays || 0} onChange={(v) => update(['warmEngaged', 'proactiveIntervalDays'], v)} min={1} max={30} />
          </FieldRow>
          <FieldRow label="Escalation" stack>
            <TextArea value={warm.escalation} onChange={(v) => update(['warmEngaged', 'escalation'], v)} rows={3} />
          </FieldRow>
        </div>
      )}

      {tab === 'hot' && (
        <div className="mp-doc-stage mp-doc-stage--hot">
          <FieldRow label="Channel">
            <TextInput value={hot.channel} onChange={(v) => update(['hotRepReady', 'channel'], v)} />
          </FieldRow>
          <FieldRow label="Handoff trigger" stack>
            <TextArea value={hot.handoffTrigger} onChange={(v) => update(['hotRepReady', 'handoffTrigger'], v)} rows={3} />
          </FieldRow>
          <FieldRow label="Rep action" stack>
            <TextArea value={hot.repAction} onChange={(v) => update(['hotRepReady', 'repAction'], v)} rows={2} />
          </FieldRow>
        </div>
      )}

      <div className="mp-editor-field" style={{ marginTop: 24 }}>
        <div className="mp-editor-field__label">Rationale (notes for you)</div>
        <TextArea value={value?.rationale} onChange={(v) => onChange({ ...value, rationale: v })} rows={3} />
      </div>
    </div>
  );
}

// ---------- Scoring editor ----------

function ScoringEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const weights = value?.categoryWeights || { companyFit: 0, engagement: 0, intent: 0, recency: 0 };
  const total = (weights.companyFit || 0) + (weights.engagement || 0) + (weights.intent || 0) + (weights.recency || 0);
  const updateWeight = (key: string, v: number) =>
    onChange({ ...value, categoryWeights: { ...weights, [key]: v } });

  const updateSignalGroup = (group: string, next: Array<{ signal: string; weight: number }>) =>
    onChange({ ...value, signals: { ...(value.signals || {}), [group]: next } });

  const updateRedFlags = (next: string[]) => onChange({ ...value, redFlagSignals: next });

  return (
    <div className="mp-doc-sections">
      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Category weights (must total 100)</div>
        <WeightSlider label="Company fit" value={weights.companyFit || 0} onChange={(v) => updateWeight('companyFit', v)} />
        <WeightSlider label="Engagement" value={weights.engagement || 0} onChange={(v) => updateWeight('engagement', v)} />
        <WeightSlider label="Intent" value={weights.intent || 0} onChange={(v) => updateWeight('intent', v)} />
        <WeightSlider label="Recency" value={weights.recency || 0} onChange={(v) => updateWeight('recency', v)} />
        <div className={`mp-weight-total ${total === 100 ? 'mp-weight-total--ok' : 'mp-weight-total--err'}`}>
          Total: {total}{total === 100 ? ' ✓' : ` — needs ${100 - total} more (or less)`}
        </div>
      </div>

      {(['companyFit', 'engagement', 'intent', 'recency'] as const).map((group) => {
        const items = (value?.signals?.[group] as Array<{ signal: string; weight: number }>) || [];
        const label = {
          companyFit: 'Company fit signals',
          engagement: 'Engagement signals',
          intent: 'Intent signals',
          recency: 'Recency signals',
        }[group];
        return (
          <div key={group} className="mp-doc-section">
            <div className="mp-doc-section__label">{label}</div>
            {items.map((item, i) => (
              <div key={i} className="mp-list-editor-row">
                <input
                  type="text"
                  className="mp-input"
                  value={item.signal || ''}
                  onChange={(e) => {
                    const next = items.map((x, idx) => (idx === i ? { ...x, signal: e.target.value } : x));
                    updateSignalGroup(group, next);
                  }}
                  placeholder="Signal description"
                />
                <input
                  type="number"
                  className="mp-input"
                  value={item.weight || 0}
                  onChange={(e) => {
                    const next = items.map((x, idx) => (idx === i ? { ...x, weight: Number(e.target.value) || 0 } : x));
                    updateSignalGroup(group, next);
                  }}
                  style={{ width: 80 }}
                />
                <button
                  className="mp-list-editor-remove"
                  onClick={() => updateSignalGroup(group, items.filter((_, idx) => idx !== i))}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              className="mp-list-editor-add"
              onClick={() => updateSignalGroup(group, [...items, { signal: '', weight: 0 }])}
              type="button"
            >
              <Plus size={12} /> Add signal
            </button>
          </div>
        );
      })}

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Red-flag signals (drop the score)</div>
        <StringListEditor
          values={value?.redFlagSignals || []}
          onChange={updateRedFlags}
          placeholder="e.g., No reply after 3 touches"
          addLabel="Add red flag"
        />
      </div>

      <div className="mp-editor-field">
        <div className="mp-editor-field__label">Rationale</div>
        <TextArea value={value?.rationale} onChange={(v) => onChange({ ...value, rationale: v })} rows={3} />
      </div>
    </div>
  );
}

function WeightSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="mp-weight-slider">
      <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="mp-weight-slider__value">{value}%</span>
    </div>
  );
}

// ---------- Brand editor ----------

function BrandEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const voice = value?.voice || {};
  const samples = value?.samples || {};
  const updateVoice = (key: string, v: string) => onChange({ ...value, voice: { ...voice, [key]: v } });
  const updateSample = (key: string, v: string) => onChange({ ...value, samples: { ...samples, [key]: v } });

  return (
    <div className="mp-doc-sections">
      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Voice</div>
        <FieldRow label="Tone" stack>
          <TextArea value={voice.tone} onChange={(v) => updateVoice('tone', v)} rows={2} />
        </FieldRow>
        <FieldRow label="Language level" stack>
          <TextArea value={voice.languageLevel} onChange={(v) => updateVoice('languageLevel', v)} rows={2} />
        </FieldRow>
        <FieldRow label="First person style" stack>
          <TextInput value={voice.firstPersonStyle} onChange={(v) => updateVoice('firstPersonStyle', v)} />
        </FieldRow>
        <FieldRow label="Sign-off">
          <TextInput value={voice.signOffStyle} onChange={(v) => updateVoice('signOffStyle', v)} />
        </FieldRow>
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label" style={{ color: 'var(--mp-success)' }}>Do</div>
        <StringListEditor
          values={value?.dos || []}
          onChange={(v) => onChange({ ...value, dos: v })}
          placeholder="Reference specific pain points"
          addLabel="Add a do"
        />
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label" style={{ color: 'var(--mp-error)' }}>Don't</div>
        <StringListEditor
          values={value?.donts || []}
          onChange={(v) => onChange({ ...value, donts: v })}
          placeholder="Avoid urgency tactics"
          addLabel="Add a don't"
        />
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Business hours</div>
        <TextInput value={value?.businessHours} onChange={(v) => onChange({ ...value, businessHours: v })} placeholder="9am-7pm IST" />
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Sample messages</div>
        <FieldRow label="Cold WhatsApp" stack>
          <TextArea value={samples.coldWhatsApp} onChange={(v) => updateSample('coldWhatsApp', v)} rows={6} />
        </FieldRow>
        <FieldRow label="Follow-up WhatsApp" stack>
          <TextArea value={samples.followupWhatsApp} onChange={(v) => updateSample('followupWhatsApp', v)} rows={5} />
        </FieldRow>
      </div>

      <div className="mp-editor-field">
        <div className="mp-editor-field__label">Rationale</div>
        <TextArea value={value?.rationale} onChange={(v) => onChange({ ...value, rationale: v })} rows={3} />
      </div>
    </div>
  );
}

// ---------- Knowledge base editor ----------

function KnowledgeEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const objections = (value?.commonObjections as Array<{ objection: string; response: string }>) || [];
  const updateObjections = (next: Array<{ objection: string; response: string }>) => onChange({ ...value, commonObjections: next });

  return (
    <div className="mp-doc-sections">
      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Company description</div>
        <TextArea value={value?.companyDescription} onChange={(v) => onChange({ ...value, companyDescription: v })} rows={4} />
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Products / services</div>
        <StringListEditor values={value?.productsServices || []} onChange={(v) => onChange({ ...value, productsServices: v })} placeholder="Product or service" addLabel="Add product" />
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Positioning angles</div>
        <StringListEditor values={value?.positioningAngles || []} onChange={(v) => onChange({ ...value, positioningAngles: v })} placeholder="How you position against alternatives" multiline addLabel="Add angle" />
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Target market</div>
        <TextArea value={value?.targetMarket} onChange={(v) => onChange({ ...value, targetMarket: v })} rows={2} />
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Key differentiators</div>
        <StringListEditor values={value?.keyDifferentiators || []} onChange={(v) => onChange({ ...value, keyDifferentiators: v })} placeholder="Unique differentiator" multiline addLabel="Add differentiator" />
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Common objections</div>
        {objections.map((o, i) => (
          <div key={i} style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)', marginBottom: 8, position: 'relative' }}>
            <button
              className="mp-list-editor-remove"
              onClick={() => updateObjections(objections.filter((_, idx) => idx !== i))}
              type="button"
              style={{ position: 'absolute', top: 6, right: 6 }}
            >
              <X size={14} />
            </button>
            <FieldRow label="Objection" stack>
              <TextInput value={o.objection} onChange={(v) => updateObjections(objections.map((x, idx) => (idx === i ? { ...x, objection: v } : x)))} />
            </FieldRow>
            <FieldRow label="Response" stack>
              <TextArea value={o.response} onChange={(v) => updateObjections(objections.map((x, idx) => (idx === i ? { ...x, response: v } : x)))} rows={2} />
            </FieldRow>
          </div>
        ))}
        <button
          className="mp-list-editor-add"
          onClick={() => updateObjections([...objections, { objection: '', response: '' }])}
          type="button"
        >
          <Plus size={12} /> Add objection
        </button>
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Competitors</div>
        <StringListEditor values={value?.competitors || []} onChange={(v) => onChange({ ...value, competitors: v })} placeholder="Competitor name" addLabel="Add competitor" />
      </div>
    </div>
  );
}

// ---------- Target profile editor ----------

function TargetProfileEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <div className="mp-doc-sections">
      <div className="mp-doc-section">
        <FieldRow label="Geography" stack>
          <TextInput value={value?.geography} onChange={(v) => onChange({ ...value, geography: v })} />
        </FieldRow>
        <FieldRow label="Company size" stack>
          <TextInput value={value?.companySize} onChange={(v) => onChange({ ...value, companySize: v })} />
        </FieldRow>
        <FieldRow label="Sales team size" stack>
          <TextInput value={value?.salesTeamSize} onChange={(v) => onChange({ ...value, salesTeamSize: v })} />
        </FieldRow>
        <FieldRow label="Industry focus" stack>
          <TextArea value={value?.industryFocus} onChange={(v) => onChange({ ...value, industryFocus: v })} rows={2} />
        </FieldRow>
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Decision makers</div>
        <StringListEditor values={value?.decisionMakers || []} onChange={(v) => onChange({ ...value, decisionMakers: v })} placeholder="VP Sales" addLabel="Add role" />
      </div>

      <div className="mp-doc-section">
        <div className="mp-doc-section__label">Pain signals</div>
        <StringListEditor values={value?.painSignals || []} onChange={(v) => onChange({ ...value, painSignals: v })} placeholder="e.g., Excel-based tracking" multiline addLabel="Add pain signal" />
      </div>

      <Badge tone="brand">Target profile is also editable from A2 on the wizard</Badge>
    </div>
  );
}
