import React from 'react';
import Card from '../../components/Card';

export default function PlaceholderPage({
  title,
  subtitle,
  bodyTitle,
  bodyLines,
}: {
  title: string;
  subtitle: string;
  bodyTitle: string;
  bodyLines: string[];
}) {
  return (
    <>
      <header className="mp-page-header">
        <h1 className="mp-page-header__title">{title}</h1>
        <p className="mp-page-header__subtitle">{subtitle}</p>
      </header>
      <Card padding="lg">
        <h3 className="mp-h4" style={{ marginTop: 0 }}>{bodyTitle}</h3>
        {bodyLines.map((line, i) => (
          <p key={i} className="mp-body-sm mp-muted" style={{ marginTop: i === 0 ? 8 : 0 }}>{line}</p>
        ))}
      </Card>
    </>
  );
}
