import React, { useEffect, useRef, useState } from 'react';
import authedApi from '../api/auth';
import { Brain, Check, X, Circle, SkipForward, AlertTriangle, Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-react';

// Founder-language overrides for backend reasoning step labels. The backend
// uses internal labels (matched by string in updateStep calls); we display the
// friendly version to founders, plus rotating sub-thoughts on long-running
// steps so the wait feels intentional, not stuck.
//
// Match is by exact label OR by prefix (for steps with templated names like
// "Load b2b_saas vertical template"). Order matters — first match wins.
type StepDisplay = { label: string; detail?: string; thoughts?: string[] };
const STEP_OVERRIDES: Array<{ match: string | RegExp; display: StepDisplay }> = [
  // ----- ICP prediction (targetProfilePredictor) -----
  {
    match: 'Search for LinkedIn company page',
    display: {
      label: 'Reading your LinkedIn page',
      detail: 'What you say about yourselves out there.',
      thoughts: ['Pulling your bio and tagline…', 'Checking employee count and HQ…'],
    },
  },
  {
    match: 'Search for company website signals',
    display: {
      label: 'Reading your website',
      detail: 'Your positioning and the problems you say you solve.',
      thoughts: [
        'Looking at your homepage…',
        'Scanning your features and product pages…',
        'Hunting for customer logos and case studies…',
      ],
    },
  },
  {
    match: 'Check website freshness',
    display: {
      label: 'Checking how current your website is',
      detail: "If it's out of date, we'll ask you to upload a brochure instead.",
      thoughts: [
        'Looking for a "Last updated" timestamp…',
        'Reading your copyright year…',
        'Spotting recent post dates if any…',
      ],
    },
  },
  {
    match: 'Check public sources for news + funding',
    display: {
      label: 'Checking what others say about you',
      detail: 'Recent press, funding mentions, and news.',
      thoughts: ['Searching news mentions…', 'Looking for funding announcements…'],
    },
  },
  {
    match: /^Load .* vertical template$/,
    display: {
      label: 'Pulling patterns from companies like yours',
      detail: "What's worked for similar businesses in your space.",
    },
  },
  {
    match: 'Draft target profile with Claude',
    display: {
      label: 'Sketching your ideal customer',
      detail: 'Combining your story with patterns that win in your space.',
      thoughts: [
        'Picking the right industry slice…',
        'Sizing them right — not too big, not too small…',
        'Pinpointing who actually decides…',
        'Finding the pain that makes them buy…',
      ],
    },
  },
  {
    match: 'Critique + regenerate if needed',
    display: {
      label: 'Pressure-testing the draft',
      detail: 'Would a real founder buy this? Sharpening if not.',
      thoughts: [
        'Checking if it\'s specific enough…',
        'Flagging vague language…',
        'Re-running if anything\'s generic…',
      ],
    },
  },
  {
    match: 'Finalize ICP fields',
    display: {
      label: 'Locking in the answer',
      detail: 'Industry, size, geography, who decides, what hurts.',
    },
  },

  // ----- Lead hunt (claudeLeadHunter) -----
  {
    match: 'Load approved target profile',
    display: {
      label: 'Re-reading your locked ICP',
      detail: 'The customer profile you just chose.',
    },
  },
  {
    match: 'Load research context',
    display: {
      label: 'Pulling your story back up',
      detail: 'What you say plus what others say about you.',
    },
  },
  {
    match: /^Build ICP brief for /,
    display: {
      label: 'Translating your ICP into a hunt',
      detail: 'Turning your filters into real-world search terms.',
    },
  },
  {
    match: 'Ask Claude for real companies matching ICP',
    display: {
      label: 'Hunting companies that match',
      detail: 'Real firms in your industry, your size range, your geography.',
      thoughts: [
        'Looking through companies in your geography…',
        'Checking who\'s at the right stage to buy…',
        'Cross-referencing pain signals against your ICP…',
        'Drafting a shortlist of likely buyers…',
        'Finding the right person at each company…',
        'Validating titles and seniority…',
      ],
    },
  },
  {
    match: 'Parse and validate response',
    display: {
      label: 'Filtering out duplicates and noise',
      detail: 'Keeping only the leads worth your time.',
    },
  },
  {
    match: 'Infer department + seniority per contact',
    display: {
      label: 'Identifying who actually decides',
      detail: 'Mapping titles to real decision-making power.',
      thoughts: [
        'Reading each title…',
        'Flagging buyers vs. influencers…',
      ],
    },
  },
  {
    match: 'Score each lead against framework',
    display: {
      label: 'Scoring each match',
      detail: 'How tight a fit they are, on a 0–100 scale.',
      thoughts: [
        'Weighing company fit…',
        'Adding engagement signals…',
        'Layering in intent signals…',
        'Adjusting for recency…',
      ],
    },
  },
  {
    match: 'Save leads to pipeline',
    display: {
      label: 'Adding them to your pipeline',
      detail: 'Ready for you to review.',
    },
  },
];

function lookupOverride(label: string): StepDisplay | null {
  for (const { match, display } of STEP_OVERRIDES) {
    if (typeof match === 'string' ? match === label : match.test(label)) return display;
  }
  return null;
}

// Hide internal evidence tags that leak implementation detail (model names,
// prompt names) — founders don't need to see these.
const EVIDENCE_HIDE_PATTERNS = [
  /^Claude\s+(Sonnet|Haiku|Opus)/i,
  /\bonboarding-[a-z-]+\s+prompt$/i,
  /\bprompt$/i,
];
function filterEvidence(evidence: string[]): string[] {
  return evidence.filter((e) => !EVIDENCE_HIDE_PATTERNS.some((re) => re.test(e)));
}

export interface ReasoningStep {
  id: string;
  label: string;
  detail: string;
  evidence: string[];
  status: 'pending' | 'active' | 'done' | 'skipped' | 'error';
  startedAt: string | null;
  completedAt: string | null;
  output: string;
  durationMs: number;
}

export interface ReasoningSession {
  _id: string;
  operation: string;
  status: 'active' | 'done' | 'error';
  steps: ReasoningStep[];
  result: Record<string, any>;
  errorMessage: string;
  startedAt: string;
  completedAt: string | null;
}

interface ThinkingPanelProps {
  sessionId: string;
  title?: string;
  subtitle?: string;
  variant?: 'inline' | 'floating' | 'compact';
  onDone?: (session: ReasoningSession) => void;
  onError?: (session: ReasoningSession) => void;
  pollMs?: number;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export default function ThinkingPanel({
  sessionId,
  title = 'Thinking…',
  subtitle = 'Claude is reasoning through this with the evidence shown.',
  variant = 'inline',
  onDone,
  onError,
  pollMs = 900,
  dismissible = false,
  onDismiss,
}: ThinkingPanelProps) {
  const [session, setSession] = useState<ReasoningSession | null>(null);
  const [tick, setTick] = useState(0);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);
  onDoneRef.current = onDone;
  onErrorRef.current = onError;

  // Poll the session
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let fired = false;

    const poll = async () => {
      try {
        const { data } = await authedApi.get(`/onboarding/reasoning/${sessionId}`);
        if (cancelled) return;
        setSession(data.session);
        if (data.session.status === 'done' && !fired) {
          fired = true;
          onDoneRef.current?.(data.session);
        } else if (data.session.status === 'error' && !fired) {
          fired = true;
          onErrorRef.current?.(data.session);
        }
      } catch (err) {
        // silent
      }
    };

    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, pollMs]);

  // Tick for live duration display on active steps
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);
  void tick; // used only to force re-render

  if (!session) {
    return (
      <div className={`mp-thinking mp-thinking--${variant}`}>
        <div className="mp-thinking__header">
          <div className="mp-thinking__icon"><Brain size={20} strokeWidth={2} /></div>
          <div style={{ flex: 1 }}>
            <h3 className="mp-thinking__title">{title}</h3>
            <p className="mp-thinking__subtitle">Starting reasoning session…</p>
          </div>
        </div>
      </div>
    );
  }

  const doneCount = session.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const totalCount = session.steps.length;

  return (
    <div className={`mp-thinking mp-thinking--${variant}`}>
      <div className="mp-thinking__header">
        <div className="mp-thinking__icon"><Brain size={20} strokeWidth={2} /></div>
        <div style={{ flex: 1 }}>
          <h3 className="mp-thinking__title">{title}</h3>
          <p className="mp-thinking__subtitle">
            {subtitle} · {doneCount}/{totalCount} steps
            {session.status === 'done' && ' · done'}
            {session.status === 'error' && ' · errored'}
          </p>
        </div>
        {dismissible && onDismiss && (
          <button onClick={onDismiss} style={{ color: 'var(--fg-3)', padding: 4 }} aria-label="Dismiss">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="mp-thinking__steps">
        {session.steps.map((step) => (
          <StepRow key={step.id} step={step} sessionActive={session.status === 'active'} />
        ))}
      </div>

      {session.status === 'error' && session.errorMessage && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: 'var(--mp-error-bg)',
            color: '#991B1B',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--fs-sm)',
          }}
        >
          <strong>Reasoning stopped.</strong> {session.errorMessage}
        </div>
      )}
    </div>
  );
}

