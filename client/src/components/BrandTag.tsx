import React from 'react';
import { useLocation } from 'react-router-dom';
import Logo from './Logo';

interface Props {
  variant?: 'fixed' | 'inline';
  align?: 'left' | 'center';
  /**
   * Hide on the AppShell pages — the sidebar there already shows the logo,
   * adding a fixed pill on top would double up. When true, the component
   * returns null on any route under /app/.
   */
  hideOnSidebarPages?: boolean;
}

/**
 * Persistent brand identity shown across every screen:
 *   "Career247 Growth OS"  ·  powered by MerakiPeople
 *
 * The product is "Career247 Growth OS" (the founder-facing name); the engine
 * is MerakiPeople (the parent platform). Defaults to a fixed top-left pill;
 * pass `variant="inline"` to drop it into a flow (e.g. footer of the auth
 * cards).
 */
export default function BrandTag({
  variant = 'fixed',
  align = 'left',
  hideOnSidebarPages = false,
}: Props) {
  const location = useLocation();
  // The /app/* shell already renders the logo + product/powered text in its
  // sidebar header — hide the floating pill there to avoid the double-brand
  // overlap with page titles.
  if (hideOnSidebarPages && location.pathname.startsWith('/app')) {
    return null;
  }
  const cls = [
    'mp-brand-tag',
    `mp-brand-tag--${variant}`,
    align === 'center' ? 'mp-brand-tag--center' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      <Logo variant="light" height={22} />
      <div className="mp-brand-tag__text">
        <span className="mp-brand-tag__product">Growth OS</span>
        <span className="mp-brand-tag__sep">·</span>
        <span className="mp-brand-tag__powered">
          powered by{' '}
          <strong>
            <span className="mp-brand-tag__meraki">Meraki</span>
            <span className="mp-brand-tag__people">People</span>
          </strong>
        </span>
      </div>
    </div>
  );
}
