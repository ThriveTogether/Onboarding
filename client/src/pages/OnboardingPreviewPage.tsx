import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Search,
  Target,
  Mail,
  Linkedin,
  MessageCircle,
  Phone,
  Sparkles,
  CheckCircle,
  ArrowRight,
  Clock,
  User as UserIcon,
  Snowflake,
  Zap,
  Flame,
  Star,
  Headphones,
  GraduationCap,
  X,
  Check,
} from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import PhaseProgress from '../components/PhaseProgress';
import Card from '../components/Card';
import Button from '../components/Button';
import WizardBackLink from '../components/WizardBackLink';

type Channel = 'email' | 'linkedin' | 'whatsapp' | 'calling';

interface Lead {
  _id: string;
  contactName: string;
  contactTitle: string;
  targetCompany: string;
  industry: string;
  city: string;
  matchPercent: number;
  founderFeedback: 'pursue' | 'existing' | 'skip' | null;
  intel?: { recommendedApproach?: string; relevanceReason?: string };
}

interface Company {
  _id: string;
  companyName: string;
  channelStrategy?: Record<string, Channel[]>;
  stageThresholds?: Record<string, [number, number]>;
  messageTemplates?: Array<{
    stage: 'cold' | 'warming' | 'hot';
    channel: Channel;
    body: string;
    subject?: string;
  }>;
}

const CHANNEL_META: Record<Channel, { label: string; icon: any; color: string }> = {
  email: { label: 'Email', icon: Mail, color: '#2D5BD9' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: '#16A34A' },
  calling: { label: 'Call', icon: Phone, color: '#FF6F61' },
};

const STAGE_META = {
  cold: { label: 'Cold', icon: Snowflake, color: '#3FB6FF' },
  warming: { label: 'Warming', icon: Zap, color: '#9D6BFF' },
  warm: { label: 'Warm', icon: Star, color: '#F4A02E' },
  hot: { label: 'Hot', icon: Flame, color: '#FF6F61' },
  ready: { label: 'Ready', icon: CheckCircle, color: '#16A34A' },
} as const;

interface TimelineEvent {
  day: number;
  channel: Channel;
  stage: 'cold' | 'warming' | 'warm' | 'hot' | 'ready';
  title: string;
  detail: string;
}

