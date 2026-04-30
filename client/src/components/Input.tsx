import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export default function Input({ hasError, className = '', ...rest }: InputProps) {
  const classes = ['mp-input', hasError ? 'mp-input--error' : '', className].filter(Boolean).join(' ');
  return <input className={classes} {...rest} />;
}
