import React, { useMemo, useState } from 'react';
import {
  Mail,
  Linkedin,
  MessageCircle,
  Phone,
  Snowflake,
  Zap,
  Flame,
  CheckCircle,
  ArrowRight,
  Pause,
  Sparkles,
  Clock,
} from 'lucide-react';

type Stage = 'cold' | 'warming' | 'warm' | 'hot' | 'ready';
type Channel = 'email' | 'linkedin' | 'whatsapp' | 'calling';

interface MessageTemplate {
  stage: 'cold' | 'warming' | 'hot';
  channel: 'email' | 'linkedin' | 'whatsapp';
  subject?: string;
  body: string;
  edited?: boolean;
}

interface Props {
  /** Whole nurture-strategy doc content. */
  content: any;
}

const STAGE_META: Record<Stage, { label: string; icon: any; color: string }> = {
  cold:    { label: 'Cold',    icon: Snowflake,   color: '#3FB6FF' },
  warming: { label: 'Warming', icon: Zap,         color: '#9D6BFF' },
  warm:    { label: 'Warm',    icon: Sparkles,    color: '#F4A02E' },
  hot:     { label: 'Hot',     icon: Flame,       color: '#FF6F61' },
  ready:   { label: 'Ready',   icon: CheckCircle, color: '#16A34A' },
};

const CHANNEL_META: Record<Channel, { label: string; icon: any }> = {
  email:    { label: 'Email',     icon: Mail },
  linkedin: { label: 'LinkedIn',  icon: Linkedin },
  whatsapp: { label: 'WhatsApp',  icon: MessageCircle },
  calling:  { label: 'Call',      icon: Phone },
};

interface Touch {
  day: number;
  channel: Channel;
  stage: Stage;
  label: string;
}

/**
 * Reads the nurture-strategy doc content and the founder's confirmed channel
 * strategy to build a sequence of touches per stage. Renders a horizontal
 * lane-per-stage layout with arrows between touches and stage transitions.
 */
