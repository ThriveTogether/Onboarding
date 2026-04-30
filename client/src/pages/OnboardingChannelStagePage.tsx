import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mail, Linkedin, MessageCircle, Phone, Snowflake, Zap, Flame, CheckCircle, Star } from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import PhaseProgress from '../components/PhaseProgress';
import Card from '../components/Card';
import Button from '../components/Button';
import WizardBackLink from '../components/WizardBackLink';

type Stage = 'cold' | 'warming' | 'warm' | 'hot' | 'ready';
type Channel = 'email' | 'linkedin' | 'whatsapp' | 'calling';

interface ChannelStrategy {
  cold: Channel[];
  warming: Channel[];
  warm: Channel[];
  hot: Channel[];
  ready: Channel[];
}

interface StageThresholds {
  cold: [number, number];
  warming: [number, number];
  warm: [number, number];
  hot: [number, number];
  ready: [number, number];
}

const STAGES: { key: Stage; label: string; sub: string; icon: any; color: string }[] = [
  { key: 'cold', label: 'Cold', sub: 'AI starts the conversation', icon: Snowflake, color: '#3FB6FF' },
  { key: 'warming', label: 'Warming', sub: 'They opened / clicked / glanced', icon: Zap, color: '#9D6BFF' },
  { key: 'warm', label: 'Warm', sub: 'Active replies, real interest', icon: Star, color: '#F4A02E' },
  { key: 'hot', label: 'Hot', sub: 'Pricing / timeline questions', icon: Flame, color: '#FF6F61' },
  { key: 'ready', label: 'Ready', sub: 'Rep takes the meeting', icon: CheckCircle, color: '#16A34A' },
];

const CHANNELS: { key: Channel; label: string; icon: any; help: string }[] = [
  { key: 'email', label: 'Email', icon: Mail, help: 'Best for early-stage at scale' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, help: 'Connection requests + DMs' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, help: 'Warm / replied leads only' },
  { key: 'calling', label: 'Calling', icon: Phone, help: 'Hot leads + rep handoff' },
];

const DEFAULTS: ChannelStrategy = {
  cold: ['email', 'linkedin'],
  warming: ['email', 'linkedin'],
  warm: ['email', 'whatsapp'],
  hot: ['whatsapp', 'calling'],
  ready: ['calling'],
};

const DEFAULT_THRESHOLDS: StageThresholds = {
  cold: [0, 35],
  warming: [36, 50],
  warm: [51, 75],
  hot: [76, 90],
  ready: [91, 100],
};