function StepRow({ step, sessionActive }: { step: ReasoningStep; sessionActive: boolean }) {
  const icon = iconFor(step.status);
  const duration = formatDuration(step, sessionActive);
  const override = lookupOverride(step.label);
  const displayLabel = override?.label || step.label;
  const displayDetail = override?.detail || step.detail;
  const visibleEvidence = filterEvidence(step.evidence);
  // Auto-open evidence on the active step so the user sees what's happening live;
  // collapse on completed steps to keep the trail scannable.
  const [evidenceOpen, setEvidenceOpen] = useState(step.status === 'active');
  const showEvidenceToggle = visibleEvidence.length > 0;

  // Rotating sub-thoughts on long-running active steps. Cycle every 4s while
  // the step is active so the wait feels intentional, not stuck.
  const thoughts = override?.thoughts;
  const [thoughtIdx, setThoughtIdx] = useState(0);
  useEffect(() => {
    if (!thoughts || thoughts.length === 0 || step.status !== 'active') return;
    const id = setInterval(() => setThoughtIdx((i) => (i + 1) % thoughts.length), 4000);
    return () => clearInterval(id);
  }, [thoughts, step.status]);
  const activeThought = thoughts && step.status === 'active' ? thoughts[thoughtIdx] : null;

  return (
    <div className={`mp-thinking-step mp-thinking-step--${step.status}`}>
      <div className="mp-thinking-step__icon">{icon}</div>
      <div className="mp-thinking-step__body">
        <div className="mp-thinking-step__label">
          <span>{displayLabel}</span>
          {duration && <span className="mp-thinking-step__duration">{duration}</span>}
        </div>
        {displayDetail && <p className="mp-thinking-step__detail">{displayDetail}</p>}
        {activeThought && (
          <p
            key={thoughtIdx}
            className="mp-thinking-step__detail"
            style={{
              fontStyle: 'italic',
              color: 'var(--fg-2)',
              marginTop: 4,
              animation: 'mp-fade-in 400ms var(--ease-standard)',
            }}
          >
            {activeThought}
          </p>
        )}
        {step.output && (step.status === 'done' || step.status === 'active' || step.status === 'error') && (
          <div className="mp-thinking-step__output">{step.output}</div>
        )}
        {showEvidenceToggle && (
          <div className="mp-evidence mp-evidence--compact" style={{ marginTop: 6 }}>
            <button
              type="button"
              className="mp-evidence__toggle"
              onClick={() => setEvidenceOpen((v) => !v)}
              aria-expanded={evidenceOpen}
            >
              <FileText size={12} />
              <span>Evidence ({visibleEvidence.length})</span>
              {evidenceOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {evidenceOpen && (
              <div className="mp-thinking-step__evidence" style={{ marginTop: 8 }}>
                {visibleEvidence.map((e, i) => (
                  <span key={i} className="mp-thinking-step__evidence-chip">{e}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function iconFor(status: ReasoningStep['status']) {
  switch (status) {
    case 'pending': return <Circle size={12} strokeWidth={2.5} />;
    case 'active': return <Loader2 size={12} strokeWidth={2.5} className="mp-spin" />;
    case 'done': return <Check size={12} strokeWidth={2.5} />;
    case 'skipped': return <SkipForward size={12} strokeWidth={2.5} />;
    case 'error': return <AlertTriangle size={12} strokeWidth={2.5} />;
  }
}

function formatDuration(step: ReasoningStep, sessionActive: boolean): string | null {
  if (step.status === 'pending') return null;
  if (step.status === 'active' && step.startedAt) {
    const ms = Date.now() - new Date(step.startedAt).getTime();
    return formatMs(ms) + (sessionActive ? '…' : '');
  }
  if (step.durationMs > 0) return formatMs(step.durationMs);
  return null;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