export default function NurtureFlowDiagram({ content }: Props) {
  const [openTouch, setOpenTouch] = useState<string | null>(null);

  const touches = useMemo(() => buildTouches(content), [content]);
  const templates: MessageTemplate[] = content?.messageTemplates || [];

  const findTemplate = (stage: Stage, channel: Channel): MessageTemplate | null => {
    // Templates only exist for cold/warming/hot. Ready maps to hot for preview purposes.
    const tStage = stage === 'warm' || stage === 'ready' ? 'hot' : (stage as 'cold' | 'warming' | 'hot');
    return (
      templates.find((t) => t.stage === tStage && t.channel === channel) ||
      templates.find((t) => t.stage === tStage) ||
      null
    );
  };

  const stageLanes: Stage[] = ['cold', 'warming', 'warm', 'hot', 'ready'];

  return (
    <div className="mp-doc-section">
      <div className="mp-doc-section__label">Nurture flow — what your AI does, day by day</div>
      <p className="mp-body-sm mp-muted" style={{ margin: '0 0 16px' }}>
        Each card is a touch your AI will make. Click a card to preview the message you saved for
        that stage + channel. Arrows show how leads move between stages.
      </p>

      <div className="mp-flow-board">
        {stageLanes.map((stage, stageIdx) => {
          const stageTouches = touches.filter((t) => t.stage === stage);
          const meta = STAGE_META[stage];
          const StageIcon = meta.icon;
          if (stageTouches.length === 0 && stage !== 'ready') return null;

          return (
            <React.Fragment key={stage}>
              {stageIdx > 0 && (
                <div className="mp-flow-board__transition" aria-hidden>
                  <ArrowRight size={16} />
                </div>
              )}
              <div className="mp-flow-lane" style={{ borderTopColor: meta.color }}>
                <div className="mp-flow-lane__header">
                  <span className="mp-flow-lane__icon" style={{ background: meta.color }}>
                    <StageIcon size={12} strokeWidth={2.5} />
                  </span>
                  <span className="mp-flow-lane__label">{meta.label}</span>
                </div>

                {stage === 'ready' ? (
                  <div className="mp-flow-touch mp-flow-touch--ready">
                    <CheckCircle size={16} className="mp-flow-touch__icon" style={{ color: meta.color }} />
                    <div className="mp-flow-touch__body">
                      <div className="mp-flow-touch__title">Rep takes over</div>
                      <div className="mp-flow-touch__sub">
                        {content?.hotRepReady?.repAction || 'Auto-prep + handoff'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mp-flow-touches">
                    {stageTouches.map((t, i) => {
                      const ChannelIcon = CHANNEL_META[t.channel].icon;
                      const key = `${t.stage}:${t.channel}:${t.day}:${i}`;
                      const isOpen = openTouch === key;
                      const tpl = findTemplate(t.stage, t.channel);

                      return (
                        <React.Fragment key={key}>
                          {i > 0 && (
                            <div className="mp-flow-touches__connector" aria-hidden>
                              <span className="mp-flow-touches__wait">
                                <Clock size={9} /> {t.day - stageTouches[i - 1].day}d
                              </span>
                            </div>
                          )}
                          <button
                            type="button"
                            className={`mp-flow-touch ${isOpen ? 'mp-flow-touch--open' : ''}`}
                            onClick={() => setOpenTouch(isOpen ? null : key)}
                            disabled={!tpl}
                            title={tpl ? 'Click to preview the saved message' : 'No template saved yet for this stage/channel'}
                          >
                            <ChannelIcon size={16} className="mp-flow-touch__icon" style={{ color: meta.color }} />
                            <div className="mp-flow-touch__body">
                              <div className="mp-flow-touch__title">Day {t.day}</div>
                              <div className="mp-flow-touch__sub">{CHANNEL_META[t.channel].label}</div>
                            </div>
                            {tpl && <div className="mp-flow-touch__hint">click</div>}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Open template preview */}
      {openTouch && (() => {
        const [s, c] = openTouch.split(':') as [Stage, Channel];
        const tpl = findTemplate(s, c);
        if (!tpl) return null;
        const meta = STAGE_META[s];
        return (
          <div className={`mp-themed-card mp-theme-blue`} style={{ marginTop: 12 }}>
            <h4 className="mp-themed-card__title">
              {meta.label} · {CHANNEL_META[c].label} {tpl.edited && <span className="mp-tag mp-tag--coral" style={{ fontSize: 10, marginLeft: 6 }}>Edited by you</span>}
            </h4>
            {tpl.subject && (
              <div className="mp-meta" style={{ marginBottom: 6 }}>
                Subject: <strong>{tpl.subject}</strong>
              </div>
            )}
            <div className="mp-sample-bubble" style={{ whiteSpace: 'pre-wrap' }}>{tpl.body}</div>
          </div>
        );
      })()}

      {/* Branching: pause path */}
      <div className="mp-flow-pause">
        <Pause size={14} />
        <span>
          <strong>If no reply after {content?.coldOutreach?.frequencyDays?.length || 3} cold touches:</strong>{' '}
          pause the lead, re-engage in 30 days with a fresh angle.
        </span>
      </div>
    </div>
  );
}

/**
 * Build a sequence of touches from the doc content.
 * Cold uses coldOutreach.frequencyDays + the channelStrategy.cold list (cycle through).
 * Warming uses warmEngaged.proactiveIntervalDays.
 * Warm/Hot use channelStrategy.warm/hot. Hot is "rep takes over".
 */
function buildTouches(content: any): Touch[] {
  const touches: Touch[] = [];
  const cs = content?.channelStrategy || {};

  // ----- Cold -----
  const coldDays: number[] = Array.isArray(content?.coldOutreach?.frequencyDays)
    ? content.coldOutreach.frequencyDays
    : [1, 3, 7];
  const coldChannels: Channel[] =
    Array.isArray(cs.cold) && cs.cold.length > 0
      ? (cs.cold as Channel[])
      : (['email', 'linkedin'] as Channel[]);
  coldDays.forEach((day, i) => {
    touches.push({
      day,
      stage: 'cold',
      channel: coldChannels[i % coldChannels.length],
      label: `Day ${day}`,
    });
  });

  // ----- Warming -----
  const warmInterval: number = content?.warmEngaged?.proactiveIntervalDays || 5;
  const lastCold = coldDays[coldDays.length - 1] || 7;
  const warmingChannels: Channel[] =
    Array.isArray(cs.warming) && cs.warming.length > 0
      ? (cs.warming as Channel[])
      : (['email', 'linkedin'] as Channel[]);
  // 2 warming touches by default
  for (let i = 0; i < 2; i++) {
    const day = lastCold + warmInterval * (i + 1);
    touches.push({
      day,
      stage: 'warming',
      channel: warmingChannels[i % warmingChannels.length],
      label: `Day ${day}`,
    });
  }

  // ----- Warm -----
  const warmChannels: Channel[] =
    Array.isArray(cs.warm) && cs.warm.length > 0
      ? (cs.warm as Channel[])
      : (['email', 'whatsapp'] as Channel[]);
  const warmStartDay = touches[touches.length - 1].day + warmInterval;
  touches.push({
    day: warmStartDay,
    stage: 'warm',
    channel: warmChannels[0],
    label: `Day ${warmStartDay}`,
  });

  // ----- Hot -----
  const hotChannels: Channel[] =
    Array.isArray(cs.hot) && cs.hot.length > 0
      ? (cs.hot as Channel[])
      : (['whatsapp', 'calling'] as Channel[]);
  const hotStartDay = warmStartDay + Math.max(2, Math.round(warmInterval / 2));
  touches.push({
    day: hotStartDay,
    stage: 'hot',
    channel: hotChannels[0],
    label: `Day ${hotStartDay}`,
  });

  return touches;
}
