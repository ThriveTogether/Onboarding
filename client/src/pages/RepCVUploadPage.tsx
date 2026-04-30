import React, { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { onboardingAPI } from '../api/onboarding';
import Card from '../components/Card';
import Button from '../components/Button';

export default function RepCVUploadPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    try {
      await onboardingAPI.uploadRepCV(token, file.name);
      navigate(`/rep/${token}/playbook`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSkip = async () => {
    if (!token) return;
    try {
      await onboardingAPI.skipRepCV(token);
    } catch (e) {
      console.error('skip cv failed', e);
    }
    navigate(`/rep/${token}/playbook`);
  };

  return (
    <div className="mp-center">
      <div style={{ maxWidth: 480, width: '100%' }}>
        <Card padding="lg" className="mp-text-center">
          <div className="mp-brand-header__overline">Optional</div>
          <h3 className="mp-h3" style={{ marginTop: 8 }}>Want your AI to get even more personal?</h3>
          <p className="mp-body-sm mp-muted" style={{ marginTop: 8, marginBottom: 32 }}>
            Upload your CV and it'll tailor prep briefs to your experience.<br />
            This is optional — everything works without it.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />

          <div style={{ display: 'flex', gap: 12 }}>
            <Button block onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload CV'}
            </Button>
            <Button block variant="outline" onClick={handleSkip}>
              Skip — I'll do this later
            </Button>
          </div>

          {error && <p className="mp-help mp-help--error" style={{ marginTop: 12 }}>{error}</p>}
        </Card>
      </div>
    </div>
  );
}
