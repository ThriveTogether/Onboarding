import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Globe, Linkedin, Target as TargetIcon, Newspaper } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';

const VERTICAL_LABEL: Record<string, string> = {
  manufacturing: 'Manufacturing',
  bfsi: 'BFSI',
  hr_recruitment: 'HR & Recruitment',
  b2b_services: 'B2B Services',
  b2b_saas: 'B2B SaaS',
  edtech_b2c: 'EdTech (B2C)',
  other: 'Other',
};

/**
 * Company-level overview shown post-launch. Pulls everything from the
 * OnboardingCompany record — name, vertical, research signals, success
 * metric — without duplicating the strategy docs (which have their own
 * dedicated pages: Target Profile, Nurture Strategy, etc.).
 */
export default function CompanyProfilePage() {
  const { company, loading } = useOnboarding();

  if (loading) return <p className="mp-muted">Loading…</p>;

  if (!company) {
    return (
      <Card padding="lg" className="mp-text-center">
        <p className="mp-body-sm mp-muted">No company yet.</p>
        <Link to="/onboarding">
          <Button style={{ marginTop: 16 }}>Start onboarding</Button>
        </Link>
      </Card>
    );
  }

  const research = (company as any).research || {};
  const linkedin = research.linkedin || {};
  const website = research.website || {};
  const publicSources = research.publicSources || {};
  const successMetric = (company as any).successMetric || '';

  return (
    <>
      <header className="mp-page-header">
        <h1 className="mp-page-header__title">{company.companyName}</h1>
        <p className="mp-page-header__subtitle">
          Everything the AI knows about your company — sourced from your inputs and live research.
        </p>
      </header>

      {/* Top-line facts */}
      <Card padding="md" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <Fact icon={Building2} label="Vertical" value={VERTICAL_LABEL[company.vertical] || company.vertical} />
          {company.websiteUrl && (
            <Fact
              icon={Globe}
              label="Website"
              value={
                <a
                  href={company.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--mp-indigo)', textDecoration: 'none' }}
                >
                  {stripProtocol(company.websiteUrl)}
                </a>
              }
            />
          )}
          {company.linkedinUrl && (
            <Fact
              icon={Linkedin}
              label="LinkedIn"
              value={
                <a
                  href={company.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--mp-indigo)', textDecoration: 'none' }}
                >
                  Profile
                </a>
              }
            />
          )}
          {linkedin.headquarters && <Fact label="HQ" value={linkedin.headquarters} />}
          {linkedin.employeeCount && <Fact label="Employees" value={linkedin.employeeCount} />}
        </div>
      </Card>

      {/* 90-day north star */}
      {successMetric && (
        <Card padding="md" tone="tinted" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <TargetIcon size={20} style={{ color: 'var(--mp-coral)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div className="mp-overline" style={{ marginBottom: 4 }}>Your 90-day north star</div>
              <div className="mp-body" style={{ fontWeight: 500 }}>{successMetric}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Website positioning + products */}
      {(website.positioning || (website.products && website.products.length > 0)) && (
        <Card padding="md" style={{ marginBottom: 16 }}>
          <div className="mp-overline" style={{ marginBottom: 8 }}>From your website</div>
          {website.positioning && (
            <p className="mp-body-sm" style={{ margin: '0 0 12px' }}>{website.positioning}</p>
          )}
          {website.products && website.products.length > 0 && (
            <>
              <div className="mp-meta" style={{ marginBottom: 6 }}>Products / services detected</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {website.products.slice(0, 12).map((p: string, i: number) => (
                  <Badge key={i}>{p}</Badge>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* LinkedIn about + specialities */}
      {(linkedin.about || (linkedin.specialities && linkedin.specialities.length > 0)) && (
        <Card padding="md" style={{ marginBottom: 16 }}>
          <div className="mp-overline" style={{ marginBottom: 8 }}>From LinkedIn</div>
          {linkedin.about && (
            <p className="mp-body-sm" style={{ margin: '0 0 12px' }}>{linkedin.about}</p>
          )}
          {linkedin.specialities && linkedin.specialities.length > 0 && (
            <>
              <div className="mp-meta" style={{ marginBottom: 6 }}>Specialities</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {linkedin.specialities.slice(0, 12).map((s: string, i: number) => (
                  <Badge key={i}>{s}</Badge>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Recent news / public mentions */}
      {publicSources.newsMentions && publicSources.newsMentions.length > 0 && (
        <Card padding="md">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Newspaper size={14} />
            <div className="mp-overline">Recent mentions</div>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {publicSources.newsMentions.slice(0, 5).map((m: string, i: number) => (
              <li key={i} className="mp-body-sm" style={{ marginBottom: 6 }}>{m}</li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

interface FactProps {
  // Lucide icons have a richer prop signature than the bare {size, style}
  // we use here — accept any-typed component to keep the props lightweight.
  icon?: React.ComponentType<any>;
  label: string;
  value: React.ReactNode;
}

function Fact({ icon: Icon, label, value }: FactProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="mp-meta" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        {Icon && <Icon size={11} style={{ color: 'var(--fg-2)' }} />}
        {label}
      </div>
      <div className="mp-body-sm" style={{ fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
