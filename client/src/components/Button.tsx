import React from 'react';

type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'mp-btn',
    `mp-btn--${variant}`,
    size === 'sm' ? 'mp-btn--sm' : '',
    size === 'lg' ? 'mp-btn--lg' : '',
    block ? 'mp-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
