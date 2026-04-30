import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface WizardBackLinkProps {
  to: string;
  label?: string;
}

export default function WizardBackLink({ to, label }: WizardBackLinkProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--fg-2)',
        fontSize: 'var(--fs-sm)',
        fontWeight: 500,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '8px 0',
        marginBottom: 12,
      }}
      onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--mp-indigo)'; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--fg-2)'; }}
    >
      <ArrowLeft size={14} strokeWidth={2} /> {label || 'Back'}
    </button>
  );
}
