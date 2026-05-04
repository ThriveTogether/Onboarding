import React, { useEffect, useRef, useState } from 'react';
import { Download, MessageSquarePlus, Upload, Check, RefreshCw, FileText, Sparkles, Image as ImageIcon, Palette } from 'lucide-react';
import Button from './Button';

/**
 * Download-and-feedback UX for nurture_strategy + brand_guidelines.
 *
 * Replaces the inline block-text rendering. The full doc body is rendered
 * to a printable HTML page that opens in a new tab — the founder uses the
 * browser's "Save as PDF" to download. The on-page surface is just a
 * three-bullet glance-check, big actions (download / feedback / upload),
 * and a "using your uploaded version" indicator if they replaced the
 * AI-generated content.
 */

interface DocLike {
  kind: 'nurture_strategy' | 'brand_guidelines';
  title: string;
  content: any;
  rawMarkdown?: string;
}

interface DocDownloadGateProps {
  doc: DocLike;
  companyName?: string;
  /** Opens a feedback drawer + posts the freeform feedback into the regen call. */
  onRegenerateWithFeedback: (feedback: string) => Promise<void>;
  /** File upload — replaces AI-generated content with founder's source. */
  onUpload: (file: File) => Promise<void>;
  /** Brand-only: save primary/secondary color hex codes. */
  onSaveColors?: (colors: { primary?: string; secondary?: string }) => Promise<void>;
  /** Brand-only: upload a logo image (PNG/JPG/SVG). */
  onUploadLogo?: (file: File) => Promise<void>;
  regenerating: boolean;
  uploading: boolean;
}