export default function OnboardingChannelStagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [strategy, setStrategy] = useState<ChannelStrategy>(DEFAULTS);
  const [thresholds, setThresholds] = useState<StageThresholds>(DEFAULT_THRESHOLDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Hydrate from server: channelStrategy + stageThresholds saved already, OR
  // pull preferredChannels from messaging step as a sensible default.
  useEffect(() => {
    if (!id) return;
    onboardingAPI.state(id).then(({ data }) => {
      const cs = data.company?.channelStrategy;
      const st = data.company?.stageThresholds;
      const pc: string[] = data.company?.preferredChannels || [];

      if (cs && Array.isArray(cs.cold) && cs.cold.length > 0) {
        setStrategy({
          cold: cs.cold,
          warming: cs.warming || cs.cold,
          warm: cs.warm || cs.cold,
          hot: cs.hot || ['whatsapp', 'calling'],
          ready: cs.ready || ['calling'],
        });
      } else if (pc.length > 0) {
        // Use messaging-step channels for cold/warming, keep defaults for warm/hot/ready
        const fromMsg = pc.filter((c): c is Channel =>
          (['email', 'linkedin', 'whatsapp', 'calling'] as string[]).includes(c)
        );
        setStrategy((prev) => ({
          ...prev,
          cold: fromMsg.length > 0 ? fromMsg : prev.cold,
          warming: fromMsg.length > 0 ? fromMsg : prev.warming,
        }));
      }
      if (st && Array.isArray(st.cold)) {
        setThresholds({
          cold: [st.cold[0] ?? 0, st.cold[1] ?? 35],
          warming: [st.warming?.[0] ?? 36, st.warming?.[1] ?? 50],
          warm: [st.warm?.[0] ?? 51, st.warm?.[1] ?? 75],
          hot: [st.hot?.[0] ?? 76, st.hot?.[1] ?? 90],
          ready: [st.ready?.[0] ?? 91, st.ready?.[1] ?? 100],
        });
      }
    });
  }, [id]);

  const toggleChannel = (stage: Stage, channel: Channel) => {
    setStrategy((prev) => {
      const list = prev[stage] || [];
      const next = list.includes(channel)
        ? list.filter((c) => c !== channel)
        : [...list, channel];
      return { ...prev, [stage]: next };
    });
  };

  const updateThreshold = (stage: Stage, idx: 0 | 1, value: number) => {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    setThresholds((prev) => {
      const range: [number, number] = [...prev[stage]] as [number, number];
      range[idx] = v;
      // Keep min ≤ max within the stage
      if (range[0] > range[1]) {
        if (idx === 0) range[1] = range[0];
        else range[0] = range[1];
      }
      return { ...prev, [stage]: range };
    });
  };

  const validate = (): string | null => {
    // Every stage needs at least one channel except 'ready' (rep takeover)
    for (const s of STAGES) {
      if (s.key === 'ready') continue;
      if ((strategy[s.key] || []).length === 0) {
        return `Pick at least one channel for the ${s.label} stage.`;
      }
    }
    // Thresholds must be increasing across stages
    const stageKeys: Stage[] = ['cold', 'warming', 'warm', 'hot', 'ready'];
    for (let i = 0; i < stageKeys.length - 1; i++) {
      const a = thresholds[stageKeys[i]];
      const b = thresholds[stageKeys[i + 1]];
      if (a[1] >= b[0]) {
        return `Score ranges shouldn't overlap. ${stageKeys[i]} ends at ${a[1]}, but ${stageKeys[i + 1]} starts at ${b[0]}.`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!id) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onboardingAPI.saveChannelStages(id, {
        channelStrategy: strategy as unknown as Record<string, string[]>,
        stageThresholds: thresholds as unknown as Record<string, [number, number]>,
      });
      navigate(`/onboarding/docs/${id}`);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Could not save. Retry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard mp-wizard--wide" style={{ maxWidth: 1100 }}>
        <WizardBackLink to={id ? `/onboarding/messaging/${id}` : '/onboarding'} label="Back to messaging" />
        <PhaseProgress phase="phase_b" step="b1" />

        <div className="mp-text-center" style={{ marginBottom: 16 }}>
          <div className="mp-brand-header__overline">Phase B — Make my AI smart</div>
          <h2 className="mp-h2" style={{ margin: '6px 0 4px' }}>
            Set the funnel — channels + score ranges
          </h2>
          <p className="mp-body-sm mp-muted">
            Every lead lives in one of five stages. Pick which channels your AI should use at each stage, and
            the score range that triggers each move. You can always tweak these later from Settings.
          </p>
        </div>

        <Card padding="lg" style={{ marginBottom: 16 }}>
          <div className="mp-stage-table">
            {/* Header row */}
            <div className="mp-stage-table__head">
              <div>Stage</div>
              <div>Score range</div>
              <div>Channels (multi-select)</div>
            </div>

            {STAGES.map((s) => {
              const Icon = s.icon;
              const range = thresholds[s.key];
              const channels = strategy[s.key] || [];
              return (
                <div key={s.key} className="mp-stage-table__row">
                  <div className="mp-stage-table__cell">
                    <div className="mp-stage-table__stage">
                      <div
                        className="mp-stage-table__icon"
                        style={{ background: s.color, color: '#fff' }}
                      >
                        <Icon size={14} strokeWidth={2.5} />
                      </div>
                      <div>
                        <div className="mp-stage-table__label">{s.label}</div>
                        <div className="mp-stage-table__sub">{s.sub}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mp-stage-table__cell">
                    <div className="mp-stage-range">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={range[0]}
                        onChange={(e) => updateThreshold(s.key, 0, Number(e.target.value))}
                        className="mp-input mp-stage-range__input"
                      />
                      <span className="mp-stage-range__sep">to</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={range[1]}
                        onChange={(e) => updateThreshold(s.key, 1, Number(e.target.value))}
                        className="mp-input mp-stage-range__input"
                      />
                      <span className="mp-meta" style={{ marginLeft: 6 }}>/ 100</span>
                    </div>
                  </div>

                  <div className="mp-stage-table__cell">
                    <div className="mp-stage-channels">
                      {CHANNELS.map((c) => {
                        const Cicon = c.icon;
                        const active = channels.includes(c.key);
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => toggleChannel(s.key, c.key)}
                            className={`mp-stage-chip ${active ? 'mp-stage-chip--active' : ''}`}
                            title={c.help}
                          >
                            <Cicon size={12} /> {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {error && (
          <Card padding="md" style={{ marginBottom: 16, borderColor: 'var(--mp-error)', background: 'var(--mp-error-bg)' }}>
            <p className="mp-help mp-help--error" style={{ margin: 0 }}>{error}</p>
          </Card>
        )}

        <div className="mp-row" style={{ justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={handleSave} disabled={submitting} size="lg">
            {submitting ? 'Saving…' : 'Save + continue to strategy docs →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
