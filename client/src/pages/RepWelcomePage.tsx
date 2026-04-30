import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import Card from '../components/Card';
import Button from '../components/Button';
import Logo from '../components/Logo';

interface InviteData {
  invite: { email: string; name: string; status: string; cvUploaded: boolean };
  company: { companyName: string; vertical: string };
  pipeline: { totalLeads: number; hotReady: number };
}

export default function RepWelcomePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<InviteData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    onboardingAPI
      .getRepInvite(token)
      .then(async ({ data }) => {
        setData(data);
        await onboardingAPI.repLogin(token);
      })
      .catch((e) => setError(e.response?.data?.error || 'Invite not found'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div className="mp-center"><p className="mp-muted">Loading…</p></div>;
  }

  if (error || !data) {
    return (
      <div className="mp-center">
        <Card padding="lg" className="mp-text-center" style={{ maxWidth: 420 }}>
          <h3 className="mp-h4">Invite not found</h3>
          <p className="mp-body-sm mp-muted">{error || 'Ask your founder to re-send your invite link.'}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mp-center">
      <div style={{ maxWidth: 480, width: '100%' }}>
        <div className="mp-text-center" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Logo variant="light" height={32} />
          </div>
          <h2 className="mp-h2" style={{ margin: '4px 0 0' }}>
            Welcome{data.invite.name ? `, ${data.invite.name}` : ''}.
          </h2>
          <p className="mp-body-sm mp-muted" style={{ marginTop: 6 }}>
            Your team at {data.company.companyName} is live.
          </p>
        </div>

        <Card padding="lg">
          <div className="mp-overline" style={{ marginBottom: 16 }}>Here's what's waiting for you</div>

          <Stat value={data.pipeline.totalLeads} label="leads in your nurture pipeline" />
          <Stat value={data.pipeline.hotReady} label="ready for you to call today" />
          <StatText label="Your Morning Playbook is ready" />

          <Button
            block
            size="lg"
            style={{ marginTop: 24 }}
            onClick={() => navigate(`/rep/${token}/cv`)}
          >
            Let's go <ArrowRight size={16} />
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <ArrowRight size={16} color="var(--mp-coral)" />
      <span>
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-lg)' }}>{value}</span> {label}
      </span>
    </div>
  );
}

function StatText({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <ArrowRight size={16} color="var(--mp-coral)" />
      <span>{label}</span>
    </div>
  );
}
