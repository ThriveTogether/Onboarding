import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { onboardingAPI, OnboardingVertical, SalesTeamSize } from '../api/onboarding';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useAuth } from '../contexts/AuthContext';
import PhaseProgress from '../components/PhaseProgress';
import BrandHeader from '../components/BrandHeader';
import Button from '../components/Button';
import Input from '../components/Input';
import Select from '../components/Select';
import Field from '../components/Field';
import Card from '../components/Card';

export default function OnboardingWelcomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ?edit=1 — set by "Back to company basics" links so the founder can edit
  // their basics without being bounced forward by the resume guard.
  const editMode = searchParams.get('edit') === '1';
  const { refresh, resumeUrl, loading: onbLoading, company } = useOnboarding();
  const [verticals, setVerticals] = useState<Array<{ key: string; displayName: string; isB2C: boolean }>>([]);
  const { user } = useAuth();
  const [form, setForm] = useState({
    companyName: user?.companyName || '',
    websiteUrl: '',
    linkedinUrl: '',
    vertical: '' as OnboardingVertical | '',
    salesTeamSize: '' as SalesTeamSize | '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Prefill when auth finishes loading
  useEffect(() => {
    if (user?.companyName && !form.companyName) {
      setForm((prev) => ({ ...prev, companyName: user.companyName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.companyName]);

  // Pre-fill from the existing company when the founder lands here in edit
  // mode — they came back to correct something they already submitted.
  useEffect(() => {
    if (!editMode || !company) return;
    setForm({
      companyName: company.companyName || '',
      websiteUrl: (company as any).websiteUrl || '',
      linkedinUrl: (company as any).linkedinUrl || '',
      vertical: (company.vertical as OnboardingVertical) || '',
      salesTeamSize: ((company as any).salesTeamSize as SalesTeamSize) || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, company?._id]);

  useEffect(() => {
    onboardingAPI.listVerticals().then(({ data }) => setVerticals(data.verticals));
  }, []);

  // ─── Resume guard ─────────────────────────────────────────────────
  // If the founder has already submitted this page (company exists with the
  // basics), bounce them forward to wherever the server says they should be.
  // Prevents "I logged in and it sent me back to the welcome form" confusion.
  if (onbLoading) {
    return (
      <div className="mp-app-shell">
        <div className="mp-wizard">
          <Card padding="lg" className="mp-text-center">
            <p className="mp-muted">Loading where you left off…</p>
          </Card>
        </div>
      </div>
    );
  }
  // Resume guard — bounce forward UNLESS the founder explicitly clicked
  // "Back to company basics" (editMode), in which case we let them edit.
  if (!editMode && company && company.companyName && company.vertical && resumeUrl !== '/onboarding') {
    return <Navigate to={resumeUrl} replace />;
  }

  const canSubmit =
    form.companyName.trim() &&
    form.vertical &&
    form.salesTeamSize &&
    (form.websiteUrl.trim() || form.linkedinUrl.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await onboardingAPI.createCompany({
        companyName: form.companyName.trim(),
        websiteUrl: form.websiteUrl.trim() || undefined,
        linkedinUrl: form.linkedinUrl.trim() || undefined,
        vertical: form.vertical as OnboardingVertical,
        salesTeamSize: form.salesTeamSize as SalesTeamSize,
      });
      await refresh();
      navigate(`/onboarding/profile/${data.company._id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard">
        <BrandHeader
          title={editMode ? 'Update your company basics' : 'Welcome to Career247 Growth OS.'}
          subtitle={editMode ? "Tweak anything below — we'll re-run the research and ICP prediction." : "Let's get your sales engine running."}
        />

        <PhaseProgress phase="phase_a" step="a1" />

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="mp-stack" style={{ '--gap': 'var(--space-5)' } as any}>
            <Field label="Company name" required>
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder="Acme Industries"
                required
              />
            </Field>

            <Field label="Website" helper="Your company website — at least one of website or LinkedIn is required">
              <Input
                value={form.websiteUrl}
                onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                placeholder="acme.com"
              />
            </Field>

            <Field label="LinkedIn company page" helper="Helps us research your company better — most accurate source">
              <Input
                value={form.linkedinUrl}
                onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                placeholder="linkedin.com/company/acme"
              />
            </Field>

            <Field label="Industry" required>
              <Select
                value={form.vertical}
                onChange={(e) => setForm({ ...form, vertical: e.target.value as OnboardingVertical })}
                placeholder="Select industry"
                options={verticals.map((v) => ({
                  value: v.key,
                  label: v.displayName,
                }))}
                required
              />
            </Field>

            <Field label="Sales team size" required>
              <Select
                value={form.salesTeamSize}
                onChange={(e) => setForm({ ...form, salesTeamSize: e.target.value as SalesTeamSize })}
                placeholder="Select size"
                options={[
                  { value: '2-5', label: '2–5 reps' },
                  { value: '6-10', label: '6–10 reps' },
                  { value: '11-15', label: '11–15 reps' },
                ]}
                required
              />
            </Field>

            {error && <p className="mp-help mp-help--error">{error}</p>}

            <Button type="submit" disabled={!canSubmit || submitting} block size="lg">
              {submitting
                ? editMode ? 'Saving…' : 'Getting to know you…'
                : editMode ? 'Save & re-run ICP →' : 'Next →'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
