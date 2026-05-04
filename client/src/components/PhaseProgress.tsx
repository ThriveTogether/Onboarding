import React from 'react';

type Phase = 'phase_a' | 'bridge' | 'phase_b' | 'complete';

interface PhaseProgressProps {
  phase: Phase;
  step?: string;
}

const STEPS = [
  { key: 'a1', label: 'Company basics' },
  { key: 'a2', label: 'Target profile' },
  { key: 'a3', label: 'Lead preview' },
  { key: 'b1', label: 'Nurture' },
  { key: 'b2', label: 'Scoring' },
  { key: 'b3', label: 'Brand voice' },
];

export default function PhaseProgress({ phase, step }: PhaseProgressProps) {
  const idx = STEPS.findIndex((s) => s.key === step);
  const complete = phase === 'complete';

  const label =
    phase === 'phase_a'
      ? 'Phase A — get me selling'
      : phase === 'phase_b' || phase === 'bridge'
      ? 'Phase B — make my AI smart'
      : 'Complete';

  return (
    <div className="mp-phase-progress">
      <div className="mp-phase-progress__header">
        <span className="mp-phase-progress__label">{label}</span>
        {idx >= 0 && <span>Step {idx + 1} of {STEPS.length}</span>}
      </div>
      <div className="mp-phase-progress__bars">
        {STEPS.map((s, i) => {
          const done = complete || (idx >= 0 && i < idx);
          const active = i === idx;
          const cls = `mp-phase-progress__bar${
            done ? ' mp-phase-progress__bar--done' : active ? ' mp-phase-progress__bar--active' : ''
          }`;
          return <div key={s.key} className={cls} title={s.label} />;
        })}
      </div>
    </div>
  );
}
