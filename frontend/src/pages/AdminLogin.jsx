import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  User,
  UserPlus
} from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import { ErrorBanner } from '../components/Status';
import { useAuth } from '../contexts/AuthContext';
import { api, store } from '../lib/api';

export default function AdminLogin() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adminExists, setAdminExists] = useState(null); // null = loading

  // Check if any admin already exists
  useEffect(() => {
    api('/auth/admin/exists')
      .then(data => setAdminExists(data.exists))
      .catch(() => setAdminExists(false));
  }, []);

  // If already logged in as admin/staff, redirect
  if (user && (user.role === 'admin' || user.role === 'staff')) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleLogin = async e => {
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
      setError(err.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const data = await api('/auth/admin/register', {
        method: 'POST',
        body: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim() || undefined
        }
      });

      // Store token and login
      store.setToken(data.token);
      // Reload to pick up the new user
      window.location.href = '/admin/dashboard';
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const showRegisterTab = adminExists === false;

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
            Office Facility <br />
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
            {tab === 'login' ? <KeyRound size={20} /> : <UserPlus size={20} />}
          </div>

          {/* TAB SWITCHER */}
          {showRegisterTab && (
            <div className="admin-auth-tabs">
              <button
                type="button"
                className={`admin-tab ${tab === 'login' ? 'active' : ''}`}
                onClick={() => { setTab('login'); setError(''); }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`admin-tab ${tab === 'register' ? 'active' : ''}`}
                onClick={() => { setTab('register'); setError(''); }}
              >
                Create Account
              </button>
            </div>
          )}

          {tab === 'login' ? (
            <>
              <div className="section-kicker">RESTRICTED PORTAL</div>
              <h1>Administrator Sign In</h1>
              <p>Enter your admin credentials to access the console.</p>

              <ErrorBanner message={error} onClose={() => setError('')} />

              <form className="admin-auth-form" onSubmit={handleLogin}>
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
                      placeholder="your-email@example.com"
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
                      placeholder="Enter your password"
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

              {showRegisterTab && (
                <p className="admin-switch-text">
                  No account yet?{' '}
                  <button type="button" className="text-link-btn" onClick={() => { setTab('register'); setError(''); }}>
                    Create Admin Account
                  </button>
                </p>
              )}
            </>
          ) : (
            <>
              <div className="section-kicker">FIRST-TIME SETUP</div>
              <h1>Create Admin Account</h1>
              <p>Set up your administrator account to manage the parking facility.</p>

              <ErrorBanner message={error} onClose={() => setError('')} />

              <form className="admin-auth-form" onSubmit={handleRegister}>
                <label className="field">
                  Full Name *
                  <div className="input-icon-wrap">
                    <User size={19} />
                    <input
                      type="text"
                      required
                      autoComplete="name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Rajesh Kumar"
                    />
                  </div>
                </label>

                <label className="field">
                  Email Address *
                  <div className="input-icon-wrap">
                    <Mail size={19} />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="your-email@example.com"
                    />
                  </div>
                </label>

                <label className="field">
                  Phone Number
                  <div className="input-icon-wrap">
                    <Phone size={19} />
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                </label>

                <label className="field">
                  Password * (min 8 characters)
                  <div className="input-icon-wrap">
                    <LockKeyhole size={19} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Create a strong password"
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
                  {busy ? 'Creating Account…' : 'Create Admin Account'} <UserPlus size={18} />
                </button>
              </form>

              <p className="admin-switch-text">
                Already have an account?{' '}
                <button type="button" className="text-link-btn" onClick={() => { setTab('login'); setError(''); }}>
                  Sign In
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
