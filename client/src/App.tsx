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
import PlaceholderPage from './pages/app/PlaceholderPage';
import CompanyProfilePage from './pages/app/CompanyProfilePage';
import AccountsPage from './pages/app/AccountsPage';
import ProductBrochurePage from './pages/app/ProductBrochurePage';
import NurtureStrategyPage from './pages/app/NurtureStrategyPage';
import LeadScoreFrameworkPage from './pages/app/LeadScoreFrameworkPage';
import BrandingGuidelinesPage from './pages/app/BrandingGuidelinesPage';

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
        <BrandTag hideOnSidebarPages />
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
            <Route path="company-profile" element={<CompanyProfilePage />} />
            <Route path="target-profile" element={<TargetProfilePage />} />
            <Route path="product-brochure" element={<ProductBrochurePage />} />
            <Route path="nurture-strategy" element={<NurtureStrategyPage />} />
            <Route path="lead-score-framework" element={<LeadScoreFrameworkPage />} />
            <Route path="branding-guidelines" element={<BrandingGuidelinesPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="leads/:leadId" element={<LeadDetailPage />} />
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
