import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { OnboardingProvider, useOnboarding } from './contexts/OnboardingContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import UserMenu from './components/UserMenu';
import BrandTag from './components/BrandTag';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import OnboardingWelcomePage from './pages/OnboardingWelcomePage';
import OnboardingProfilePage from './pages/OnboardingProfilePage';
import OnboardingLeadsPage from './pages/OnboardingLeadsPage';
import OnboardingMessagingPage from './pages/OnboardingMessagingPage';
import OnboardingChannelStagePage from './pages/OnboardingChannelStagePage';
import OnboardingDocsPage from './pages/OnboardingDocsPage';
import OnboardingPreviewPage from './pages/OnboardingPreviewPage';
import OnboardingLaunchPage from './pages/OnboardingLaunchPage';
import OnboardingCompletePage from './pages/OnboardingCompletePage';
import RepWelcomePage from './pages/RepWelcomePage';
import RepCVUploadPage from './pages/RepCVUploadPage';
import RepMorningPlaybookPage from './pages/RepMorningPlaybookPage';
import AppIndexPage from './pages/app/AppIndexPage';
import TargetProfilePage from './pages/app/TargetProfilePage';
import LeadsPage from './pages/app/LeadsPage';
import LeadDetailPage from './pages/app/LeadDetailPage';
import SettingsPage from './pages/app/SettingsPage';
import PlaceholderPage from './pages/app/PlaceholderPage';

function DocsRouter() {
  const { company, loading } = useOnboarding();
  if (loading) return <div className="mp-center"><p className="mp-muted">Loading…</p></div>;
  if (!company) return <Navigate to="/onboarding" replace />;
  return <Navigate to={`/onboarding/docs/${company._id}`} replace />;
}

function RootRouter() {
  // Server hands back resumeUrl computed from full state — no client-side guessing.
  // Walks through every wizard step; lands you on the first one not yet completed.
  const { resumeUrl, loading } = useOnboarding();
  if (loading) return <div className="mp-center"><p className="mp-muted">Loading…</p></div>;
  return <Navigate to={resumeUrl} replace />;
}

function ResumeRouter() {
  // Same as RootRouter — but kept as an explicit `/onboarding/resume` URL the
  // wizard can deep-link to (e.g. from emails or "Pick up where you left off").
  const { resumeUrl, loading } = useOnboarding();
  if (loading) return <div className="mp-center"><p className="mp-muted">Loading…</p></div>;
  return <Navigate to={resumeUrl} replace />;
}

function LoggedInRedirector() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="mp-center"><p className="mp-muted">Loading…</p></div>;
  return isAuthenticated ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <OnboardingProvider>
        <BrandTag />
        <UserMenu />
        <Routes>
          {/* Public auth pages — redirect away if already signed in */}
          <Route element={<LoggedInRedirector />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          {/* All routes below require authentication */}
          <Route element={<ProtectedRoute />}>
          <Route path="/" element={<RootRouter />} />

          {/* Onboarding wizard — shell-less, focused flow */}
          <Route path="/onboarding" element={<OnboardingWelcomePage />} />
          <Route path="/onboarding/resume" element={<ResumeRouter />} />
          <Route path="/onboarding/profile/:id" element={<OnboardingProfilePage />} />
          <Route path="/onboarding/leads/:id" element={<OnboardingLeadsPage />} />
          <Route path="/onboarding/messaging/:id" element={<OnboardingMessagingPage />} />
          <Route path="/onboarding/channels-stages/:id" element={<OnboardingChannelStagePage />} />
          <Route path="/onboarding/docs" element={<DocsRouter />} />
          <Route path="/onboarding/docs/:id" element={<OnboardingDocsPage />} />
          <Route path="/onboarding/preview/:id" element={<OnboardingPreviewPage />} />
          <Route path="/onboarding/launch/:id" element={<OnboardingLaunchPage />} />
          <Route path="/onboarding/complete/:id" element={<OnboardingCompletePage />} />

          {/* Post-launch product app — inside sidebar shell */}
          <Route path="/app" element={<AppShell />}>
            <Route index element={<AppIndexPage />} />
            <Route path="target-profile" element={<TargetProfilePage />} />
            <Route path="accounts" element={
              <PlaceholderPage
                title="Accounts"
                subtitle="Company-level view of your pipeline"
                bodyTitle="Coming next"
                bodyLines={[
                  'This view rolls up leads into the companies they belong to — useful for account-based selling and territory reviews.',
                  'Your target profile and locked lead pipeline are ready. Account grouping ships in the next sprint.',
                ]}
              />
            } />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="leads/:leadId" element={<LeadDetailPage />} />
            <Route path="post-call-analysis" element={
              <PlaceholderPage
                title="Post Call Analysis"
                subtitle="Call summaries, coaching signals, and next-action capture"
                bodyTitle="Coming next"
                bodyLines={[
                  'Once your reps start logging calls, this view surfaces per-call sentiment, objection handling, and the AI-drafted follow-up.',
                  'Ships in Month 2 of the Meraki 2.0 roadmap.',
                ]}
              />
            } />
            <Route path="call-preparation" element={
              <PlaceholderPage
                title="Call Preparation"
                subtitle="Pre-call briefs, discovery prompts, and lead context in one view"
                bodyTitle="Coming next"
                bodyLines={[
                  'Auto-generated briefs for each "Needs you" lead, built from your target profile, brand voice, and recent engagement signals.',
                ]}
              />
            } />
            <Route path="learning-nuggets" element={
              <PlaceholderPage
                title="Learning Nuggets"
                subtitle="Bite-sized coaching delivered to reps based on live call patterns"
                bodyTitle="Coming next"
                bodyLines={[
                  'When reps stumble on the same objection twice, the system pushes a 60-second nugget covering that exact situation.',
                ]}
              />
            } />
            <Route path="campaigns" element={
              <PlaceholderPage
                title="Campaigns"
                subtitle="Multi-touch nurture campaigns driven by your approved strategy docs"
                bodyTitle="Coming next"
                bodyLines={[
                  'Your approved nurture strategy auto-creates the first campaign. Manual sequences ship next.',
                ]}
              />
            } />
            <Route path="calls" element={
              <PlaceholderPage
                title="Calls"
                subtitle="Inbound + outbound call queue with integrated prep and analysis"
                bodyTitle="Coming next"
                bodyLines={['Pairs with Call Preparation and Post Call Analysis.']}
              />
            } />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          </Route>{/* end ProtectedRoute */}

          {/* Rep public routes (outside shell — invite-token auth) */}
          <Route path="/rep/:token" element={<RepWelcomePage />} />
          <Route path="/rep/:token/cv" element={<RepCVUploadPage />} />
          <Route path="/rep/:token/playbook" element={<RepMorningPlaybookPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </OnboardingProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