export default function OnboardingPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pickedLeadId, setPickedLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      onboardingAPI.state(id),
      onboardingAPI.listLeads(id),
    ])
      .then(([state, leadsRes]) => {
        setCompany(state.data.company || null);
        const all: Lead[] = leadsRes.data.leads || [];
        // Prefer "Love it — pursue" leads. If none, fall back to top-match.
        const pursued = all.filter((l) => l.founderFeedback === 'pursue');
        const ranked = pursued.length > 0 ? pursued : all.slice(0, 5);
        setLeads(ranked);
        if (ranked.length > 0) setPickedLeadId(ranked[0]._id);
      })
      .finally(() => setLoading(false));

    // Stamp the preview as seen — so resume-routing won't bring them back here
    // on next login (they can still navigate manually if they want a refresher).
    onboardingAPI.markPreviewSeen(id).catch(() => {
      /* non-blocking — telemetry only */
    });
  }, [id]);

  const pickedLead = leads.find((l) => l._id === pickedLeadId) || leads[0] || null;

  const timeline: TimelineEvent[] = useMemo(() => {
    if (!company || !pickedLead) return [];
    return buildLeadTimeline(company, pickedLead);
  }, [company, pickedLead]);

  if (loading) {
    return (
      <div className="mp-app-shell">
        <div className="mp-wizard mp-wizard--wide">
          <Card padding="lg" className="mp-text-center">
            <p className="mp-muted">Loading your preview…</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard mp-wizard--wide" style={{ maxWidth: 1100 }}>
        <WizardBackLink to={id ? `/onboarding/docs/${id}` : '/onboarding'} label="Back to strategy docs" />
        <PhaseProgress phase="phase_b" step="b3" />

        <div className="mp-text-center" style={{ marginBottom: 24 }}>
          <div className="mp-brand-header__overline">Phase B — Make my AI smart</div>
          <h2 className="mp-h2" style={{ margin: '6px 0 4px' }}>
            See your AI in action
          </h2>
          <p className="mp-body-sm mp-muted">
            A quick preview before you go live. First, how the system works end-to-end.
            Then, exactly what it'll do for one of your real leads.
          </p>
        </div>

        {/* ─── THE PLAYBOOK — 5-stage numbered process (deck-inspired) ── */}
        <div className="mp-deck-section">
          <div className="mp-deck-section__overline">The Playbook</div>
          <h3 className="mp-deck-section__title">
            Every lead runs through the same 7-stage system.
          </h3>
          <p className="mp-deck-section__lede">
            Stages 1–4 run on autopilot. Stage 5 is your rep — but they're never alone:
            Stages 6 + 7 are AI coaching during and after the call, plus simulated practice between calls.
          </p>

          <div className="mp-deck-stages">
            {HOW_IT_WORKS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="mp-deck-stage">
                  <div className="mp-deck-stage__num" style={{ color: step.color }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div
                    className="mp-deck-stage__icon"
                    style={{ background: step.color, color: '#fff' }}
                  >
                    <Icon size={16} strokeWidth={2.4} />
                  </div>
                  <div className="mp-deck-stage__title">{step.title.toUpperCase()}</div>
                  <div className="mp-deck-stage__sub">{step.tagline}</div>
                  <div className="mp-deck-stage__body">{step.body}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── THE TRANSFORMATION — paired before → after rows ────────── */}
        <div className="mp-deck-section">
          <div className="mp-deck-section__overline">The Transformation</div>
          <h3 className="mp-deck-section__title">
            Same team. Same leads. Very different results.
          </h3>
          <p className="mp-deck-section__lede">
            Six concrete shifts you'll feel in the first 30 days.
          </p>

          <div className="mp-transform">
            {BEFORE_AFTER.map((pair, i) => (
              <div key={i} className="mp-transform__row">
                <div className="mp-transform__cat">{pair.category}</div>
                <div className="mp-transform__before">
                  <span className="mp-transform__mark mp-transform__mark--x">
                    <X size={11} strokeWidth={3} />
                  </span>
                  <span className="mp-transform__txt">{pair.before}</span>
                </div>
                <div className="mp-transform__arrow" aria-hidden>
                  <ArrowRight size={14} />
                </div>
                <div className="mp-transform__after">
                  <span className="mp-transform__mark mp-transform__mark--check">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span className="mp-transform__txt">{pair.after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── THE NUMBERS — outcome metrics (big numerals) ──────────── */}
        <div className="mp-deck-section">
          <div className="mp-deck-section__overline">What changes for you</div>
          <h3 className="mp-deck-section__title">
            What real customers see in the first 90 days.
          </h3>

          <div className="mp-deck-metrics">
            {OUTCOME_METRICS.map((m, i) => (
              <div key={i} className="mp-deck-metric">
                <div className="mp-deck-metric__num" style={{ color: m.color }}>{m.value}</div>
                <div className="mp-deck-metric__label">{m.label}</div>
                <div className="mp-deck-metric__sub">{m.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Lead timeline preview ──────────────────────────────────── */}
        <Card padding="lg">
          <div className="mp-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
            <div>
              <h3 className="mp-h4" style={{ margin: 0 }}>See it on a real lead</h3>
              <p className="mp-body-sm mp-muted" style={{ margin: '4px 0 0' }}>
                Pick one of the leads you marked "pursue" — we'll show day-by-day exactly what your AI
                will do for them.
              </p>
            </div>
          </div>

          {leads.length === 0 ? (
            <p className="mp-muted">No leads yet — go back to Phase A to hunt some.</p>
          ) : (
            <>
              {/* Lead picker chips */}
              <div className="mp-lead-picker">
                {leads.map((l) => (
                  <button
                    key={l._id}
                    type="button"
                    className={`mp-lead-picker__chip ${l._id === pickedLeadId ? 'mp-lead-picker__chip--active' : ''}`}
                    onClick={() => setPickedLeadId(l._id)}
                  >
                    <UserIcon size={12} />
                    <strong>{l.contactName}</strong>
                    <span className="mp-meta">· {l.targetCompany}</span>
                    <span className="mp-tag mp-tag--coral" style={{ fontSize: 10, marginLeft: 4 }}>
                      {l.matchPercent}%
                    </span>
                  </button>
                ))}
              </div>

              {pickedLead && (
                <div className="mp-lead-timeline">
                  <div className="mp-lead-timeline__header">
                    <Sparkles size={14} className="mp-lead-timeline__icon" />
                    <span>
                      AI plan for <strong>{pickedLead.contactName}</strong> at{' '}
                      <strong>{pickedLead.targetCompany}</strong>
                    </span>
                  </div>

                  <div className="mp-lead-timeline__rail">
                    {timeline.map((ev, i) => {
                      const ChannelIcon = CHANNEL_META[ev.channel].icon;
                      const stageMeta = STAGE_META[ev.stage];
                      const StageIcon = stageMeta.icon;
                      return (
                        <React.Fragment key={i}>
                          <div className="mp-lead-timeline__event">
                            <div
                              className="mp-lead-timeline__day"
                              style={{ background: stageMeta.color }}
                            >
                              <span className="mp-lead-timeline__day-num">D{ev.day}</span>
                              <StageIcon size={10} strokeWidth={2.5} className="mp-lead-timeline__day-stage" />
                            </div>
                            <div className="mp-lead-timeline__card">
                              <div className="mp-lead-timeline__card-head">
                                <ChannelIcon size={12} style={{ color: CHANNEL_META[ev.channel].color }} />
                                <span className="mp-lead-timeline__card-title">{ev.title}</span>
                              </div>
                              <p className="mp-lead-timeline__card-body">{ev.detail}</p>
                            </div>
                          </div>
                          {i < timeline.length - 1 && (
                            <div className="mp-lead-timeline__connector" aria-hidden>
                              <Clock size={10} />
                              <span>{timeline[i + 1].day - ev.day}d wait</span>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        <div className="mp-row" style={{ justifyContent: 'flex-end', marginTop: 24, gap: 12 }}>
          <Button variant="ghost" onClick={() => navigate(`/onboarding/docs/${id}`)}>
            ← Back to docs
          </Button>
          <Button size="lg" onClick={() => navigate(`/onboarding/launch/${id}`)}>
            Looks good — invite reps + launch →
          </Button>
        </div>
      </div>
    </div>
  );
}

const HOW_IT_WORKS = [
  {
    icon: Search,
    color: '#3FB6FF',
    title: 'Find',
    tagline: 'Real companies, not lists',
    body: 'AI searches Google + LinkedIn for real firms matching your ICP. Verified websites, real LinkedIn profiles, no hallucination.',
  },
  {
    icon: Target,
    color: '#9D6BFF',
    title: 'Score',
    tagline: 'Categorise before you act',
    body: 'Every lead scored 0–100 against your weights. Stage assigned automatically — Cold, Warming, Warm, Hot, Ready.',
  },
  {
    icon: Sparkles,
    color: '#F4A02E',
    title: 'Reach',
    tagline: 'Reference their world, not yours',
    body: 'AI drafts each message in your voice using your saved templates. Sends on the channel you picked for that stage.',
  },
  {
    icon: Zap,
    color: '#FF6F61',
    title: 'Nurture',
    tagline: 'Right message, right time',
    body: 'Replies, opens, clicks push the score up. AI auto-progresses leads through the funnel — no manual steps.',
  },
  {
    icon: CheckCircle,
    color: '#16A34A',
    title: 'Hand off',
    tagline: 'Rep takes the call — warm, not cold',
    body: 'At "Ready", your rep gets a call-prep brief with research + lead history. The lead is already warm; the call feels natural.',
  },
  {
    icon: Headphones,
    color: '#2D5BD9',
    title: 'Coach',
    tagline: 'Real-time + post-call',
    body: 'AI listens, prompts the rep on objections + next steps live, and grades the call afterward — coaching moments flagged.',
  },
  {
    icon: GraduationCap,
    color: '#B5811A',
    title: 'Improve',
    tagline: 'Practice on simulated leads',
    body: 'Between live calls, reps practice on AI-simulated leads tuned to their actual weak spots. Every session feeds back into the playbook.',
  },
];

const BEFORE_AFTER = [
  {
    category: 'Speed',
    before: 'Leads called 3–5 days late — already cold',
    after: 'AI opens the conversation within minutes',
  },
  {
    category: 'Context',
    before: 'Rep walks in blind — no research, no history',
    after: 'Pre-call brief: company research + lead history',
  },
  {
    category: 'Cadence',
    before: '"Just checking in" follow-ups go silent',
    after: 'Context-triggered messages on the right channel',
  },
  {
    category: 'Coaching',
    before: 'Manager hears about a bad call days later',
    after: 'Live AI prompts during the call, scorecard after',
  },
  {
    category: 'Practice',
    before: 'Reps repeat the same mistake on every call',
    after: 'AI-simulated leads tuned to each rep\'s weak spots',
  },
  {
    category: 'Recovery',
    before: 'Old leads rot in spreadsheets',
    after: 'Re-engagement runs auto until ready or pause',
  },
];

const OUTCOME_METRICS = [
  { value: '100×', color: '#3FB6FF', label: 'Cheaper leads', detail: 'AI-discovered prospects vs. paid list providers' },
  { value: '6 wks', color: '#9D6BFF', label: 'Rep ramp time', detail: 'New rep productive in 6 weeks vs 6 months' },
  { value: '47%', color: '#F4A02E', label: 'Pipeline velocity', detail: 'Faster movement through your funnel stages' },
  { value: '70%', color: '#16A34A', label: 'Less admin work', detail: 'Reps spend time selling, not data-entry' },
];

/**
 * Build a 6-event timeline showing how the AI nurtures one lead through all
 * five stages. Uses the company's confirmed channelStrategy (per-stage
 * channel list) and the founder's saved message templates for the body
 * preview. Fully simulated — assumes positive engagement at each step.
 */
function buildLeadTimeline(company: Company, lead: Lead): TimelineEvent[] {
  const cs = company.channelStrategy || {};
  const templates = company.messageTemplates || [];

  const firstChannel = (stage: string, fallback: Channel): Channel => {
    const list = (cs[stage] || []) as Channel[];
    return list[0] || fallback;
  };

  const findTpl = (stage: 'cold' | 'warming' | 'hot') =>
    templates.find((t) => t.stage === stage) || null;

  const events: TimelineEvent[] = [];

  // Day 1 — Cold first touch
  const coldChannel = firstChannel('cold', 'email');
  const coldTpl = findTpl('cold');
  events.push({
    day: 1,
    channel: coldChannel,
    stage: 'cold',
    title: `${CHANNEL_META[coldChannel].label} — first touch`,
    detail: coldTpl
      ? `AI sends your saved cold ${CHANNEL_META[coldChannel].label} template, personalised for ${lead.contactName}'s pain signals.`
      : `Cold outreach via ${CHANNEL_META[coldChannel].label} using the AI's draft (you can edit anytime).`,
  });

  // Day 4 — Lead opens / clicks → warming
  const warmingChannel = firstChannel('warming', coldChannel);
  events.push({
    day: 4,
    channel: warmingChannel,
    stage: 'warming',
    title: `${lead.contactName} opens the ${CHANNEL_META[coldChannel].label}`,
    detail: `Score crosses your "Warming" threshold automatically. AI queues a follow-up via ${CHANNEL_META[warmingChannel].label}.`,
  });

  // Day 8 — Warming nudge
  events.push({
    day: 8,
    channel: warmingChannel,
    stage: 'warming',
    title: `${CHANNEL_META[warmingChannel].label} — value follow-up`,
    detail: `AI sends the warming follow-up — case study or quick question, on the channel they engage with most.`,
  });

  // Day 14 — Lead replies → warm
  const warmChannel = firstChannel('warm', warmingChannel);
  events.push({
    day: 14,
    channel: warmChannel,
    stage: 'warm',
    title: `${lead.contactName} replies asking for details`,
    detail: `Score jumps. AI moves to "Warm". Switches to ${CHANNEL_META[warmChannel].label} for richer conversation.`,
  });

  // Day 20 — Hot signal (pricing / timeline)
  const hotChannel = firstChannel('hot', 'whatsapp');
  events.push({
    day: 20,
    channel: hotChannel,
    stage: 'hot',
    title: `Pricing question detected`,
    detail: `AI tags the lead as Hot. ${CHANNEL_META[hotChannel].label} message goes out asking for a 15-min call to walk through specifics.`,
  });

  // Day 22 — Rep takes over
  const readyChannel = firstChannel('ready', 'calling');
  events.push({
    day: 22,
    channel: readyChannel,
    stage: 'ready',
    title: `Rep handoff — ${CHANNEL_META[readyChannel].label}`,
    detail: `Score above your "Ready" threshold. ${lead.contactName} appears in your morning playbook with a full prep brief. You take the meeting.`,
  });

  return events;
}
