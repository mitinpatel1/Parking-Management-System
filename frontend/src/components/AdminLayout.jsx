import { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck2,
  CarFront,
  CircleDollarSign,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  ScanLine,
  Settings2,
  ShieldCheck,
  Users,
  X,
  Zap
} from 'lucide-react';
import Brand from './Brand';
import Notifications from './Notifications';
import { useAuth } from '../contexts/AuthContext';
import { useLive } from '../contexts/LiveContext';

const adminNav = [
  { to: '/admin/dashboard', label: 'Overview & Revenue', icon: LayoutDashboard, adminOnly: true },
  { to: '/admin/slots', label: 'Slot & Floor Management', icon: CarFront, adminOnly: true },
  { to: '/admin/bookings', label: 'Bookings & Receipts', icon: CalendarCheck2, adminOnly: true },
  { to: '/admin/gate', label: 'Gate Barrier Operations', icon: ScanLine, adminOnly: false },
  { to: '/admin/settings', label: 'Pricing & Facility Settings', icon: MapPinned, adminOnly: true },
  { to: '/admin/team', label: 'Operators & Staff', icon: Users, adminOnly: true }
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { connected } = useLive();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const filteredNav = adminNav.filter(item => user?.role === 'admin' || !item.adminOnly);

  const handleSignOut = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="admin-app-shell">
      {/* EXECUTIVE ADMIN SIDEBAR */}
      <aside className={`admin-sidebar ${showMobileSidebar ? 'sidebar-show' : ''}`}>
        <div className="admin-sidebar-top">
          <Brand light />
          <span className="admin-console-chip">ADMIN CONSOLE</span>
          <button
            className="sidebar-mobile-close icon-btn"
            onClick={() => setShowMobileSidebar(false)}
          >
            <X />
          </button>
        </div>

        <div className="admin-sidebar-status">
          <span className={`live-sync-indicator ${connected ? 'is-live' : ''}`}>
            <span className="indicator-pulse" />
            {connected ? 'Live Sync Active' : 'Connecting to Gateway…'}
          </span>
        </div>

        <div className="sidebar-caption">FACILITY WORKSPACE</div>

        <nav className="admin-sidebar-nav">
          {filteredNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setShowMobileSidebar(false)}
              className={({ isActive }) =>
                `admin-sidebar-link ${isActive ? 'admin-sidebar-link-active' : ''}`
              }
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="admin-sidebar-actions">
          <Link className="admin-switch-link" to="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> Open Public Parking Site
          </Link>

          <button className="admin-signout-btn" onClick={handleSignOut}>
            <LogOut size={16} /> Sign Out of Admin
          </button>
        </div>

        <div className="admin-profile-card">
          <div className="avatar avatar-large">{user?.name?.charAt(0) || 'A'}</div>
          <div className="admin-profile-info">
            <b>{user?.name || 'Administrator'}</b>
            <span className="admin-role-badge">{user?.role?.toUpperCase() || 'ADMIN'}</span>
          </div>
        </div>
      </aside>

      {showMobileSidebar && (
        <div className="sidebar-overlay" onClick={() => setShowMobileSidebar(false)} />
      )}

      {/* ADMIN MAIN CONTENT AREA */}
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              className="icon-btn sidebar-toggle"
              onClick={() => setShowMobileSidebar(true)}
            >
              <Menu />
            </button>
            <div className="dash-breadcrumb">
              <span>Facility Management</span>
              <span className="breadcrumb-divider">/</span>
              <b>{user?.role === 'admin' ? 'Administrator Workspace' : 'Staff Gate Portal'}</b>
            </div>
          </div>

          <div className="admin-topbar-right">
            <div className="facility-tag-pill">
              <Building2 size={15} /> CyberSquare Office Hub
            </div>
            <Notifications />
            <div className="avatar" title={user?.name}>
              {user?.name?.charAt(0) || 'A'}
            </div>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

