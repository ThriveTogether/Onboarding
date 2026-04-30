import React from 'react';

type BadgeTone = 'brand' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: string;
}

const DOT_COLOR: Record<BadgeTone, string> = {
  brand: 'var(--mp-indigo)',
  accent: 'var(--mp-coral)',
  success: '#0D9488',
  warning: '#F59E0B',
  error: '#DC2626',
  info: '#3B82F6',
  neutral: 'var(--fg-3)',
};

export default function Badge({ tone = 'brand', dot, className = '', children, ...rest }: BadgeProps) {
  const classes = ['mp-badge', `mp-badge--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes} {...rest}>
      {dot !== undefined && <span className="mp-badge__dot" style={{ background: dot || DOT_COLOR[tone] }} />}
      {children}
    </span>
  );
}
