import React from 'react';
import Logo from './Logo';

interface BrandHeaderProps {
  title: string;
  subtitle?: string;
}

export default function BrandHeader({ title, subtitle }: BrandHeaderProps) {
  return (
    <header className="mp-brand-header">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-5)' }}>
        <Logo variant="light" height={36} />
      </div>
      <h2 className="mp-h2" style={{ margin: 0 }}>{title}</h2>
      {subtitle && (
        <p className="mp-body-sm" style={{ marginTop: 6, marginBottom: 0, color: 'var(--fg-2)' }}>
          {subtitle}
        </p>
      )}
    </header>
  );
}
