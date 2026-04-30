import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, Copy, Send } from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import Card from '../components/Card';

interface SessionSummary {
  successMetric: string;
  // The four stats we surface — "what you built during onboarding".
  // Each one reflects a distinct axis of work so no two cards collide.
  leadCount: number;          // pipeline depth   (output)
  docsApproved: number;       // strategy ready   (decisions)
  docsTotal: number;
  messageTemplates: number;   // voice authored   (channel × stage)
  painSignals: number;        // customer insight (ICP articulation)
}

export default function OnboardingCompletePage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [invites, setInvites] = useState<Array<{ email: string; inviteLink: string }>>([]);

  useEffect(() => {
    if (!id) return;
    onboardingAPI.state(id).then(({ data }) => {
      const company: any = data.company || {};
      const docs: any[] = (data as any).docs || [];
      // Reviewable docs only (4 — nurture, scoring, brand, knowledge). The
      // target_profile is an auto-approved separate doc and shouldn't count
      // against this stat (otherwise the founder sees "5/4 ready").
      const reviewableKinds = new Set([
        'nurture_strategy',
        'scoring_framework',
        'brand_guidelines',
        'knowledge_base',
      ]);
      const approvedStatuses = new Set(['approved', 'auto_approved']);
      const docsApproved = docs.filter(
        (d) => reviewableKinds.has(d.kind) && approvedStatuses.has(d.status),
      ).length;

      // Pain signals the founder articulated in their target profile — the
      // customer-problem axis, distinct from leads (output), docs (strategy),
      // and message templates (channels).
      const painSignals = Array.isArray(company.targetProfile?.painSignals)
        ? company.targetProfile.painSignals.filter((p: string) => p && p.trim()).length
        : 0;

      setSummary({
        successMetric: company.successMetric || '',
        leadCount: data.leadCount || 0,
        docsApproved,
        docsTotal: 4,
        messageTemplates: Array.isArray(company.messageTemplates)
          ? company.messageTemplates.filter((t: any) => t?.body).length
          : 0,
        painSignals,
      });
      setInvites(data.reps?.map((r: any) => ({ email: r.email, inviteLink: r.inviteLink })) || []);
    });
  }, [id]);

  return (
    <div className="mp-app-shell mp-center">
      <div style={{ width: '100%', maxWidth: 560 }}>
        <Card padding="lg" className="mp-text-center">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--mp-coral-100)',
              color: 'var(--mp-coral)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Check size={32} strokeWidth={2.5} />
          </div>

          <h2 className="mp-h2" style={{ margin: 0 }}>Your sales engine is live.</h2>
          <p className="mp-body-sm mp-muted" style={{ marginTop: 6, marginBottom: 32 }}>
            AI nurturing begins now.
          </p>

          {summary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                marginBottom: 24,
              }}
            >
              <Stat value={summary.leadCount} label="leads in your pipeline" />
              <Stat
                value={`${summary.docsApproved}/${summary.docsTotal}`}
                label="strategy docs ready"
              />
              <Stat value={summary.messageTemplates} label="message templates drafted" />
              <Stat value={summary.painSignals} label="customer pain signals captured" />
            </div>
          )}

          {summary?.successMetric && (
            <div style={{ padding: 16, background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', marginBottom: 16, textAlign: 'left' }}>
              <div className="mp-overline" style={{ marginBottom: 4 }}>Your 90-day north star</div>
              <div>{summary.successMetric}</div>
            </div>
          )}

          {invites.length > 0 && (
            <div className="mp-rep-invites">
              <div className="mp-rep-invites__head">
                <div className="mp-overline">Rep invite links</div>
                <p className="mp-meta" style={{ margin: 0 }}>
                  Send these to your reps — one click signs them in. Links never expire.
                </p>
              </div>
              <div className="mp-rep-invites__list">
                {invites.map((i) => (
                  <RepInviteCard key={i.email} email={i.email} inviteLink={i.inviteLink} />
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link to="/app/target-profile">
              <button className="mp-btn mp-btn--primary mp-btn--lg">Open MerakiPeople →</button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', padding: 16 }}>
      <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 700, color: 'var(--mp-coral)', letterSpacing: 'var(--tracking-tight)', lineHeight: 1 }}>
        {value}
      </div>
      <div className="mp-meta" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}

function RepInviteCard({ email, inviteLink }: { email: string; inviteLink: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API — select the URL field
      const el = document.getElementById(`invite-url-${email}`) as HTMLInputElement | null;
      if (el) {
        el.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const subject = encodeURIComponent("Your invite to start using your AI sales team");
  const body = encodeURIComponent(
    `Hi,\n\nYou've been invited to join the team. Use this link to sign in:\n\n${inviteLink}\n\nIt only takes a minute — you'll set up your CV next, and your morning playbook will be waiting.\n\nWelcome aboard!`
  );
  const mailtoLink = `mailto:${email}?subject=${subject}&body=${body}`;

  return (
    <div className="mp-rep-invite">
      <div className="mp-rep-invite__top">
        <div className="mp-rep-invite__avatar">
          {email.slice(0, 1).toUpperCase()}
        </div>
        <div className="mp-rep-invite__email" title={email}>{email}</div>
      </div>

      <div className="mp-rep-invite__url-row">
        <input
          id={`invite-url-${email}`}
          type="text"
          value={inviteLink}
          readOnly
          className="mp-rep-invite__url"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          type="button"
          className="mp-rep-invite__btn"
          onClick={handleCopy}
          aria-label="Copy invite link"
        >
          {copied ? (
            <>
              <Check size={14} /> Copied
            </>
          ) : (
            <>
              <Copy size={14} /> Copy
            </>
          )}
        </button>
        <a
          href={mailtoLink}
          className="mp-rep-invite__btn mp-rep-invite__btn--primary"
          aria-label={`Email ${email}`}
        >
          <Send size={14} /> Email
        </a>
      </div>
    </div>
  );
}
