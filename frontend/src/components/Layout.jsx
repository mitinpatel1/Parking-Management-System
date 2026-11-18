import { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Bell, CalendarCheck2, CarFront, CircleHelp, Globe, LayoutDashboard, LogOut, MapPin, MapPinned, Menu, ScanLine, Settings2, ShieldCheck, Users, X, Zap } from 'lucide-react';
import Brand from './Brand';
import Notifications from './Notifications';
import { useAuth } from '../contexts/AuthContext';
import { useLive } from '../contexts/LiveContext';
import { cityStore } from '../lib/api';

const userLinks = [['/', 'Park Vehicle'], ['/bookings', 'My Bookings & Pass']];

function UserHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const savedCity = cityStore.get();

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Brand />
        <nav className={`site-nav ${open ? 'site-nav-open' : ''}`}>
          {userLinks.map(([to, label]) => (
            <NavLink
              onClick={() => setOpen(false)}
              key={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
              to={to}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          {savedCity && (
            <Link to="/" className="city-badge-header" title="Change city">
              <MapPin size={14} /> {savedCity}
            </Link>
          )}
          <button
            className="icon-btn mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-content">
        <div>
          <Brand />
          <p>Dedicated Corporate Office Parking & Smart Gate Access</p>
        </div>
        <div className="footer-links">
          <Link to="/">Park Vehicle</Link>
          <Link to="/bookings">My Bookings</Link>
          <Link to="/admin/login">Admin Portal</Link>
          <span>© {new Date().getFullYear()} ParkEase Office</span>
        </div>
      </div>
    </footer>
  );
}

export function UserLayout() {
  return (
    <div className="site-shell">
      <UserHeader />
      <main className="site-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export function StaffLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { connected } = useLive();
  const [show, setShow] = useState(false);
  const sideNav = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, admin: true },
    { to: '/manage/locations', label: 'Parking locations', icon: MapPinned, admin: true },
    { to: '/manage/slots', label: 'Slot management', icon: CarFront, admin: true },
    { to: '/manage/bookings', label: 'All bookings', icon: CalendarCheck2, admin: true },
    { to: '/manage/team', label: 'Team management', icon: Users, admin: true },
    { to: '/gate', label: 'Gate operations', icon: ScanLine, admin: false }
  ];
  const nav = sideNav.filter(x => user.role === 'admin' || !x.admin);

  return (
    <div className="app-shell">
      <aside className={`dashboard-sidebar ${show ? 'sidebar-show' : ''}`}>
        <div className="sidebar-top">
          <Brand light />
          <button className="sidebar-mobile-close icon-btn" onClick={() => setShow(false)}>
            <X />
          </button>
        </div>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="sidebar-links">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setShow(false)}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <Zap size={20} />
          <b>Smarter parking</b>
          <p>Manage every spot from one connected space.</p>
        </div>
        <Link className="sidebar-link sidebar-public" to="/">
          <ArrowRight size={18} /> View customer site
        </Link>
        <button
          className="sidebar-link sidebar-signout"
          onClick={() => {
            logout();
            navigate('/');
          }}
        >
          <LogOut size={18} /> Sign out
        </button>
        <div className="sidebar-user">
          <div className="avatar avatar-large">{user?.name?.charAt(0)}</div>
          <div>
            <b>{user?.name}</b>
            <small>{user?.role}</small>
          </div>
        </div>
      </aside>
      {show && <div className="sidebar-overlay" onClick={() => setShow(false)} />}
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <button className="icon-btn sidebar-toggle" onClick={() => setShow(true)}>
            <Menu />
          </button>
          <div className="dash-breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <b>{user?.role === 'admin' ? 'Admin console' : 'Staff console'}</b>
          </div>
          <div className="dash-top-actions">
            <span className={`connection-indicator ${connected ? 'is-connected' : ''}`}>
              <i />{connected ? 'Live' : 'Connecting'}
            </span>
            <Notifications />
            <div className="avatar">{user?.name?.charAt(0)}</div>
          </div>
        </header>
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
