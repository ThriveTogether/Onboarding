import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface EvidenceSectionProps {
  /** Either a plain string (rendered verbatim) or an object whose keys/values become rows. */
  evidence: string | Record<string, any> | null | undefined;
  label?: string;
  compact?: boolean;
  className?: string;
  /** Default state. Most usage stays collapsed. */
  defaultOpen?: boolean;
}

/**
 * Mirror of MerakiPeople's EvidenceSection — used everywhere the AI surfaces
 * a claim with a source. Keeps content scannable: by default just a chip-style
 * button, expands into a quoted slate-bordered block.
 */
export default function EvidenceSection({
  evidence,
  label = 'Evidence',
  compact = false,
  className = '',
  defaultOpen = false,
}: EvidenceSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!evidence) return null;

  const text =
    typeof evidence === 'string'
      ? evidence
      : Object.entries(evidence)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => {
            const niceKey = k
              .replace(/_/g, ' ')
              .replace(/([A-Z])/g, ' $1')
              .replace(/\b\w/g, (l) => l.toUpperCase())
              .trim();
            const niceVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
            return `${niceKey}: ${niceVal}`;
          })
          .join('\n');

  if (!text) return null;

  return (
    <div className={`mp-evidence ${compact ? 'mp-evidence--compact' : ''} ${className}`}>
      <button
        type="button"
        className="mp-evidence__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <FileText size={compact ? 12 : 14} />
        <span>{label}</span>
        {open ? <ChevronUp size={compact ? 12 : 14} /> : <ChevronDown size={compact ? 12 : 14} />}
      </button>
      {open && <div className="mp-evidence__body">{text}</div>}
    </div>
  );
}
