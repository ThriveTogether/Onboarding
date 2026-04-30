import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import PhaseProgress from '../components/PhaseProgress';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import WizardBackLink from '../components/WizardBackLink';

export default function OnboardingLaunchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [successMetric, setSuccessMetric] = useState('');
  const [placeholder, setPlaceholder] = useState('e.g., Reps handle 2x more leads without hiring');
  const [reps, setReps] = useState<Array<{ email: string; name: string }>>([{ email: '', name: '' }]);
  const [inviteLinks, setInviteLinks] = useState<Array<{ email: string; inviteLink: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    onboardingAPI.state(id).then(({ data }) => {
      if (data.company?.vertical === 'edtech_b2c') {
        setPlaceholder('e.g., Double counsellor-to-enrollment conversion per month');
      } else if (data.company?.vertical === 'b2b_saas') {
        setPlaceholder('e.g., Grow SQLs per rep by 40% without hiring');
      }
    });
  }, [id]);

  const addRep = () => setReps([...reps, { email: '', name: '' }]);
  const updateRep = (i: number, key: 'email' | 'name', value: string) =>
    setReps(reps.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  const removeRep = (i: number) => setReps(reps.filter((_, idx) => idx !== i));

  const handleLaunch = async () => {
    if (!id) return;
    if (!successMetric.trim()) {
      setError('Success metric is required — this is your renewal anchor');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onboardingAPI.saveSuccessMetric(id, successMetric);

      const validEmails = reps
        .filter((r) => r.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()))
        .map((r) => ({ email: r.email.trim(), name: r.name.trim() }));
      if (validEmails.length > 0) {
        const { data } = await onboardingAPI.inviteReps(id, validEmails);
        setInviteLinks(data.invites.map((i: any) => ({ email: i.email, inviteLink: i.inviteLink })));
      }

      await onboardingAPI.launch(id);
      navigate(`/onboarding/complete/${id}`);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Launch failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard">
        <WizardBackLink to={id ? `/onboarding/docs/${id}` : '/onboarding'} label="Back to strategy docs" />
        <PhaseProgress phase="phase_b" step="b4" />

        <div className="mp-text-center" style={{ marginBottom: 24 }}>
          <h2 className="mp-h2" style={{ margin: 0 }}>Almost there.</h2>
          <p className="mp-body-sm mp-muted" style={{ marginTop: 6 }}>
            Two more things before your sales engine goes live.
          </p>
        </div>

        <Card padding="lg">
          <section>
            <div className="mp-overline" style={{ marginBottom: 8 }}>1. What does success look like in 90 days?</div>
            <Input
              value={successMetric}
              onChange={(e) => setSuccessMetric(e.target.value)}
              placeholder={placeholder}
            />
            <p className="mp-help">This becomes your renewal dashboard metric. We'll track it live.</p>
          </section>

          <div className="mp-divider" style={{ margin: '32px 0' }} />

          <section>
            <div className="mp-overline" style={{ marginBottom: 8 }}>2. Invite your reps (optional)</div>
            <div className="mp-stack" style={{ '--gap': 'var(--space-2)' } as any}>
              {reps.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <Input
                    type="email"
                    placeholder="rep@example.com"
                    value={r.email}
                    onChange={(e) => updateRep(i, 'email', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Input
                    placeholder="Name (optional)"
                    value={r.name}
                    onChange={(e) => updateRep(i, 'name', e.target.value)}
                    style={{ width: 180 }}
                  />
                  {reps.length > 1 && (
                    <button type="button" onClick={() => removeRep(i)} style={{ color: 'var(--fg-3)', padding: '0 8px' }}>
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {reps.length < 15 && (
              <button
                type="button"
                onClick={addRep}
                style={{ marginTop: 12, fontSize: 'var(--fs-sm)', color: 'var(--mp-coral)', fontWeight: 500 }}
              >
                + Add another rep
              </button>
            )}
            <p className="mp-help" style={{ marginTop: 12 }}>
              Reps see a populated pipeline on Day 1 — no setup needed from them. You can invite anytime from Settings.
            </p>
          </section>

          {inviteLinks.length > 0 && (
            <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-2)', borderRadius: 'var(--radius-md)' }}>
              <div className="mp-overline" style={{ marginBottom: 8 }}>Invite links (share if email is slow):</div>
              {inviteLinks.map((i) => (
                <div key={i.email} className="mp-mono" style={{ wordBreak: 'break-all' }}>
                  {i.email}: {i.inviteLink}
                </div>
              ))}
            </div>
          )}
        </Card>

        {error && <p className="mp-help mp-help--error" style={{ marginTop: 12 }}>{error}</p>}

        <Button
          block
          size="lg"
          style={{ marginTop: 24 }}
          onClick={handleLaunch}
          disabled={!successMetric.trim() || submitting}
        >
          {submitting ? 'Launching…' : 'Launch →'}
        </Button>
      </div>
    </div>
  );
}