export default function DocDownloadGate({
  doc,
  companyName,
  onRegenerateWithFeedback,
  onUpload,
  onSaveColors,
  onUploadLogo,
  regenerating,
  uploading,
}: DocDownloadGateProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const uploaded = doc.content?.sourceUpload as
    | { filename?: string; pageCount?: number; uploadedAt?: string }
    | undefined;

  const isBrand = doc.kind === 'brand_guidelines';
  const colors = (doc.content?.colors || {}) as { primary?: string; secondary?: string };
  const logo = doc.content?.logo as { dataUrl?: string; filename?: string } | undefined;

  // Local color state — debounced save so dragging the picker doesn't spam.
  const [primary, setPrimary] = useState<string>(colors.primary || '');
  const [secondary, setSecondary] = useState<string>(colors.secondary || '');
  useEffect(() => {
    setPrimary(colors.primary || '');
    setSecondary(colors.secondary || '');
  }, [colors.primary, colors.secondary]);

  const handleColorCommit = async (which: 'primary' | 'secondary', value: string) => {
    if (!onSaveColors) return;
    await onSaveColors({ [which]: value });
  };

  const highlights = extractHighlights(doc);

  const handleDownload = () => {
    const html = renderPrintableHTML(doc, companyName || '');
    const w = window.open('', '_blank');
    if (!w) {
      alert('Pop-up blocked. Allow pop-ups to download.');
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const handleSubmitFeedback = async () => {
    const trimmed = feedbackText.trim();
    if (!trimmed) return;
    await onRegenerateWithFeedback(trimmed);
    setFeedbackText('');
    setFeedbackOpen(false);
  };

  return (
    <div className="mp-doc-gate">
      {/* Source indicator — what's currently powering this doc. */}
      <div className="mp-doc-gate__source">
        <div className="mp-doc-gate__source-icon">
          {uploaded ? <FileText size={14} strokeWidth={2.5} /> : <Sparkles size={14} strokeWidth={2.5} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mp-overline">
            {uploaded ? 'Using your uploaded version' : 'Generated from your research'}
          </div>
          <div style={{ fontWeight: 'var(--fw-semibold)', fontSize: 'var(--fs-sm)' }}>
            {uploaded?.filename || doc.title}
          </div>
        </div>
      </div>

      {/* Glance-check highlights — three bullets so the founder can sanity-check
          direction without downloading. */}
      {highlights.length > 0 && (
        <ul className="mp-doc-gate__highlights">
          {highlights.map((h, i) => (
            <li key={i}>
              <strong>{h.label}:</strong> {h.value}
            </li>
          ))}
        </ul>
      )}

      {/* Brand-only assets: color palette + logo. Color values save on
          commit (onBlur / picker close) so dragging doesn't spam the API. */}
      {isBrand && onSaveColors && (
        <div className="mp-doc-gate__assets">
          <div className="mp-doc-gate__assets-head">
            <Palette size={14} strokeWidth={2.5} />
            <span>Brand assets</span>
          </div>
          <div className="mp-doc-gate__color-row">
            <label className="mp-doc-gate__color">
              <span className="mp-overline">Primary</span>
              <span className="mp-doc-gate__swatch-row">
                <input
                  type="color"
                  value={primary || '#152b68'}
                  onChange={(e) => setPrimary(e.target.value)}
                  onBlur={() => primary !== (colors.primary || '') && handleColorCommit('primary', primary)}
                  className="mp-doc-gate__swatch"
                  aria-label="Primary brand color"
                />
                <input
                  type="text"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  onBlur={() => primary !== (colors.primary || '') && handleColorCommit('primary', primary)}
                  placeholder="#152b68"
                  className="mp-input mp-doc-gate__hex-input"
                />
              </span>
            </label>
            <label className="mp-doc-gate__color">
              <span className="mp-overline">Secondary</span>
              <span className="mp-doc-gate__swatch-row">
                <input
                  type="color"
                  value={secondary || '#ff6f61'}
                  onChange={(e) => setSecondary(e.target.value)}
                  onBlur={() => secondary !== (colors.secondary || '') && handleColorCommit('secondary', secondary)}
                  className="mp-doc-gate__swatch"
                  aria-label="Secondary brand color"
                />
                <input
                  type="text"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  onBlur={() => secondary !== (colors.secondary || '') && handleColorCommit('secondary', secondary)}
                  placeholder="#ff6f61"
                  className="mp-input mp-doc-gate__hex-input"
                />
              </span>
            </label>
          </div>

          <div className="mp-doc-gate__logo-row">
            <span className="mp-overline">Logo</span>
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && onUploadLogo) onUploadLogo(f);
                e.target.value = '';
              }}
            />
            {logo?.dataUrl ? (
              <div className="mp-doc-gate__logo-preview">
                <img src={logo.dataUrl} alt="Brand logo" />
                <span className="mp-meta" style={{ flex: 1, marginLeft: 10 }}>
                  {logo.filename}
                </span>
                <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>
                  Replace
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>
                <ImageIcon size={14} strokeWidth={2.5} /> Upload your logo (PNG/SVG)
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Primary actions */}
      <div className="mp-doc-gate__actions">
        <Button onClick={handleDownload}>
          <Download size={14} strokeWidth={2.5} /> Download as PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => setFeedbackOpen((v) => !v)}
          disabled={regenerating}
        >
          <MessageSquarePlus size={14} strokeWidth={2.5} /> Give feedback
        </Button>
        <Button
          variant="ghost"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Upload size={14} strokeWidth={2.5} /> Upload your own
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />

      {/* Inline feedback drawer */}
      {feedbackOpen && (
        <div className="mp-doc-gate__feedback">
          <label className="mp-label" htmlFor="doc-feedback">
            What would you change?
          </label>
          <textarea
            id="doc-feedback"
            className="mp-textarea"
            rows={4}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder={
              doc.kind === 'nurture_strategy'
                ? 'e.g. "Drop WhatsApp from cold — our buyers don\'t use it. Tone is too aggressive at hot stage."'
                : 'e.g. "Sound more peer-to-peer, less salesy. Use first-person plural."'
            }
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setFeedbackOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitFeedback} disabled={!feedbackText.trim() || regenerating} size="sm">
              <RefreshCw size={12} strokeWidth={2.5} className={regenerating ? 'mp-spin' : ''} />
              {regenerating ? 'Regenerating…' : 'Regenerate with feedback'}
            </Button>
          </div>
        </div>
      )}

      {uploaded && (
        <div className="mp-doc-gate__uploaded">
          <Check size={14} style={{ color: 'var(--mp-success)' }} />
          <span style={{ flex: 1 }}>
            Your AI is using <strong>{uploaded.filename}</strong>
            {uploaded.pageCount ? ` (${uploaded.pageCount} pages)` : ''} as the source of truth.
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Three-bullet glance-check. Pulls the most informative one-liners out of
 * the structured doc content so the founder can see direction at a glance.
 */
function extractHighlights(doc: DocLike): Array<{ label: string; value: string }> {
  const c = doc.content || {};
  const out: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: any) => {
    const v = toShortStr(value);
    if (v) out.push({ label, value: v });
  };

  if (doc.kind === 'nurture_strategy') {
    const cold = c.coldOutreach || {};
    const warm = c.warmEngaged || {};
    const hot = c.hotRepReady || {};
    push('Cold', joinDefined([cold.channelPrimary, cold.tone], ' · '));
    push('Warm', joinDefined([warm.channel, warm.approach], ' · '));
    push('Hot', joinDefined([hot.handoffTrigger, hot.repAction], ' · '));
  } else if (doc.kind === 'brand_guidelines') {
    const v = c.voice || {};
    push('Tone', v.tone);
    const dos = Array.isArray(c.dos) ? c.dos.slice(0, 2).join('; ') : '';
    if (dos) push('Do', dos);
    const donts = Array.isArray(c.donts) ? c.donts.slice(0, 2).join('; ') : '';
    if (donts) push("Don't", donts);
  }
  return out.slice(0, 3);
}

function joinDefined(parts: any[], sep: string): string {
  return parts
    .map(toShortStr)
    .filter(Boolean)
    .join(sep);
}

function toShortStr(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return truncate(v, 140);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return truncate(v.filter(Boolean).join(', '), 140);
  return '';
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Render the doc to a self-contained, printable HTML page with print-friendly
 * styling. The founder uses the browser's native "Save as PDF" to download.
 * No PDF library needed — works everywhere.
 */
function renderPrintableHTML(doc: DocLike, companyName: string): string {
  const c = doc.content || {};
  let body = '';

  if (doc.kind === 'nurture_strategy') {
    const cold = c.coldOutreach || {};
    const warm = c.warmEngaged || {};
    const hot = c.hotRepReady || {};
    body = `
      <h2>Cold outreach</h2>
      ${rowsHTML([
        ['Primary channel', cold.channelPrimary],
        ['Secondary channel', cold.channelSecondary],
        ['Tone', cold.tone],
        ['First message approach', cold.firstMessageApproach],
        ['Cadence', Array.isArray(cold.frequencyDays) ? `Days ${cold.frequencyDays.join(', ')}` : cold.cadence],
        ['Escalation', cold.escalation],
      ])}

      <h2>Warm follow-up</h2>
      ${rowsHTML([
        ['Channel', warm.channel],
        ['Tone', warm.tone],
        ['Approach', warm.approach],
        ['Proactive interval', warm.proactiveIntervalDays ? `Every ${warm.proactiveIntervalDays} days` : ''],
        ['Escalation', warm.escalation],
      ])}

      <h2>Hot — handoff</h2>
      ${rowsHTML([
        ['Channel', hot.channel],
        ['Handoff trigger', hot.handoffTrigger],
        ['Rep action', hot.repAction],
      ])}

      ${c.rationale ? `<h2>Why this works</h2>${rationaleHTML(String(c.rationale))}` : ''}
    `;
  } else if (doc.kind === 'brand_guidelines') {
    const v = c.voice || {};
    const dos = Array.isArray(c.dos) ? c.dos : [];
    const donts = Array.isArray(c.donts) ? c.donts : [];
    const samples = c.samples || {};
    const colors = c.colors || {};
    const logo = c.logo || {};
    const hasAssets = colors.primary || colors.secondary || logo.dataUrl;
    body = `
      ${
        hasAssets
          ? `<h2>Brand assets</h2>
             <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;margin:8px 0 12px;">
               ${
                 logo.dataUrl
                   ? `<div><div class="overline" style="font-size:11px;color:#5d6a93;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Logo</div>
                      <img src="${escapeHTML(logo.dataUrl)}" alt="Brand logo" style="max-width:140px;max-height:80px;object-fit:contain;background:#fff;border:1px solid #e2e6f1;border-radius:6px;padding:8px;" /></div>`
                   : ''
               }
               ${colors.primary ? colorSwatchHTML('Primary', colors.primary) : ''}
               ${colors.secondary ? colorSwatchHTML('Secondary', colors.secondary) : ''}
             </div>`
          : ''
      }
      <h2>Voice</h2>
      ${rowsHTML([
        ['Tone', v.tone],
        ['Language level', v.languageLevel],
        ['First-person style', v.firstPersonStyle],
        ['Sign-off style', v.signOffStyle],
        ['Business hours', c.businessHours],
      ])}

      <h2>Do</h2>
      <ul>${dos.map((d: string) => `<li>${escapeHTML(String(d))}</li>`).join('')}</ul>

      <h2>Don't</h2>
      <ul>${donts.map((d: string) => `<li>${escapeHTML(String(d))}</li>`).join('')}</ul>

      ${
        samples.coldWhatsApp || samples.followupWhatsApp
          ? `<h2>Sample messages</h2>
             ${samples.coldWhatsApp ? `<h3>Cold</h3><blockquote>${escapeHTML(String(samples.coldWhatsApp))}</blockquote>` : ''}
             ${samples.followupWhatsApp ? `<h3>Follow-up</h3><blockquote>${escapeHTML(String(samples.followupWhatsApp))}</blockquote>` : ''}`
          : ''
      }

      ${c.rationale ? `<h2>Why this works</h2>${rationaleHTML(String(c.rationale))}` : ''}
    `;
  } else {
    body = `<pre>${escapeHTML(doc.rawMarkdown || JSON.stringify(c, null, 2))}</pre>`;
  }

  const title = `${doc.title}${companyName ? ` — ${companyName}` : ''}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHTML(title)}</title>
<style>
  @page { margin: 24mm 18mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif; color: #152b68; line-height: 1.55; max-width: 760px; margin: 32px auto; padding: 0 24px; }
  h1 { font-size: 28px; margin: 0 0 6px; color: #152b68; }
  h1 .sub { display: block; font-size: 14px; font-weight: 400; color: #5d6a93; margin-top: 6px; }
  h2 { font-size: 17px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e6f1; color: #152b68; }
  h3 { font-size: 14px; margin: 18px 0 6px; color: #3a4a7a; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; font-size: 14px; }
  td { padding: 6px 0; vertical-align: top; }
  td:first-child { width: 180px; color: #5d6a93; font-weight: 500; padding-right: 18px; }
  ul { margin: 6px 0 12px; padding-left: 22px; font-size: 14px; }
  li { margin-bottom: 4px; }
  blockquote { margin: 6px 0 14px; padding: 10px 14px; background: #f4f6fb; border-left: 3px solid #ff6f61; border-radius: 4px; font-size: 14px; }
  pre { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; }
  .meta { font-size: 12px; color: #5d6a93; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e6f1; }
  @media print {
    body { margin: 0; padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<h1>${escapeHTML(title)}<span class="sub">Generated by MerakiPeople</span></h1>
<div class="no-print" style="background:#f4f6fb;padding:10px 14px;border-radius:6px;margin:16px 0;font-size:13px;">
  <strong>Save dialog should open automatically.</strong> If it doesn't, press Ctrl/Cmd&nbsp;+&nbsp;P and choose "Save as PDF".
</div>
${body}
<div class="meta">Generated ${new Date().toLocaleDateString()}.</div>
<script>
  // Auto-trigger the browser's print dialog so the founder lands directly
  // on "Save as PDF" instead of having to find Ctrl+P themselves. Small
  // delay lets fonts + styles settle before the print snapshot.
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 350);
  });
</script>
</body>
</html>`;
}

function colorSwatchHTML(label: string, hex: string): string {
  const safeHex = escapeHTML(hex);
  return `<div>
    <div style="font-size:11px;color:#5d6a93;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">${escapeHTML(label)}</div>
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:48px;height:48px;border-radius:8px;background:${safeHex};border:1px solid #e2e6f1;"></div>
      <code style="font-size:13px;color:#152b68;font-family:ui-monospace,SFMono-Regular,monospace;">${safeHex}</code>
    </div>
  </div>`;
}

function rowsHTML(rows: Array<[string, any]>): string {
  // Print path uses the FULL strings — no truncation. (Highlights use
  // toShortStr to keep the on-screen card compact, but the downloaded
  // doc is meant to be the complete reference.)
  const visible = rows.filter(([, v]) => {
    const s = toFullStr(v);
    return s && s.length > 0;
  });
  if (visible.length === 0) return '<p style="color:#5d6a93">— not specified —</p>';
  return `<table>${visible
    .map(([k, v]) => `<tr><td>${escapeHTML(k)}</td><td>${escapeHTML(toFullStr(v))}</td></tr>`)
    .join('')}</table>`;
}

function toFullStr(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return '';
}

/**
 * Break a long rationale string into paragraphs the founder will actually
 * read. The LLM tends to write rationales as one block of 5-10 sentences
 * with discoverable topic markers ("The coldOutreach stage...", "The
 * handoffTrigger is concrete..."). We:
 *  1. Split into sentences.
 *  2. Group sentences that start a new "topic" into their own paragraph
 *     (heuristic: capital-letter noun-phrase openers like "The X", "WhatsApp",
 *     proper nouns we can detect from prior context).
 *  3. Cap any single paragraph at 3 sentences so nothing turns into a wall.
 *  4. Optionally promote a short topic-opener line into a subheading.
 */
function rationaleHTML(rationale: string): string {
  if (!rationale || !rationale.trim()) return '';
  const sentences = splitSentences(rationale.trim());
  if (sentences.length <= 2) {
    return `<p>${escapeHTML(rationale)}</p>`;
  }

  // Topic markers that often start a new logical section in our prompts.
  // Brand rationales open paragraphs with DOs/DON'Ts/Sample/Business/Tone/Voice;
  // nurture rationales tend to use The-X. Cover both.
  const topicRe =
    /^(The\s+[A-Z]?\w+|DO[Nn]?'?[Tt]?s?\s|DOs\s|DON'Ts\s|DONT'?s\s|Sample|Business|Tone|Voice|Style|Cadence|Channel|This|Their|Approved|Founder|WhatsApp|Email|LinkedIn|First|Second|Third|Finally|Note|Important)/;

  type Para = { sentences: string[] };
  const paragraphs: Para[] = [];
  let current: Para = { sentences: [] };

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const startsNewTopic = i > 0 && topicRe.test(s);
    if (startsNewTopic && current.sentences.length > 0) {
      paragraphs.push(current);
      current = { sentences: [] };
    }
    current.sentences.push(s);
    // Cap at 2 sentences per paragraph — brand rationales tend to be one
    // dense thought per sentence, so 3-sentence groups still feel like
    // walls. 2 sentences gives the founder breathing room between ideas.
    if (current.sentences.length >= 2) {
      paragraphs.push(current);
      current = { sentences: [] };
    }
  }
  if (current.sentences.length > 0) paragraphs.push(current);

  return paragraphs
    .map((p) => `<p>${escapeHTML(p.sentences.join(' '))}</p>`)
    .join('\n');
}

function splitSentences(text: string): string[] {
  // Naive but good enough for our content: split on `. ` followed by a
  // capital letter, preserving the period. Avoid splitting on common
  // abbreviations / decimals.
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    buf += text[i];
    if (text[i] === '.' && /\s/.test(text[i + 1] || '') && /[A-Z]/.test(text[i + 2] || '')) {
      out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function escapeHTML(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
