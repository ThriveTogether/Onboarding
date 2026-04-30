import React, { useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  CheckCircle,
  Sparkles,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { onboardingAPI } from '../api/onboarding';
import Button from './Button';

interface UploadedCatalogue {
  filename: string;
  format: string;
  pageCount: number;
  truncated: boolean;
  text?: string;
  uploadedAt?: string;
  sizeBytes?: number;
}

interface DetectedProduct {
  name: string;
  source: string;
}

interface Props {
  companyId: string;
  uploaded?: UploadedCatalogue | null;
  detectedProducts?: string[];
  onUploaded: (newDoc: any) => void;
}

const ACCEPT = '.pdf,.docx,.txt,.md,.markdown';
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Mounted at the top of the Knowledge Base doc viewer.
 *
 * Two states:
 * - No catalogue uploaded yet: shows a drop zone + "We saw these products on
 *   your website — confirm or replace by uploading your real catalogue."
 * - Uploaded: shows the file metadata + a text preview + "Replace" button.
 */
export default function CatalogueUploader({
  companyId,
  uploaded,
  detectedProducts = [],
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > MAX_BYTES) {
      setError(`File too large (max 20 MB). Yours is ${formatBytes(file.size)}.`);
      return;
    }
    setError('');
    setProgress(`Parsing ${file.name}…`);
    setUploading(true);
    try {
      const { data } = await onboardingAPI.uploadCatalogue(companyId, file);
      setProgress('');
      onUploaded(data.doc);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Upload failed.');
      setProgress('');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  };

  // ─── Already uploaded state ──────────────────────────────────────────
  if (uploaded) {
    return (
      <div className="mp-catalogue mp-catalogue--uploaded">
        <div className="mp-catalogue__header">
          <div className="mp-catalogue__file">
            <CheckCircle size={18} className="mp-catalogue__check" />
            <div>
              <div className="mp-catalogue__filename">{uploaded.filename}</div>
              <div className="mp-meta">
                {uploaded.format.toUpperCase()} · {uploaded.pageCount} page
                {uploaded.pageCount === 1 ? '' : 's'}
                {uploaded.sizeBytes ? ` · ${formatBytes(uploaded.sizeBytes)}` : ''}
                {uploaded.truncated && ' · truncated for AI context'}
                {uploaded.uploadedAt && ` · uploaded ${new Date(uploaded.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
              </div>
            </div>
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <RefreshCw size={14} /> Replace
            </Button>
          </div>
        </div>
        {uploaded.text && (
          <FormattedExtract text={uploaded.text} />
        )}
        {error && <p className="mp-help mp-help--error" style={{ marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  // ─── No upload yet state ─────────────────────────────────────────────
  return (
    <div className="mp-catalogue">
      {detectedProducts.length > 0 && (
        <div className="mp-callout" style={{ marginBottom: 12 }}>
          <strong>
            <Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            We see you might sell:
          </strong>{' '}
          {detectedProducts.slice(0, 6).map((p, i) => (
            <span key={i} className="mp-tag mp-tag--indigo" style={{ marginRight: 4 }}>
              {p}
            </span>
          ))}
          <span className="mp-body-sm mp-muted" style={{ display: 'block', marginTop: 8 }}>
            That's our guess from your website. The AI will be much sharper if you upload your real
            product catalogue (a brochure, a deck, a one-pager — whatever you actually send to
            customers).
          </span>
        </div>
      )}

      <div
        className={`mp-catalogue__drop ${dragActive ? 'mp-catalogue__drop--active' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="mp-catalogue__drop-icon">
          <Upload size={28} strokeWidth={1.6} />
        </div>
        <div className="mp-catalogue__drop-title">
          {uploading ? 'Uploading + parsing…' : 'Drop your product catalogue here'}
        </div>
        <div className="mp-catalogue__drop-sub">
          {uploading ? progress : 'or click to browse · PDF, DOCX, TXT, or Markdown (max 20 MB)'}
        </div>
        <div className="mp-meta" style={{ marginTop: 12 }}>
          PPT support coming soon — for now, please export slides as PDF.
        </div>
      </div>

      {error && (
        <div className="mp-help mp-help--error" style={{ marginTop: 12 }}>
          <AlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {error}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Renders the extracted text as readable paragraphs, not raw monospace.
 *
 * Heuristics:
 * - Lines that look like ALL-CAPS or end with no punctuation + are short → headings
 * - Lines starting with • / - / * → bullet items grouped into a list
 * - Empty-line gaps → paragraph breaks
 * - Show first ~1500 chars by default, "Read more" expands
 */
function FormattedExtract({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  const visibleText = expanded ? text : text.slice(0, 1500);
  const hasMore = text.length > 1500;

  const blocks = useMemo(() => parseTextBlocks(visibleText), [visibleText]);

  return (
    <div className="mp-catalogue__preview">
      <div className="mp-meta" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <FileText size={11} /> Extracted preview
      </div>
      <div className="mp-catalogue__doc">
        {blocks.map((b, i) => {
          if (b.type === 'separator') return <hr key={i} className="mp-catalogue__doc-hr" />;
          if (b.type === 'heading') {
            const level = b.level ?? 4;
            const cls = `mp-catalogue__doc-h mp-catalogue__doc-h--l${level}`;
            const Tag = (level === 1 ? 'h2' : level === 2 ? 'h3' : level === 3 ? 'h4' : 'h5') as keyof JSX.IntrinsicElements;
            return React.createElement(Tag, { key: i, className: cls }, renderInline(b.text || ''));
          }
          if (b.type === 'list')
            return (
              <ul key={i} className="mp-catalogue__doc-list">
                {(b.items || []).map((item, j) => <li key={j}>{renderInline(item)}</li>)}
              </ul>
            );
          return <p key={i} className="mp-catalogue__doc-p">{renderInline(b.text || '')}</p>;
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          className="mp-catalogue__more"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : `Show full extract (${Math.round(text.length / 1000)}k characters)`}
        </button>
      )}
    </div>
  );
}

interface TextBlock {
  type: 'heading' | 'paragraph' | 'list' | 'separator';
  level?: number; // for heading: 1 (=#), 2 (=##), 3 (=###), 4+ (heuristic)
  text?: string;
  items?: string[];
}

/**
 * Render inline Markdown: **bold** → <strong>. Other inline markup (italic,
 * code, links) is left as plain text — most uploaded catalogues use bold
 * heavily and rarely use the others.
 */
function renderInline(text: string): React.ReactNode[] {
  if (!text.includes('**')) return [text];
  const out: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, i) => {
    const m = part.match(/^\*\*(.+)\*\*$/);
    out.push(m ? <strong key={i}>{m[1]}</strong> : part);
  });
  return out;
}

/**
 * Strip leading YAML frontmatter (the `---` ... `---` block at the very top
 * of many Markdown docs). Without this, the YAML keys flow into the first
 * paragraph as "doc_type: knowledge_base client: ..." which is ugly.
 */
function stripFrontmatter(text: string): string {
  // Must start with --- on its own line, and have a closing --- within ~50 lines.
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return text;
  // Sanity: only strip if it looks like key: value pairs
  const inner = m[1];
  const looksLikeYaml = inner.split('\n').some((l) => /^[a-zA-Z_][a-zA-Z0-9_-]*\s*:/.test(l));
  return looksLikeYaml ? text.slice(m[0].length) : text;
}

function parseTextBlocks(text: string): TextBlock[] {
  const stripped = stripFrontmatter(text);
  const lines = stripped.split(/\n/);
  const blocks: TextBlock[] = [];
  let currentList: string[] | null = null;
  let currentParagraph: string[] = [];

  const flushList = () => {
    if (currentList && currentList.length > 0) {
      blocks.push({ type: 'list', items: currentList });
    }
    currentList = null;
  };
  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push({ type: 'paragraph', text: currentParagraph.join(' ') });
    }
    currentParagraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }

    // Markdown horizontal rule (---, ***, ___)
    if (/^([-*_])\1{2,}\s*$/.test(line)) {
      flushList();
      flushParagraph();
      blocks.push({ type: 'separator' });
      continue;
    }

    // Markdown ATX heading: # / ## / ### / ...
    const mdHeading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (mdHeading) {
      flushList();
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: Math.min(mdHeading[1].length, 4),
        text: mdHeading[2],
      });
      continue;
    }

    // Bullet (skip if it looks like bold marker — `**foo**` could match `*foo`)
    const bulletMatch = line.match(/^[•·●]\s+(.+)$/) || line.match(/^[-*]\s+(?!\*)(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (!currentList) currentList = [];
      currentList.push(bulletMatch[1]);
      continue;
    }

    // Heuristic heading fallback (for non-markdown inputs)
    const isHeading =
      line.length < 90 &&
      !line.includes('**') &&
      (
        (line.toUpperCase() === line && /[A-Z]/.test(line) && line.length > 3) ||
        (!line.match(/[.!?,:;]$/) &&
          line.split(' ').length <= 8 &&
          line.split(' ').every((w) => /^[A-Z0-9]/.test(w) || w.length <= 3))
      );

    if (isHeading) {
      flushList();
      flushParagraph();
      blocks.push({ type: 'heading', level: 4, text: line });
      continue;
    }

    flushList();
    currentParagraph.push(line);
  }

  flushList();
  flushParagraph();
  return blocks;
}
