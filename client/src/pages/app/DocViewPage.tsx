import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { onboardingAPI, OnboardingDoc, OnboardingDocKind } from '../../api/onboarding';
import Card from '../../components/Card';
import Button from '../../components/Button';
import DocRenderer from '../../components/DocRenderer';

interface DocViewPageProps {
  /** Doc kind to fetch + render. Must be one of the 5 generated doc kinds. */
  kind: OnboardingDocKind;
  /** Page title shown above the doc. */
  title: string;
  /** Page subtitle / description shown below the title. */
  subtitle: string;
}

/**
 * Shared post-launch view for a single approved onboarding doc.
 *
 * Each `/app/<doc-name>` page mounts this with a different `kind` — the page
 * fetches the company's docs, finds the matching one, and renders it via the
 * existing DocRenderer used during onboarding.
 *
 * The intent is that what the founder approved at the end of Phase B is the
 * EXACT same content surfaced as a live reference here — no duplication.
 */
export default function DocViewPage({ kind, title, subtitle }: DocViewPageProps) {
  const { company, loading: ctxLoading } = useOnboarding();
  const [doc, setDoc] = useState<OnboardingDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!company?._id) return;
    setLoading(true);
    setError('');
    onboardingAPI
      .listDocs(company._id)
      .then(({ data }) => {
        const found = data.docs.find((d: OnboardingDoc) => d.kind === kind) || null;
        setDoc(found);
      })
      .catch((e: any) => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [company?._id, kind]);

  if (ctxLoading || loading) {
    return <p className="mp-muted">Loading…</p>;
  }

  if (!company) {
    return (
      <Card padding="lg" className="mp-text-center">
        <p className="mp-body-sm mp-muted">No company yet. Run onboarding first.</p>
        <Link to="/onboarding">
          <Button style={{ marginTop: 16 }}>Start onboarding</Button>
        </Link>
      </Card>
    );
  }

  return (
    <>
      <header className="mp-page-header">
        <h1 className="mp-page-header__title">{title}</h1>
        <p className="mp-page-header__subtitle">{subtitle}</p>
      </header>

      {error && (
        <Card padding="md" style={{ marginBottom: 12 }}>
          <p className="mp-help mp-help--error">{error}</p>
        </Card>
      )}

      {!doc || !doc.content ? (
        <Card padding="lg" className="mp-text-center">
          <p className="mp-body-sm mp-muted">
            No {title.toLowerCase()} yet — generate it from onboarding first.
          </p>
          <Link to="/onboarding/resume">
            <Button style={{ marginTop: 16 }}>Resume onboarding</Button>
          </Link>
        </Card>
      ) : (
        // Render the doc directly — DocRenderer already produces its own cards
        // and structured layout. Wrapping in another Card stacks containers and
        // (because the nurture flow diagram has internal horizontal scroll)
        // surfaces multiple scrollbars in the same view.
        <DocRenderer doc={doc} />
      )}
    </>
  );
}
