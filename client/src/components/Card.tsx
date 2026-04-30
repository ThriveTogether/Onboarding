import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'tinted' | 'accent';
  padding?: 'md' | 'lg';
}

export default function Card({ tone = 'default', padding = 'md', className = '', children, ...rest }: CardProps) {
  const classes = [
    'mp-card',
    padding === 'lg' ? 'mp-card--lg' : '',
    tone === 'tinted' ? 'mp-card--tinted' : '',
    tone === 'accent' ? 'mp-card--accent' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
