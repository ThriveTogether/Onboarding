import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mail, Linkedin, MessageCircle, Snowflake, Zap, Flame, RefreshCw, Save, Edit3, Check } from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import PhaseProgress from '../components/PhaseProgress';
import Card from '../components/Card';
import Button from '../components/Button';
import WizardBackLink from '../components/WizardBackLink';

type Stage = 'cold' | 'warming' | 'hot';
type Channel = 'email' | 'linkedin' | 'whatsapp';
type Length = 'tight' | 'balanced' | 'detailed';
type Tone = 'direct' | 'balanced' | 'empathetic';
type Formality = 'casual' | 'professional' | 'formal';

const STAGES: { key: Stage; label: string; sub: string; icon: any; color: string }[] = [
  { key: 'cold', label: 'Cold outreach', sub: 'First touch', icon: Snowflake, color: 'var(--mp-chart-2)' },
  { key: 'warming', label: 'Warm follow-up', sub: 'They\'ve engaged', icon: Zap, color: 'var(--mp-chart-4)' },
  { key: 'hot', label: 'Hot / your turn', sub: 'Ready for you', icon: Flame, color: 'var(--mp-coral)' },
];

const CHANNELS: { key: Channel; label: string; icon: any }[] = [
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

interface DraftState {
  subject: string;
  body: string;
  rationale: string;
  length: Length;
  tone: Tone;
  formality: Formality;
  edited: boolean;
  saved: boolean;
}

type DraftMap = Partial<Record<`${Stage}:${Channel}`, DraftState>>;

const defaultDraft = (): DraftState => ({
  subject: '',
  body: '',
  rationale: '',
  length: 'balanced',
  tone: 'balanced',
  formality: 'professional',
  edited: false,
  saved: false,
});

export default function OnboardingMessagingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('cold');
  const [channel, setChannel] = useState<Channel>('email');
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [drafting, setDrafting] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const key = `${stage}:${channel}` as `${Stage}:${Channel}`;
  const current = drafts[key] || defaultDraft();

  // Track which stage:channel pairs we've already kicked off auto-drafting for.
  // Without this guard, a user switching tabs while a draft is mid-flight could
  // land on a tab that never auto-fetches (e.g. hot:email after cold:email),
  // because the previous effect bailed on `drafting === true` and `key` didn't
  // change again. Each key gets exactly one auto-attempt; the user can hit
  // "Re-draft" to retry on failure.
  const attemptedKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (drafts[key] || attemptedKeys.current.has(key)) return;
    attemptedKeys.current.add(key);
    handleDraft(stage, channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const updateCurrent = (patch: Partial<DraftState>) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] || defaultDraft()), ...patch } }));
  };

  const handleDraft = async (s: Stage = stage, c: Channel = channel, opts?: { keepBody?: boolean }) => {
    if (!id) return;
    setDrafting(true);
    setError('');
    try {
      const existing = drafts[`${s}:${c}` as const] || defaultDraft();
      const { data } = await onboardingAPI.draftMessage(id, {
        stage: s,
        channel: c,
        length: existing.length,
        tone: existing.tone,
        formality: existing.formality,
      });
      setDrafts((prev) => ({
        ...prev,
        [`${s}:${c}` as `${Stage}:${Channel}`]: {
          ...defaultDraft(),
          length: existing.length,
          tone: existing.tone,
          formality: existing.formality,
          subject: data.draft.subject,
          body: opts?.keepBody && existing.body ? existing.body : data.draft.body,
          rationale: data.draft.rationale,
        },
      }));
    } catch (e: any) {
      setError(e.response?.data?.error || 'Could not draft message. Retry.');
    } finally {
      setDrafting(false);
    }
  };

  // After a successful save, advance to the next stage:channel cell so the
  // founder doesn't have to manually click the next tab. Walk channels first
  // within the current stage, then roll over to the first channel of the next
  // stage. On the very last cell (hot:whatsapp) we stay put — there's nowhere
  // to go.
  const advanceToNextCell = () => {
    const stageIdx = STAGES.findIndex((s) => s.key === stage);
    const channelIdx = CHANNELS.findIndex((c) => c.key === channel);
    if (channelIdx < CHANNELS.length - 1) {
      setChannel(CHANNELS[channelIdx + 1].key);
    } else if (stageIdx < STAGES.length - 1) {
      setStage(STAGES[stageIdx + 1].key);
      setChannel(CHANNELS[0].key);
    }
  };

  const handleSave = async () => {
    if (!id) return;
    setSavingKey(key);
    setError('');
    try {
      await onboardingAPI.saveMessageTemplate(id, {
        stage,
        channel,
        subject: current.subject,
        body: current.body,
        length: current.length,
        tone: current.tone,
        formality: current.formality,
        edited: current.edited,
      });
      updateCurrent({ saved: true });
      advanceToNextCell();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Could not save. Retry.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleProceed = async () => {
    if (!id) return;
    // Save preferred channels = channels with at least one saved template
    const preferredChannels = Array.from(
      new Set(
        Object.entries(drafts)
          .filter(([, d]) => d?.saved)
          .map(([k]) => k.split(':')[1])
      )
    );
    try {
      await onboardingAPI.savePreferredChannels(id, preferredChannels);
    } catch (e) {
      console.warn('Failed to save preferred channels — continuing anyway', e);
    }
    navigate(`/onboarding/channels-stages/${id}`);
  };

  const savedCount = Object.values(drafts).filter((d) => d?.saved).length;
  const hasAnySaved = savedCount > 0;

  const channelLabelFor = (c: Channel) =>
    c === 'email' ? 'Email' : c === 'linkedin' ? 'LinkedIn Connect' : 'WhatsApp';

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard mp-wizard--wide" style={{ maxWidth: 1100 }}>
        <WizardBackLink to={id ? `/onboarding/leads/${id}` : '/onboarding'} label="Back to leads" />
        <PhaseProgress phase="phase_b" step="b1" />

        <div className="mp-text-center" style={{ marginBottom: 16 }}>
          <div className="mp-brand-header__overline">Phase B — Make my AI smart</div>
          <h2 className="mp-h2" style={{ margin: '6px 0 4px' }}>
            Draft your AI's first messages
          </h2>
          <p className="mp-body-sm mp-muted">
            Three stages × three channels. Tweak the controls, edit the draft directly, save the ones
            you like — your AI will use these as templates for every lead.
          </p>
        </div>

        <div className="mp-msg-shell">
          {/* Stage selector */}
          <div className="mp-msg-stages">
            {STAGES.map((s) => {
              const Icon = s.icon;
              const active = s.key === stage;
              const stageSavedCount = CHANNELS.filter(
                (c) => drafts[`${s.key}:${c.key}` as const]?.saved
              ).length;
              return (
                <button
                  key={s.key}
                  className={`mp-msg-stage ${active ? 'mp-msg-stage--active' : ''}`}
                  onClick={() => setStage(s.key)}
                >
                  <div className="mp-msg-stage__icon" style={{ background: active ? s.color : 'var(--bg-2)', color: active ? '#fff' : 'var(--fg-2)' }}>
                    <Icon size={14} strokeWidth={2.5} />
                  </div>
                  <div className="mp-msg-stage__body">
                    <div className="mp-msg-stage__sub">{s.sub}</div>
                    <div className="mp-msg-stage__label">{s.label}</div>
                  </div>
                  {stageSavedCount > 0 && (
                    <span className="mp-msg-stage__count">{stageSavedCount}/{CHANNELS.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Channel tabs */}
          <div className="mp-msg-channels">
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              const active = c.key === channel;
              const isSaved = drafts[`${stage}:${c.key}` as const]?.saved;
              return (
                <button
                  key={c.key}
                  className={`mp-msg-channel ${active ? 'mp-msg-channel--active' : ''}`}
                  onClick={() => setChannel(c.key)}
                >
                  <Icon size={14} /> {channelLabelFor(c.key)}
                  {isSaved && <Check size={12} className="mp-msg-channel__check" />}
                </button>
              );
            })}
          </div>

          {/* Controls */}
          <Card padding="lg" style={{ marginBottom: 12 }}>
            <div className="mp-msg-controls">
              <ControlGroup
                label="Length"
                options={[
                  { key: 'tight', label: 'Tight' },
                  { key: 'balanced', label: 'Balanced' },
                  { key: 'detailed', label: 'Detailed' },
                ]}
                value={current.length}
                onChange={(v) => updateCurrent({ length: v as Length })}
                gradient="linear-gradient(90deg, #3FB6FF 0%, #9D6BFF 50%, #FF6F61 100%)"
              />
              <ControlGroup
                label="Tone"
                options={[
                  { key: 'direct', label: 'Direct' },
                  { key: 'balanced', label: 'Balanced' },
                  { key: 'empathetic', label: 'Empathetic' },
                ]}
                value={current.tone}
                onChange={(v) => updateCurrent({ tone: v as Tone })}
                gradient="linear-gradient(90deg, #FF6F61 0%, #F4A02E 50%, #16A34A 100%)"
              />
              <ControlGroup
                label="Formality"
                options={[
                  { key: 'casual', label: 'Casual' },
                  { key: 'professional', label: 'Professional' },
                  { key: 'formal', label: 'Formal' },
                ]}
                value={current.formality}
                onChange={(v) => updateCurrent({ formality: v as Formality })}
                gradient="linear-gradient(90deg, #F4A02E 0%, #2FB7F5 50%, #152B68 100%)"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDraft(stage, channel)}
                disabled={drafting}
              >
                <RefreshCw size={14} className={drafting ? 'mp-spin' : ''} />
                {drafting ? 'Drafting…' : 'Re-draft with these controls'}
              </Button>
            </div>
          </Card>

          {/* The message itself */}
          <Card padding="lg">
            {drafting && !current.body ? (
              <p className="mp-muted mp-text-center" style={{ padding: 32 }}>Drafting…</p>
            ) : (
              <>
                {channel === 'email' && (
                  <div className="mp-field">
                    <label className="mp-label">Subject</label>
                    <input
                      className="mp-input"
                      value={current.subject}
                      onChange={(e) => updateCurrent({ subject: e.target.value, edited: true, saved: false })}
                      placeholder="(empty for LinkedIn / WhatsApp)"
                    />
                  </div>
                )}

                <div className="mp-field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="mp-label" style={{ marginBottom: 0 }}>
                      <Edit3 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      Message body{' '}
                      <span className="mp-meta" style={{ marginLeft: 6 }}>
                        {channel === 'linkedin' ? '· max 300 chars' : channel === 'whatsapp' ? '· short + warm' : ''}
                      </span>
                    </label>
                    {current.edited && (
                      <span className="mp-tag mp-tag--coral" style={{ fontSize: 10 }}>Edited</span>
                    )}
                  </div>
                  <textarea
                    className="mp-textarea"
                    rows={channel === 'linkedin' ? 5 : channel === 'whatsapp' ? 6 : 10}
                    value={current.body}
                    onChange={(e) => updateCurrent({ body: e.target.value, edited: true, saved: false })}
                    style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)' }}
                  />
                  {channel === 'linkedin' && (
                    <p className="mp-meta" style={{ marginTop: 4 }}>
                      {current.body.length}/300 characters
                    </p>
                  )}
                </div>

                {current.rationale && (
                  <div className="mp-callout" style={{ fontSize: 'var(--fs-xs)' }}>
                    <strong>Why this works:</strong> {current.rationale}
                  </div>
                )}

                {error && <p className="mp-help mp-help--error">{error}</p>}

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
                  <Button
                    variant="outline"
                    onClick={() => handleDraft(stage, channel)}
                    disabled={drafting}
                  >
                    Discard + re-draft
                  </Button>
                  <Button onClick={handleSave} disabled={savingKey === key || !current.body}>
                    {savingKey === key ? 'Saving…' : current.saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save this template</>}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="mp-row" style={{ justifyContent: 'space-between', marginTop: 24, alignItems: 'center' }}>
          <div className="mp-meta">
            {savedCount}/{STAGES.length * CHANNELS.length} templates saved.{' '}
            {hasAnySaved
              ? 'Save more or proceed — channels you saved become your preferred channels.'
              : 'Save at least one to continue.'}
          </div>
          <Button onClick={handleProceed} disabled={!hasAnySaved} size="lg">
            Next: set channels + score ranges →
          </Button>
        </div>
      </div>
    </div>
  );
}

function ControlGroup({
  label,
  options,
  value,
  onChange,
  gradient,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  gradient: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const positionPct = options.length === 1 ? 50 : (idx / (options.length - 1)) * 100;

  return (
    <div className="mp-msg-slider">
      <div className="mp-msg-slider__label">{label}</div>

      {/* Pole labels — clickable + bigger hit area */}
      <div className="mp-msg-slider__poles">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`mp-msg-slider__pole ${value === o.key ? 'mp-msg-slider__pole--active' : ''}`}
            onClick={() => onChange(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Track + thumb — entire area is a native range input for drag/click */}
      <div className="mp-msg-slider__track-wrap">
        <div className="mp-msg-slider__track" style={{ background: gradient }} />
        <div className="mp-msg-slider__stops" aria-hidden>
          {options.map((o, i) => (
            <span
              key={o.key}
              className={`mp-msg-slider__stop ${value === o.key ? 'mp-msg-slider__stop--active' : ''}`}
              style={{ left: options.length === 1 ? '50%' : `${(i / (options.length - 1)) * 100}%` }}
            />
          ))}
        </div>
        <div
          className="mp-msg-slider__thumb"
          style={{ left: `${positionPct}%` }}
          aria-hidden
        />
        {/* Native range input invisibly overlaid — gives free drag + click-anywhere */}
        <input
          type="range"
          min={0}
          max={Math.max(0, options.length - 1)}
          step={1}
          value={idx}
          onChange={(e) => {
            const newIdx = Number(e.target.value);
            const next = options[newIdx];
            if (next) onChange(next.key);
          }}
          className="mp-msg-slider__range"
          aria-label={label}
        />
      </div>
    </div>
  );
}
