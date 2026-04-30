import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BrandHeader from '../components/BrandHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Field from '../components/Field';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as any)?.from || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard">
        <BrandHeader title="Welcome back." subtitle="Sign in to pick up where you left off." />

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="mp-stack" style={{ '--gap': 'var(--space-5)' } as any}>
            <Field label="Email" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                autoFocus
              />
            </Field>

            <Field label="Password" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </Field>

            {error && <p className="mp-help mp-help--error">{error}</p>}

            <Button type="submit" disabled={loading || !email || !password} block size="lg">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <p className="mp-body-sm mp-muted mp-text-center" style={{ marginTop: 20 }}>
          New to Career247 Growth OS? <Link to="/signup" style={{ color: 'var(--mp-coral)', fontWeight: 600 }}>Create your account</Link>
        </p>
      </div>
    </div>
  );
}
