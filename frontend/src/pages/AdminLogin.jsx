import { useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import { ErrorBanner } from '../components/Status';
import { useAuth } from '../contexts/AuthContext';

export default function AdminLogin() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // If already logged in, redirect to admin console
  if (user && (user.role === 'admin' || user.role === 'staff')) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const loggedInUser = await login(email.trim().toLowerCase(), password);
      if (loggedInUser.role !== 'admin' && loggedInUser.role !== 'staff') {
        throw new Error('Access denied. Administrator privileges required.');
      }
      nav(location.state?.from || '/admin/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify admin credentials.');
    } finally {
      setBusy(false);
    }
  };

  const fillDemoAdmin = () => {
    setEmail('admin@parkease.local');
    setPassword('ChangeThisAdminPassword123!');
  };

  return (
    <div className="admin-login-shell">
      <div className="admin-login-left">
        <div className="admin-login-brand">
          <Brand light />
          <span className="admin-portal-badge">
            <ShieldCheck size={14} /> ADMIN CONSOLE
          </span>
        </div>

        <div className="admin-login-hero">
          <div className="admin-shield-icon">
            <LockKeyhole size={48} strokeWidth={1.5} />
          </div>
          <h2>
            Office Facility &<br />
            Parking Control Center
          </h2>
          <p>
            Secure executive dashboard for monitoring real-time bay occupancy, barrier gates, vehicle flow, and automated revenue collection.
          </p>

          <div className="admin-feature-list">
            <div>
              <CheckCircle2 size={18} color="#1dcf9f" />
              <span>Real-time floor & slot occupancy tracking</span>
            </div>
            <div>
              <CheckCircle2 size={18} color="#1dcf9f" />
              <span>Live revenue monitoring & automated counter reconciliation</span>
            </div>
            <div>
              <CheckCircle2 size={18} color="#1dcf9f" />
              <span>Gate barrier operations with plate recognition & QR reader</span>
            </div>
          </div>
        </div>

        <div className="admin-login-footer">
          <span>Protected Infrastructure · Role-Based Security</span>
          <span>© {new Date().getFullYear()} ParkEase Enterprise</span>
        </div>
      </div>

      <div className="admin-login-right">
        <Link to="/" className="admin-back-link">
          ← Back to Customer Parking
        </Link>

        <div className="admin-form-container">
          <div className="admin-header-badge">
            <KeyRound size={20} />
          </div>

          <div className="section-kicker">RESTRICTED PORTAL</div>
          <h1>Administrator Sign In</h1>
          <p>Please enter your authorized facility credentials to access the console.</p>

          <ErrorBanner message={error} onClose={() => setError('')} />

          <form className="admin-auth-form" onSubmit={handleSubmit}>
            <label className="field">
              Admin Email
              <div className="input-icon-wrap">
                <Mail size={19} />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@parkease.local"
                />
              </div>
            </label>

            <label className="field">
              Password
              <div className="input-icon-wrap">
                <LockKeyhole size={19} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                />
                <button
                  type="button"
                  className="show-pass"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <button disabled={busy} className="btn btn-primary btn-block admin-submit-btn" type="submit">
              {busy ? 'Authenticating…' : 'Access Admin Dashboard'} <ArrowRight size={18} />
            </button>
          </form>

          {/* QUICK DEMO CREDENTIAL CARD */}
          <div className="admin-credential-box">
            <div className="credential-box-head">
              <strong>Authorized Demo Credentials</strong>
              <button type="button" className="credential-autofill-btn" onClick={fillDemoAdmin}>
                Auto-fill
              </button>
            </div>
            <div>
              <span>Email:</span> <code>admin@parkease.local</code>
            </div>
            <div>
              <span>Password:</span> <code>ChangeThisAdminPassword123!</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

