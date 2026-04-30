import React, { useEffect, useRef, useState } from 'react';
import authedApi from '../api/auth';
import { Brain, Check, X, Circle, SkipForward, AlertTriangle, Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-react';

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
  // Auto-open evidence on the active step so the user sees what's happening live;
  // collapse on completed steps to keep the trail scannable.
  const [evidenceOpen, setEvidenceOpen] = useState(step.status === 'active');
  const showEvidenceToggle = step.evidence.length > 0;

  return (
    <div className={`mp-thinking-step mp-thinking-step--${step.status}`}>
      <div className="mp-thinking-step__icon">{icon}</div>
      <div className="mp-thinking-step__body">
        <div className="mp-thinking-step__label">
          <span>{step.label}</span>
          {duration && <span className="mp-thinking-step__duration">{duration}</span>}
        </div>
        {step.detail && <p className="mp-thinking-step__detail">{step.detail}</p>}
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
              <span>Evidence ({step.evidence.length})</span>
              {evidenceOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {evidenceOpen && (
              <div className="mp-thinking-step__evidence" style={{ marginTop: 8 }}>
                {step.evidence.map((e, i) => (
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
