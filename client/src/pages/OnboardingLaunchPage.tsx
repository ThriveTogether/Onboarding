import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  const [placeholder, setPlaceholder] = useState('e.g., Employees handle 2x more leads without hiring');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    onboardingAPI.state(id).then(({ data }) => {
      if (data.company?.vertical === 'edtech_b2c') {
        setPlaceholder('e.g., Double counsellor-to-enrollment conversion per month');
      } else if (data.company?.vertical === 'b2b_saas') {
        setPlaceholder('e.g., Grow SQLs per employee by 40% without hiring');
      }
    });
  }, [id]);

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
            One last thing before your sales engine goes live.
          </p>
        </div>

        <Card padding="lg">
          <section>
            <div className="mp-overline" style={{ marginBottom: 8 }}>What does success look like in 90 days?</div>
            <Input
              value={successMetric}
              onChange={(e) => setSuccessMetric(e.target.value)}
              placeholder={placeholder}
            />
            <p className="mp-help">This becomes your renewal dashboard metric. We'll track it live.</p>
            <p className="mp-help" style={{ marginTop: 12 }}>
              You can onboard your employees anytime from Settings — no need to do it now.
            </p>
          </section>
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
