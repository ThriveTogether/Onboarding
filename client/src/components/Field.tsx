import React from 'react';

interface FieldProps {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: React.ReactNode;
}

export default function Field({ label, required, helper, error, children }: FieldProps) {
  return (
    <div className="mp-field">
      <label className="mp-label">
        {label}
        {required && <span className="mp-label__required">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mp-help mp-help--error">{error}</p>
      ) : helper ? (
        <p className="mp-help">{helper}</p>
      ) : null}
    </div>
  );
}
