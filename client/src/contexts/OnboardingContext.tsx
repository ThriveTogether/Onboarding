import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { onboardingAPI, OnboardingCompany, OnboardingDoc } from '../api/onboarding';
import { useAuth } from './AuthContext';

interface OnboardingContextValue {
  company: OnboardingCompany | null;
  docs: OnboardingDoc[];
  leadCount: number;
  reps: any[];
  /** Server-computed URL where the founder should resume the wizard. */
  resumeUrl: string;
  loading: boolean;
  refresh: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [company, setCompany] = useState<OnboardingCompany | null>(null);
  const [docs, setDocs] = useState<OnboardingDoc[]>([]);
  const [leadCount, setLeadCount] = useState(0);
  const [reps, setReps] = useState<any[]>([]);
  const [resumeUrl, setResumeUrl] = useState<string>('/onboarding');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setCompany(null);
      setDocs([]);
      setLeadCount(0);
      setReps([]);
      setResumeUrl('/onboarding');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await onboardingAPI.state();
      setCompany(data.company);
      setDocs(data.docs || []);
      setLeadCount(data.leadCount || 0);
      setReps(data.reps || []);
      setResumeUrl(data.resumeUrl || '/onboarding');
    } catch (e) {
      console.error('[OnboardingContext] refresh failed', e);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authLoading) refresh();
  }, [authLoading, refresh]);

  return (
    <OnboardingContext.Provider value={{ company, docs, leadCount, reps, resumeUrl, loading, refresh }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
