import React, { useEffect, useRef, useState } from 'react';
import { LogOut, User as UserIcon, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Floating user menu — fixed top-right of every authenticated page.
 * Click → reveals email, company, and a Sign out button.
 *
 * Mounted once at the top of the app (App.tsx). Hides itself when
 * unauthenticated.
 */
export default function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isAuthenticated || !user) return null;

  const initials = (user.name || user.email)
    .split(/\s+|@/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="mp-user-menu" ref={ref}>
      <button
        type="button"
        className="mp-user-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="mp-user-menu__avatar">{initials}</span>
        <span className="mp-user-menu__name">{user.name || user.email.split('@')[0]}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="mp-user-menu__panel" role="menu">
          <div className="mp-user-menu__header">
            <div className="mp-user-menu__avatar mp-user-menu__avatar--lg">{initials}</div>
            <div className="mp-user-menu__identity">
              <div className="mp-user-menu__display-name">{user.name || user.email}</div>
              <div className="mp-user-menu__email">{user.email}</div>
              {user.companyName && (
                <div className="mp-user-menu__company">{user.companyName}</div>
              )}
            </div>
          </div>

          <div className="mp-user-menu__divider" />

          <button
            type="button"
            className="mp-user-menu__item"
            onClick={() => { setOpen(false); logout(); }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
