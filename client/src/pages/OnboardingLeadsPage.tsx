import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, Building2, X, Globe, RefreshCw, Linkedin, Lock, Users } from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import PhaseProgress from '../components/PhaseProgress';
import Card from '../components/Card';
import Button from '../components/Button';
import ThinkingPanel, { ReasoningSession } from '../components/ThinkingPanel';
import { useOnboarding } from '../contexts/OnboardingContext';
import WizardBackLink from '../components/WizardBackLink';

type Feedback = 'pursue' | 'existing' | 'skip' | null;

interface LeadWithFeedback {
  _id: string;
  contactName: string;
  contactTitle: string;
  contactEmail?: string;
  contactEmailVerified?: boolean;
  linkedinUrl?: string;
  targetCompany: string;
  targetCompanyWebsite?: string;
  city: string;
  industry: string;
  subIndustry?: string;
  matchPercent: number;
  founderFeedback: Feedback;
  intel?: {
    department?: string;
    seniority?: string;
    relevanceReason?: string;
    matchRationale?: string;
    recommendedApproach?: string;
    companyDescription?: string;
  };
}

export default function OnboardingLeadsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useOnboarding();
  const [phase, setPhase] = useState<'searching' | 'found'>('searching');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<LeadWithFeedback[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [source, setSource] = useState<'claude_ai_suggested' | 'mock_template' | null>(null);
  const [error, setError] = useState('');
  const [icpNote, setIcpNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const startHunt = () => {
    if (!id) return;
    setError('');
    setSessionId(null);
    setPreview([]);
    setTotalCount(0);
    setSource(null);
    setPhase('searching');
    onboardingAPI
      .generateLeads(id)
      .then(({ data }) => setSessionId(data.sessionId))
      .catch((e) => setError(e.response?.data?.error || 'Lead generation failed'));
  };

  useEffect(() => {
    if (!id) return;
    // If leads already exist for this company, skip the re-hunt and show feedback UI
    onboardingAPI.listLeads(id).then(({ data }) => {
      if (data.leads && data.leads.length > 0) {
        setPreview(data.leads.slice(0, 5));
        setTotalCount(data.leads.length);
        setSource('claude_ai_suggested');
        setPhase('found');
      } else {
        startHunt();
      }
    });
    // Also load any existing icp note
    onboardingAPI.state(id).then(({ data }) => {
      if (data.company?.icpFeedbackNote) setIcpNote(data.company.icpFeedbackNote);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSessionDone = async (_session: ReasoningSession) => {
    if (!id) return;
    const { data } = await onboardingAPI.listLeads(id);
    const leads = data.leads;
    if (leads.length === 0) {
      setError('Lead hunt completed but returned no leads. Retry to try again.');
      return;
    }
    setTotalCount(leads.length);
    setPreview(leads.slice(0, 5));
    setSource(leads.length > 0 ? 'claude_ai_suggested' : 'mock_template');
    setPhase('found');
  };

  const setFeedback = async (leadId: string, feedback: Feedback) => {
    // Toggle: clicking the active button clears it
    setPreview((prev) =>
      prev.map((l) =>
        l._id === leadId
          ? { ...l, founderFeedback: l.founderFeedback === feedback ? null : feedback }
          : l
      )
    );
    try {
      const current = preview.find((l) => l._id === leadId);
      const next = current?.founderFeedback === feedback ? null : feedback;
      await onboardingAPI.leadFeedback(leadId, next);
    } catch (e) {
      console.error('feedback failed', e);
    }
  };

  const saveIcpNote = async () => {
    if (!id || !icpNote.trim()) return;
    setSavingNote(true);
    try {
      await onboardingAPI.saveIcpNote(id, icpNote);
    } finally {
      setSavingNote(false);
    }
  };

  const goToDocs = async () => {
    if (icpNote.trim()) await saveIcpNote();
    navigate(`/onboarding/messaging/${id}`);
  };

  const pursueCount = preview.filter((l) => l.founderFeedback === 'pursue').length;
  const existingCount = preview.filter((l) => l.founderFeedback === 'existing').length;
  const skipCount = preview.filter((l) => l.founderFeedback === 'skip').length;
  const totalFeedback = pursueCount + existingCount + skipCount;
  const hasFeedback = totalFeedback > 0 || icpNote.trim().length > 0;

  return (
    <div className="mp-app-shell">
      <div className="mp-wizard mp-wizard--wide">
        <WizardBackLink to={id ? `/onboarding/profile/${id}` : '/onboarding'} label="Back to target profile" />
        <PhaseProgress phase="phase_a" step="a3" />

        {phase === 'searching' ? (
          <>
            <div className="mp-text-center" style={{ marginBottom: 24 }}>
              <h2 className="mp-h2" style={{ margin: 0 }}>Hunting real companies for you</h2>
              <p className="mp-body-sm mp-muted" style={{ marginTop: 6 }}>
                Real company names and the right person at each — ranked against your ICP. This takes a minute or two; we'll show you what we're doing as we go.
              </p>
            </div>
            {sessionId ? (
              <ThinkingPanel
                sessionId={sessionId}
                title="Finding companies that fit your ICP"
                subtitle="Working through your customer profile, your geography, and signals of who's ready to buy"
                onDone={handleSessionDone}
                onError={(session) => setError(session.errorMessage || 'Lead hunt failed')}
              />
            ) : (
              <Card padding="lg" className="mp-text-center"><p className="mp-muted">Warming up the hunt…</p></Card>
            )}
            {error && (
              <Card padding="lg" style={{ marginTop: 16, borderColor: 'var(--mp-error)', background: 'var(--mp-error-bg)' }}>
                <p className="mp-help mp-help--error" style={{ marginTop: 0, marginBottom: 12, fontWeight: 600 }}>{error}</p>
                <Button onClick={startHunt} variant="primary">Retry hunt</Button>
              </Card>
            )}
          </>
        ) : (
          <>
            <div className="mp-text-center" style={{ marginBottom: 12 }}>
              <h2 className="mp-h2" style={{ margin: 0 }}>
                Found <span style={{ color: 'var(--mp-coral)' }}>{totalCount}</span> leads
              </h2>
              <p className="mp-body-sm mp-muted" style={{ marginTop: 6 }}>
                Here's a preview of the top matches.
              </p>
            </div>

            <div className="mp-row" style={{ justifyContent: 'flex-end', marginBottom: 12, gap: 12 }}>
              <Button variant="outline" size="sm" onClick={startHunt}>
                <RefreshCw size={14} /> Re-hunt with fresh data
              </Button>
            </div>

            {source === 'claude_ai_suggested' && (
              <Card
                tone="tinted"
                style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--mp-coral-100)',
                    color: 'var(--mp-coral)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  i
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--mp-indigo)' }}>
                    What's real here, and what's not
                  </div>
                  <p className="mp-body-sm mp-muted" style={{ margin: '2px 0 0' }}>
                    <strong>Companies, websites, and LinkedIn URLs</strong> are real — found via Google search,
                    cited per lead. <strong>Contact names + titles</strong> are AI-suggested based on the role
                    profile, so confirm via the LinkedIn link before reaching out. <strong>Verified emails</strong>{' '}
                    aren't generated here — Deep Research lookup (Apollo + Hunter + internal DB) lives in the
                    full Career247 platform, not in this onboarding preview.
                  </p>
                </div>
              </Card>
            )}

            <Card style={{ padding: 0, marginBottom: 16 }}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--border-1)' }}>
                <div className="mp-overline" style={{ marginBottom: 4 }}>Your turn — teach the AI</div>
                <p className="mp-body-sm" style={{ margin: 0, color: 'var(--fg-1)' }}>
                  Tell us how you'd handle each of these leads. Your calls tune every doc we generate next.
                </p>
              </div>

              <div className="mp-lead-list">
                {preview.map((lead) => {
                  const matchRationale = lead.intel?.matchRationale;
                  const relevanceReason = lead.intel?.relevanceReason;
                  const recommendedApproach = lead.intel?.recommendedApproach;
                  const companyDesc = lead.intel?.companyDescription;
                  const websiteHost = lead.targetCompanyWebsite ? safeHost(lead.targetCompanyWebsite) : '';

                  return (
                    <div key={lead._id} className="mp-lead-list__item mp-lead-card mp-lead-card--account">
                      {/* ─── ACCOUNT BLOCK ─────────────────────────────── */}
                      <div className="mp-lead-card__account">
                        <div className="mp-lead-card__account-head">
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="mp-lead-card__account-name">
                              {lead.targetCompany}
                              {lead.city && (
                                <span className="mp-lead-card__account-city"> · {lead.city}</span>
                              )}
                            </div>
                            {/* Tags row */}
                            {(lead.industry || lead.subIndustry) && (
                              <div className="mp-lead-card__tags" style={{ marginTop: 6 }}>
                                {lead.industry && <span className="mp-tag mp-tag--indigo">{lead.industry}</span>}
                                {lead.subIndustry && lead.subIndustry !== lead.industry && (
                                  <span className="mp-tag mp-tag--coral">{lead.subIndustry}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="mp-lead-card__match">
                            <div className="mp-lead-card__match-pct">{lead.matchPercent}% match</div>
                          </div>
                        </div>

                        {/* Account links — website only at account level */}
                        <div className="mp-lead-card__contact-row" style={{ marginTop: 8 }}>
                          {lead.targetCompanyWebsite ? (
                            <a
                              href={lead.targetCompanyWebsite}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mp-lead-card__link"
                            >
                              <Globe size={12} /> {websiteHost}
                            </a>
                          ) : (
                            <span className="mp-lead-card__link mp-lead-card__link--disabled">
                              <Globe size={12} /> No website found
                            </span>
                          )}
                        </div>

                        {/* Company description */}
                        {companyDesc && <p className="mp-lead-card__desc" style={{ marginTop: 8 }}>{companyDesc}</p>}

                        {/* Why this account (account-level rationale only) */}
                        {matchRationale && (
                          <div className="mp-rationale-line" style={{ marginTop: 8 }}>
                            <span className="mp-rationale-line__label">Why this account</span>
                            <span className="mp-rationale-line__body">{matchRationale}</span>
                          </div>
                        )}
                      </div>

                      {/* ─── DECISION-MAKER BLOCK ─────────────────────── */}
                      <div className="mp-lead-card__contact">
                        <div className="mp-lead-card__contact-head">
                          <Users size={14} className="mp-lead-card__contact-icon" />
                          <span className="mp-lead-card__contact-overline">
                            Likely decision-maker
                          </span>
                        </div>

                        <div className="mp-lead-card__contact-name">
                          {lead.contactName}
                          <span className="mp-muted" style={{ fontWeight: 400 }}> · {lead.contactTitle}</span>
                        </div>

                        {/* Source citation: where we found this person */}
                        <div className="mp-lead-card__source">
                          {lead.linkedinUrl ? (
                            <>
                              <span className="mp-meta">Found on </span>
                              <a
                                href={lead.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mp-lead-card__link"
                              >
                                <Linkedin size={12} /> LinkedIn
                              </a>
                            </>
                          ) : (
                            <span className="mp-meta">
                              AI-suggested role profile — no public LinkedIn match yet.
                            </span>
                          )}
                        </div>

                        {/* Why this role is the decision-maker */}
                        {relevanceReason && (
                          <div className="mp-rationale-line" style={{ marginTop: 8 }}>
                            <span className="mp-rationale-line__label">Why this role</span>
                            <span className="mp-rationale-line__body">{relevanceReason}</span>
                          </div>
                        )}

                        {/* Verified email — locked / Deep Research */}
                        <div className="mp-lead-card__contact-row" style={{ marginTop: 8 }}>
                          <span className="mp-lead-card__locked" title="Verified emails are unlocked in the full Career247 Growth OS platform — Deep Research finds + validates contact emails through Apollo, Hunter, and our internal DB.">
                            <Lock size={11} /> Verified email — Deep Research (in platform)
                          </span>
                        </div>

                        {/* Opening angle (suggested first message angle) */}
                        {recommendedApproach && (
                          <div className="mp-rationale-line" style={{ marginTop: 8 }}>
                            <span className="mp-rationale-line__label">Opening angle</span>
                            <span className="mp-rationale-line__body">{recommendedApproach}</span>
                          </div>
                        )}
                      </div>

                      <div className="mp-feedback-row">
                        <button
                          className={`mp-feedback-btn ${lead.founderFeedback === 'pursue' ? 'mp-feedback-btn--pursue-active' : ''}`}
                          onClick={() => setFeedback(lead._id, 'pursue')}
                        >
                          <Heart size={12} strokeWidth={2.5} /> Love it — pursue
                        </button>
                        <button
                          className={`mp-feedback-btn ${lead.founderFeedback === 'existing' ? 'mp-feedback-btn--existing-active' : ''}`}
                          onClick={() => setFeedback(lead._id, 'existing')}
                        >
                          <Building2 size={12} strokeWidth={2.5} /> Already in my pipeline
                        </button>
                        <button
                          className={`mp-feedback-btn ${lead.founderFeedback === 'skip' ? 'mp-feedback-btn--skip-active' : ''}`}
                          onClick={() => setFeedback(lead._id, 'skip')}
                        >
                          <X size={12} strokeWidth={2.5} /> Not a fit — skip
                        </button>
                      </div>
                    </div>
                  );
                })}
                {totalCount > preview.length && (
                  <div className="mp-lead-list__footer">
                    + {totalCount - preview.length} more in your pipeline (review later from the Leads page)
                  </div>
                )}
              </div>
            </Card>

            {totalFeedback > 0 && (
              <div className="mp-feedback-summary" style={{ marginBottom: 16 }}>
                <span>So far:</span>
                {pursueCount > 0 && <span><strong>{pursueCount}</strong> to pursue</span>}
                {existingCount > 0 && <span><strong>{existingCount}</strong> already yours</span>}
                {skipCount > 0 && <span><strong>{skipCount}</strong> skipped</span>}
                <span className="mp-muted" style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)' }}>
                  Claude will use this to shape your strategy docs.
                </span>
              </div>
            )}

            <Card style={{ marginBottom: 16 }}>
              <div className="mp-overline" style={{ marginBottom: 8 }}>
                Anything else we should know? (optional)
              </div>
              <textarea
                className="mp-textarea"
                placeholder="e.g., 'Avoid PSU-owned companies', 'We do best with founder-led shops under 200 employees', 'Don't target existing customers of X competitor'…"
                value={icpNote}
                onChange={(e) => setIcpNote(e.target.value)}
                rows={3}
                onBlur={saveIcpNote}
              />
              {savingNote && <p className="mp-meta" style={{ marginTop: 6 }}>Saving…</p>}
            </Card>

            <div className="mp-nudge" style={{ marginTop: 8 }}>
              <div className="mp-nudge__overline">Step 3 of 7 · you're almost at Phase B</div>
              <h3 className="mp-nudge__title">
                Your AI found {totalCount} leads — now let's teach it how to talk to them.
              </h3>
              <p className="mp-nudge__body">
                {hasFeedback
                  ? `Next, we'll use what you just told us (${feedbackSummary(pursueCount, existingCount, skipCount)}${icpNote.trim() ? ' + your notes' : ''}) to shape 5 strategy docs — how your AI nurtures, who it prioritises, how it sounds, and what it knows about ${company?.companyName || 'your company'}. You'll review and approve each one.`
                  : `Next, we'll draft 5 strategy docs — how your AI nurtures, who it prioritises, how it sounds, and what it knows about ${company?.companyName || 'your company'}. Feedback on the leads above sharpens them; you can always skip and review the docs directly.`}
              </p>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Button variant="accent" onClick={goToDocs}>
                  {hasFeedback ? 'Next: draft your AI\'s first messages →' : 'Skip ahead to messaging →'}
                </Button>
              </div>
            </div>

            {error && <p className="mp-help mp-help--error" style={{ marginTop: 12 }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function feedbackSummary(pursue: number, existing: number, skip: number): string {
  const parts: string[] = [];
  if (pursue > 0) parts.push(`${pursue} to pursue`);
  if (existing > 0) parts.push(`${existing} already in your pipeline`);
  if (skip > 0) parts.push(`${skip} to skip`);
  return parts.join(', ');
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}
