import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BrandHeader from '../components/BrandHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Field from '../components/Field';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim() && password.length >= 8 && companyName.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      await signup(email.trim(), password, companyName.trim(), name.trim() || undefined);
      navigate('/onboarding', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard">
        <BrandHeader title="Create your account" subtitle="Takes 30 seconds. Onboarding starts right after." />

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="mp-stack" style={{ '--gap': 'var(--space-5)' } as any}>
            <Field label="Company name" required helper="We'll use this across your strategy docs and outreach">
              <Input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Zentree Labs"
                autoFocus
                required
              />
            </Field>

            <Field label="Your name">
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Priya Sharma"
                autoComplete="name"
              />
            </Field>

            <Field label="Work email" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Password" required helper="At least 8 characters">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>

            {error && <p className="mp-help mp-help--error">{error}</p>}

            <Button type="submit" disabled={!canSubmit || loading} block size="lg">
              {loading ? 'Creating your account…' : 'Create account & start onboarding'}
            </Button>
          </form>
        </Card>

        <p className="mp-body-sm mp-muted mp-text-center" style={{ marginTop: 20 }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--mp-coral)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
