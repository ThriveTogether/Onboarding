import React from 'react';
import { Navigate } from 'react-router-dom';
import { useOnboarding } from '../../contexts/OnboardingContext';

export default function AppIndexPage() {
  const { company, loading } = useOnboarding();
  if (loading) return <p className="mp-muted">Loading…</p>;
  if (!company) return <Navigate to="/onboarding" replace />;
  return <Navigate to="/app/target-profile" replace />;
}
