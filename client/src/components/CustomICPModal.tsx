import React, { useRef, useState } from 'react';
import { X, Upload, Sparkles, FileText } from 'lucide-react';
import Button from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void> | void;
  submitting?: boolean;
  error?: string;
}

/**
 * Modal that lets the founder paste their own ICP description (from a deck,
 * sales doc, or typed out) instead of relying on the AI's 3 variants.
 *
 * Accepts: textarea paste OR text-file upload (.txt, .md). For .pdf/.docx we
 * surface a friendly hint to copy-paste — full document parsing lives in the
 * roadmap, not the MVP.
 */
export default function CustomICPModal({
  open,
  onClose,
  onSubmit,
  submitting = false,
  error,
}: Props) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [localError, setLocalError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFile = (file: File) => {
    setLocalError('');
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'md', 'markdown'].includes(ext || '')) {
      setLocalError(
        'Only .txt and .md uploads are supported right now. For PDFs or Word docs, please paste the relevant section into the box below.'
      );
      return;
    }
    if (file.size > 200_000) {
      setLocalError('File too large (max 200 KB). Try pasting the most relevant section instead.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      setText((prev) => (prev ? prev + '\n\n' : '') + content);
      setFileName(file.name);
    };
    reader.onerror = () => setLocalError('Could not read the file. Try copy-pasting instead.');
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!text.trim()) {
      setLocalError('Paste your ICP description, or upload a .txt / .md file.');
      return;
    }
    setLocalError('');
    await onSubmit(text);
  };

  const close = () => {
    if (submitting) return;
    setText('');
    setFileName('');
    setLocalError('');
    onClose();
  };

  return (
    <div className="mp-modal-overlay" onClick={close}>
      <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mp-modal__header">
          <div className="mp-modal__title">
            <Sparkles size={18} className="mp-modal__title-icon" />
            <h3 style={{ margin: 0 }}>Use your own ICP</h3>
          </div>
          <button className="mp-modal__close" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="mp-modal__body">
          <p className="mp-body-sm mp-muted" style={{ marginTop: 0 }}>
            Paste your ICP description from a deck, sales doc, or just type it out. The AI will
            extract the structured fields (industry, size, geography, decision makers, pain
            signals) and add this as a 4th variant you can lock alongside the AI's suggestions.
          </p>

          <div className="mp-field">
            <label className="mp-label">Your ICP description</label>
            <textarea
              className="mp-textarea"
              rows={9}
              placeholder={`Example:\n\nWe sell to mid-market manufacturers in India (50–500 employees) struggling to scale their sales team beyond Excel. Decision makers are usually the VP Sales or Founder. Strong signals include: just raised funding, hiring SDRs, public mentions of pipeline pain.`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="mp-row" style={{ alignItems: 'center', gap: 12, marginTop: 4 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              <Upload size={14} /> Upload .txt / .md
            </Button>
            {fileName && (
              <span className="mp-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FileText size={12} /> {fileName}
              </span>
            )}
          </div>

          {(localError || error) && (
            <p className="mp-help mp-help--error" style={{ marginTop: 12 }}>
              {localError || error}
            </p>
          )}
        </div>

        <footer className="mp-modal__footer">
          <Button variant="ghost" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !text.trim()}>
            {submitting ? 'Parsing your ICP…' : 'Parse + add as variant'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
