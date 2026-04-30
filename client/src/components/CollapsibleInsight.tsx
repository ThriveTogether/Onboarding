import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Info,
  XCircle,
  Sparkles,
} from 'lucide-react';

export type InsightTone =
  | 'suggestion' // blue · AlertTriangle — improvements / things to consider
  | 'strength'   // green · CheckCircle — wins / positive signals
  | 'tip'        // amber · Lightbulb — helpful guidance
  | 'info'       // gray · Info — neutral context
  | 'warning'    // red · XCircle — red flags / mistakes
  | 'magic';     // indigo · Sparkles — AI-generated highlights

interface Props {
  title: string;
  description?: React.ReactNode;
  tone?: InsightTone;
  defaultOpen?: boolean;
  className?: string;
}

const TONE_CONFIG: Record<InsightTone, { icon: any; cls: string }> = {
  suggestion: { icon: AlertTriangle, cls: 'mp-insight--suggestion' },
  strength:   { icon: CheckCircle,    cls: 'mp-insight--strength'   },
  tip:        { icon: Lightbulb,      cls: 'mp-insight--tip'        },
  info:       { icon: Info,           cls: 'mp-insight--info'       },
  warning:    { icon: XCircle,        cls: 'mp-insight--warning'    },
  magic:      { icon: Sparkles,       cls: 'mp-insight--magic'      },
};

/**
 * Mirror of MerakiPeople's CollapsibleSuggestionItem — single insight row
 * with a tone (colour theme), an icon, a title, and optional expandable body.
 * Used in lists where each item is a discrete insight that may have detail
 * the user can drill into.
 */
export default function CollapsibleInsight({
  title,
  description,
  tone = 'info',
  defaultOpen = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = TONE_CONFIG[tone];
  const Icon = cfg.icon;
  const hasBody = !!description;

  return (
    <div className={`mp-insight ${cfg.cls} ${className}`}>
      <button
        type="button"
        className="mp-insight__header"
        onClick={() => hasBody && setOpen((v) => !v)}
        disabled={!hasBody}
        aria-expanded={open}
      >
        <Icon size={16} className="mp-insight__icon" strokeWidth={2.2} />
        <span className="mp-insight__title">{title}</span>
        {hasBody && (
          <span className="mp-insight__chevron">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        )}
      </button>
      {open && hasBody && <div className="mp-insight__body">{description}</div>}
    </div>
  );
}
