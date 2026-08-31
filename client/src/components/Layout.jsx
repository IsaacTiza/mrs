import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

const ROLE_LABEL = {
  invigilator: 'Invigilator',
  exam_officer: 'Exam Officer',
  college_officer: 'College Officer',
  registry_officer: 'Registry Officer',
  senate_board: 'Senate Board',
  senate_president: 'Senate President',
  super_admin: 'Super Admin',
  student: 'Student',
};

const NAV_BY_ROLE = {
  invigilator: [
    { to: '/reports/new', label: 'File a Report' },
    { to: '/reports/mine', label: 'My Submissions' },
  ],
  exam_officer: [
    { to: '/queue', label: 'Stage Queue' },
    { to: '/queue/passed', label: 'Passed Cases' },
  ],
  college_officer: [
    { to: '/queue', label: 'College Queue' },
    { to: '/queue/passed', label: 'Passed Cases' },
  ],
  registry_officer: [
    { to: '/queue', label: 'Registry Queue' },
    { to: '/queue/passed', label: 'Passed Cases' },
  ],
  senate_board: [
    { to: '/queue', label: 'Senate Queue' },
    { to: '/queue/passed', label: 'Passed Cases' },
  ],
  senate_president: [
    { to: '/queue', label: 'Senate Queue' },
    { to: '/queue/passed', label: 'Passed Cases' },
    { to: '/senate/members', label: 'Senate Board Members' },
  ],
  super_admin: [
    { to: '/admin', label: 'User Management' },
    { to: '/admin/audit', label: 'Audit Trail' },
    { to: '/reports/all', label: 'All Cases' },
  ],
  student: [{ to: '/my-case', label: 'My Case' }],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const links = NAV_BY_ROLE[user?.role] || [];
  // Off-canvas nav drawer for narrow screens (see global.css's
  // .nav-rail / .mobile-topbar media query) — irrelevant above the
  // breakpoint, where .nav-rail ignores this and stays a normal fixed
  // sidebar regardless of navOpen's value.
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell">
      {/* Mobile-only top bar (hidden by CSS above the breakpoint). The
          hamburger reveals the SAME .nav-rail below as a slide-in
          drawer — deliberately not a second, separate nav — so there's
          only ever one NotificationBell instance in the tree; a second
          one would double every fetch/poll/SSE-subscription it makes
          and could show a different read/unread state than the first. */}
      <div className="mobile-topbar">
        <button
          className="hamburger-btn"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={navOpen}
          onClick={() => setNavOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="mobile-topbar-brand">JOSTUM</div>
      </div>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

      <aside className={navOpen ? 'nav-rail open' : 'nav-rail'}>
        <div className="brand">
          JOSTUM
          <small>Malpractice Reporting</small>
        </div>
        <div className="role-tag">
          <div style={{ fontWeight: 600 }}>{user?.name || 'Signed in'}</div>
          <div style={{ fontSize: '0.78em', opacity: 0.75 }}>{ROLE_LABEL[user?.role]}</div>
        </div>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end
              className={({ isActive }) => (isActive ? 'active' : '')}
              // Closes the drawer on navigation — without this, tapping a
              // link on mobile would swap the page underneath while the
              // drawer stayed open on top of it.
              onClick={() => setNavOpen(false)}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', marginBottom: 12 }}>
          <NotificationBell />
        </div>
        <button className="logout" onClick={logout}>
          Sign out
        </button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
