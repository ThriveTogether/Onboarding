import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Briefcase,
  Target,
  FileText,
  Workflow,
  Gauge,
  Palette,
  Building2,
  Users,
  LogOut,
} from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../contexts/AuthContext';

const NAV = [
  { to: '/app/company-profile', label: 'Company\nProfile', icon: Briefcase },
  { to: '/app/target-profile', label: 'Target\nProfiles', icon: Target },
  { to: '/app/product-brochure', label: 'Product\nBrochure', icon: FileText },
  { to: '/app/nurture-strategy', label: 'Nurture\nStrategy', icon: Workflow },
  { to: '/app/lead-score-framework', label: 'Lead Score\nFramework', icon: Gauge },
  { to: '/app/branding-guidelines', label: 'Branding\nGuidelines', icon: Palette },
  { to: '/app/accounts', label: 'Accounts', icon: Building2 },
  { to: '/app/leads', label: 'Leads', icon: Users },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="mp-shell">
      <aside className="mp-sidebar">
        <div className="mp-sidebar__brand">
          <Logo variant="dark" height={26} />
          <div className="mp-sidebar__brand-sub">
            <span className="mp-sidebar__product">Growth OS</span>
            <span className="mp-sidebar__powered">powered by MerakiPeople</span>
          </div>
        </div>
        <nav className="mp-sidebar__nav" style={{ flex: 1 }}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `mp-nav-item ${isActive ? 'mp-nav-item--active' : ''}`
              }
            >
              <Icon size={22} strokeWidth={1.8} className="mp-nav-item__icon" />
              <span className="mp-nav-item__label">
                {label.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <br />}
                    {line}
                  </React.Fragment>
                ))}
              </span>
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {user && (
            <div style={{
              padding: '10px 8px',
              fontSize: 11,
              color: 'rgba(255,255,255,0.65)',
              textAlign: 'center',
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}>
              <div>{user.name || user.email.split('@')[0]}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {user.companyName}
              </div>
            </div>
          )}
          <button onClick={logout} className="mp-nav-item" style={{ width: '100%' }} aria-label="Sign out">
            <LogOut size={18} strokeWidth={1.8} className="mp-nav-item__icon" />
            <span className="mp-nav-item__label">Sign out</span>
          </button>
        </div>
      </aside>
      <main className="mp-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
