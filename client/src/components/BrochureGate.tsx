import React, { useState } from 'react';
import { Globe, Upload, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';

interface FreshnessSnapshot {
  freshness: 'fresh' | 'stale' | 'unknown';
  lastModified: string | null;
  copyrightYear: number | null;
  freshnessSignals: string[];
}

interface BrochureGateProps {
  websiteUrl: string;
  detectedProducts: string[];
  freshness: FreshnessSnapshot | null;
  /** Set when the founder has answered the website question. null = not asked yet. */
  websiteIsCurrent: boolean | null;
  onAnswerWebsiteCurrent: (current: boolean) => void;
  onUpload: (file: File) => void;
  uploaded: { fileName?: string } | null;
  onRegenerate: () => void;
  uploading: boolean;
  regenerating: boolean;
}

/**
 * Brochure-step gate: ask the founder whether their website is current
 * before we generate a brochure from it. Smart-defaults the question using
 * the freshness signals we collected during ICP research:
 *  - 'fresh'   → suggest "yes, build from website"
 *  - 'stale'   → suggest "no, upload instead"
 *  - 'unknown' → present the choice neutrally
 *
 * Once answered, either kicks off auto-generation from the website or shows
 * a prominent upload UI. They can always upload later if they don't like
 * what's generated.
 */
export default function BrochureGate({
  websiteUrl,
  detectedProducts,
  freshness,
  websiteIsCurrent,
  onAnswerWebsiteCurrent,
  onUpload,
  uploaded,
  onRegenerate,
  uploading,
  regenerating,
}: BrochureGateProps) {
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Show the question only if the founder hasn't answered AND nothing's
  // uploaded yet AND no products were detected from the website.
  const needsAnswer = websiteIsCurrent === null && !uploaded && detectedProducts.length === 0;
  if (needsAnswer) {
    return (
      <FreshnessQuestion
        websiteUrl={websiteUrl}
        freshness={freshness}
        onAnswer={onAnswerWebsiteCurrent}
      />
    );
  }

  // Founder said no, or website has nothing useful — show upload UI.
  if (websiteIsCurrent === false || (websiteIsCurrent === null && detectedProducts.length === 0 && !uploaded)) {
    return (
      <UploadPanel
        title="Upload your product brochure"
        body="A PDF, deck, or one-pager works. We'll pull product details from it so your AI talks about your real product, not a guess."
        uploaded={uploaded}
        uploading={uploading}
        fileRef={fileRef}
        onFile={onUpload}
        onChangeAnswer={() => onAnswerWebsiteCurrent(true)}
        changeAnswerLabel="Actually, my website is current — build from there"
      />
    );
  }

  // Default path: website is current OR products were already detected.
  return (
    <BuiltFromWebsite
      websiteUrl={websiteUrl}
      detectedProducts={detectedProducts}
      uploaded={uploaded}
      uploading={uploading}
      regenerating={regenerating}
      fileRef={fileRef}
      onFile={onUpload}
      onRegenerate={onRegenerate}
    />
  );
}

function FreshnessQuestion({
  websiteUrl,
  freshness,
  onAnswer,
}: {
  websiteUrl: string;
  freshness: FreshnessSnapshot | null;
  onAnswer: (current: boolean) => void;
}) {
  const status = freshness?.freshness || 'unknown';
  const recommendation =
    status === 'fresh'
      ? { label: 'Looks current', tone: 'good' as const }
      : status === 'stale'
      ? { label: 'Looks out of date', tone: 'warn' as const }
      : { label: 'Hard to tell', tone: 'neutral' as const };

  const toneColor =
    recommendation.tone === 'good'
      ? 'var(--mp-success)'
      : recommendation.tone === 'warn'
      ? '#c47a07'
      : 'var(--fg-2)';

  return (
    <div className="mp-brochure-gate">
      <div className="mp-brochure-gate__icon" style={{ background: 'var(--bg-brand-soft)', color: 'var(--mp-indigo)' }}>
        <Globe size={28} strokeWidth={2} />
      </div>
      <h3 className="mp-h4" style={{ margin: '12px 0 4px' }}>Is your website up to date?</h3>
      <p className="mp-body-sm mp-muted" style={{ marginBottom: 16 }}>
        We'll build your product brochure from{' '}
        {websiteUrl ? <strong>{websiteUrl}</strong> : 'your website'}. If it's current, that's the fastest way. If not, you can upload a brochure or deck instead.
      </p>

      {freshness && (freshness.freshnessSignals?.length ?? 0) > 0 && (
        <div
          className="mp-brochure-gate__signals"
          style={{ borderColor: toneColor, color: 'var(--fg-1)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {recommendation.tone === 'good' ? (
              <Check size={14} style={{ color: toneColor }} />
            ) : recommendation.tone === 'warn' ? (
              <AlertTriangle size={14} style={{ color: toneColor }} />
            ) : null}
            <strong style={{ color: toneColor }}>What we found: {recommendation.label}</strong>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--fs-xs)', color: 'var(--fg-2)' }}>
            {freshness.freshnessSignals.slice(0, 3).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mp-brochure-gate__actions">
        <Button onClick={() => onAnswer(true)} variant={status === 'stale' ? 'outline' : 'primary'}>
          Yes, build from my website
        </Button>
        <Button onClick={() => onAnswer(false)} variant={status === 'stale' ? 'primary' : 'outline'}>
          No, I'll upload a brochure
        </Button>
      </div>
    </div>
  );
}

function UploadPanel({
  title,
  body,
  uploaded,
  uploading,
  fileRef,
  onFile,
  onChangeAnswer,
  changeAnswerLabel,
}: {
  title: string;
  body: string;
  uploaded: { fileName?: string } | null;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement>;
  onFile: (file: File) => void;
  onChangeAnswer: () => void;
  changeAnswerLabel: string;
}) {
  return (
    <div className="mp-brochure-gate">
      <div className="mp-brochure-gate__icon" style={{ background: 'var(--mp-coral-100)', color: 'var(--mp-coral)' }}>
        <Upload size={28} strokeWidth={2} />
      </div>
      <h3 className="mp-h4" style={{ margin: '12px 0 4px' }}>{title}</h3>
      <p className="mp-body-sm mp-muted" style={{ marginBottom: 16 }}>{body}</p>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.pptx,.txt,.md"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      {uploaded?.fileName ? (
        <div className="mp-brochure-gate__uploaded">
          <Check size={16} style={{ color: 'var(--mp-success)' }} />
          <span style={{ flex: 1 }}>
            <strong>{uploaded.fileName}</strong> — uploaded.
          </span>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            Replace
          </Button>
        </div>
      ) : (
        <Button onClick={() => fileRef.current?.click()} size="lg" disabled={uploading}>
          {uploading ? 'Uploading…' : 'Choose file'}
        </Button>
      )}

      <button
        type="button"
        className="mp-brochure-gate__alt"
        onClick={onChangeAnswer}
      >
        {changeAnswerLabel}
      </button>
    </div>
  );
}

function BuiltFromWebsite({
  websiteUrl,
  detectedProducts,
  uploaded,
  uploading,
  regenerating,
  fileRef,
  onFile,
  onRegenerate,
}: {
  websiteUrl: string;
  detectedProducts: string[];
  uploaded: { fileName?: string } | null;
  uploading: boolean;
  regenerating: boolean;
  fileRef: React.RefObject<HTMLInputElement>;
  onFile: (file: File) => void;
  onRegenerate: () => void;
}) {
  return (
    <div>
      <div className="mp-brochure-gate__source">
        <div className="mp-brochure-gate__source-icon">
          <Globe size={14} strokeWidth={2.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mp-overline">Building from</div>
          <div style={{ fontWeight: 'var(--fw-semibold)' }}>{websiteUrl || 'your website'}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={regenerating}>
          <RefreshCw size={12} strokeWidth={2.5} className={regenerating ? 'mp-spin' : ''} /> Regenerate
        </Button>
      </div>

      {detectedProducts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="mp-overline" style={{ marginBottom: 8 }}>What we found on your site</div>
          <div className="mp-brochure-gate__chips">
            {detectedProducts.map((p, i) => (
              <span key={i} className="mp-brochure-gate__chip">{p}</span>
            ))}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.pptx,.txt,.md"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      <div className="mp-brochure-gate__upload-fallback">
        {uploaded?.fileName ? (
          <div className="mp-brochure-gate__uploaded">
            <Check size={16} style={{ color: 'var(--mp-success)' }} />
            <span style={{ flex: 1 }}>
              Using your uploaded brochure: <strong>{uploaded.fileName}</strong>
            </span>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              Replace
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="mp-brochure-gate__alt"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={12} /> Not happy with what we generated? Upload your own brochure instead
          </button>
        )}
      </div>
    </div>
  );
}
