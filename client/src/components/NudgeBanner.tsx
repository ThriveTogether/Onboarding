import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboardingAPI } from '../api/onboarding';

interface NudgeBannerProps {
  companyId: string;
  leadCount: number;
}

const DIAGNOSTIC_OPTIONS = [
  { key: 'too_many_steps', label: 'Too many steps' },
  { key: 'not_sure_strategy', label: 'Not sure about the strategy' },
  { key: 'will_do_later', label: 'Will do it later' },
  { key: 'need_help', label: 'Need help' },
];

export default function NudgeBanner({ companyId, leadCount }: NudgeBannerProps) {
  const navigate = useNavigate();
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [responded, setResponded] = useState<string | null>(null);

  const handleDiagnostic = async (response: string) => {
    try {
      const { data } = await onboardingAPI.diagnostic(companyId, response);
      setResponded(data.intervention.explanation);
      setTimeout(() => {
        if (data.intervention.route) navigate(data.intervention.route);
      }, 1500);
    } catch (e) {
      console.error('diagnostic failed', e);
    }
  };

  return (
    <div className="mp-nudge">
      <div className="mp-nudge__overline">Pipeline waiting</div>
      <h3 className="mp-nudge__title">
        Your {leadCount} leads are in the pipeline — but your AI doesn't know how to talk to them yet.
      </h3>
      <p className="mp-nudge__body">10 minutes to fix that.</p>

      {responded ? (
        <p className="mp-body-sm" style={{ color: 'var(--mp-coral)', marginBottom: 0 }}>{responded}</p>
      ) : showDiagnostic ? (
        <div>
          <p className="mp-body-sm" style={{ color: 'rgba(255,255,255,0.82)', marginBottom: 8 }}>
            What stopped you?
          </p>
          <div className="mp-nudge__diagnostic">
            {DIAGNOSTIC_OPTIONS.map((o) => (
              <button key={o.key} className="mp-nudge__option" onClick={() => handleDiagnostic(o.key)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="mp-btn mp-btn--accent" onClick={() => navigate('/onboarding/docs')}>
            Continue setup
          </button>
          <button className="mp-nudge__option" onClick={() => setShowDiagnostic(true)}>
            What stopped me?
          </button>
        </div>
      )}
    </div>
  );
}
