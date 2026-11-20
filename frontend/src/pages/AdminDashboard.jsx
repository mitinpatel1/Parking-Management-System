import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  CarFront,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  MapPin,
  ParkingSquare,
  ShieldCheck,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api, formatDate, formatMoney } from '../lib/api';
import { useLive } from '../contexts/LiveContext';
import { ErrorBanner, Spinner, Status } from '../components/Status';

const metrics = [
  { key: 'revenue', name: 'Total paid revenue', icon: CircleDollarSign, desc: 'Since launch', money: true, tone: 'purple' },
  { key: 'bookings', name: 'Total bookings', icon: CalendarCheck2, desc: 'All time', tone: 'blue' },
  { key: 'occupied', name: 'Occupied spaces', icon: CarFront, desc: 'Currently in use', tone: 'orange' },
  { key: 'available', name: 'Vacant spaces', icon: ParkingSquare, desc: 'Ready for parking', tone: 'green' }
];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [cashRequests, setCashRequests] = useState([]);
  const [busyCash, setBusyCash] = useState('');
  const [cashSuccess, setCashSuccess] = useState('');
  const { version } = useLive();

  const loadStats = () => api('/admin/stats').then(setData).catch(e => setError(e.message));
  const loadRequests = () => api('/admin/payment-requests').then(setCashRequests).catch(() => {});

  useEffect(() => {
    loadStats();
    loadRequests();
  }, [version]);

  const handleReceiveCash = async id => {
    setBusyCash(id);
    setError('');
    try {
      const res = await api(`/admin/bookings/${id}/receive-cash`, { method: 'POST' });
      setCashSuccess(`Cash received for ${res.booking?.code || 'booking'}! Parking & gate entry access granted.`);
      setTimeout(() => setCashSuccess(''), 6000);
      loadRequests();
      loadStats();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyCash('');
    }
  };

  if (!data) return <div><ErrorBanner message={error} /><Spinner /></div>;
  const utilization = data.slots ? Math.round((data.occupied / data.slots) * 100) : 0;

  return (
    <>
      <div className="dash-page-heading">
        <div>
          <div className="section-kicker">CONTROL CENTER</div>
          <h1>Good to see you again <span className="wave">✦</span></h1>
          <p>Here's a real-time look at your parking operations.</p>
        </div>
        <Link to="/manage/locations" className="btn btn-primary btn-sm">
          Manage parking <ArrowRight size={17} />
        </Link>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />

      {cashSuccess && (
        <div className="success-banner" style={{ marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: 8, background: '#ecfdf5', border: '1px solid #6ee7b7', padding: '12px 18px', borderRadius: 10, color: '#065f46', fontWeight: 500 }}>
          <CheckCircle2 size={18} color="#059669" />
          {cashSuccess}
        </div>
      )}

      {/* PENDING CASH PAYMENT REQUESTS */}
      {cashRequests.length > 0 && (
        <section className="dash-panel" style={{ border: '2px solid #f59e0b', background: '#fffbeb', marginBottom: '1.8rem', padding: '20px' }}>
          <div className="dash-panel-head" style={{ marginBottom: 14 }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#92400e', margin: 0 }}>
                <Wallet size={22} color="#d97706" />
                Pending Cash Payment Requests ({cashRequests.length})
              </h3>
              <p style={{ color: '#b45309', margin: '4px 0 0', fontSize: '0.9rem' }}>
                Customers waiting to pay cash at the gate. Collect cash and grant instant parking & gate entry access.
              </p>
            </div>
            <span className="badge" style={{ background: '#f59e0b', color: '#fff', padding: '4px 10px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600 }}>
              Action Required
            </span>
          </div>

          <div className="table-scroll">
            <table className="data-table" style={{ background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
              <thead>
                <tr>
                  <th>BOOKING</th>
                  <th>DRIVER / VISITOR</th>
                  <th>VEHICLE</th>
                  <th>LOCATION & SLOT</th>
                  <th>CASH AMOUNT</th>
                  <th>REQUESTED AT</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {cashRequests.map(req => (
                  <tr key={req._id}>
                    <td>
                      <strong>{req.code}</strong>
                    </td>
                    <td>
                      <strong>{req.user?.name || req.guestName || 'Visitor'}</strong>
                      <small>{req.user?.phone || req.guestPhone || 'No phone'}</small>
                    </td>
                    <td>
                      <strong style={{ letterSpacing: '0.5px' }}>{req.vehicleNumber}</strong>
                      <small>{req.vehicleType?.toUpperCase()}</small>
                    </td>
                    <td>
                      {req.location?.name}
                      <small>Slot {req.slot?.number || '—'} (Floor {req.slot?.floor || 'G'})</small>
                    </td>
                    <td>
                      <strong style={{ color: '#047857', fontSize: '1.05rem' }}>
                        {formatMoney(req.amount)}
                      </strong>
                    </td>
                    <td>
                      <small>{formatDate(req.payment?.cashRequestAt || req.createdAt)}</small>
                      {(() => {
                        const reqTime = new Date(req.payment?.cashRequestAt || req.createdAt).getTime();
                        const remMs = Math.max(0, 24 * 60 * 60 * 1000 - (Date.now() - reqTime));
                        const remHrs = Math.floor(remMs / (60 * 60 * 1000));
                        const remMins = Math.floor((remMs % (60 * 60 * 1000)) / (60 * 1000));
                        return (
                          <div style={{ fontSize: '0.75rem', color: remHrs < 2 ? '#dc2626' : '#b45309', fontWeight: 600, marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock3 size={12} />
                            {remMs === 0 ? 'Expired' : `Expires in ${remHrs}h ${remMins}m`}
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{
                          background: '#16a34a',
                          borderColor: '#16a34a',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 600,
                          padding: '7px 14px',
                          whiteSpace: 'nowrap'
                        }}
                        disabled={busyCash === req._id}
                        onClick={() => handleReceiveCash(req._id)}
                      >
                        <CheckCircle2 size={16} />
                        {busyCash === req._id ? 'Receiving…' : 'Receive Cash & Grant Access'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* METRICS GRID */}
      <div className="stats-grid">
        {metrics.map(({ key, name, icon: Icon, desc, money, tone }) => (
          <div className="stat-card" key={key}>
            <div className={`stat-icon tone-${tone}`}>
              <Icon size={23} />
            </div>
            <div className="stat-name">{name}</div>
            <div className="stat-value">
              {money ? formatMoney(data[key]) : data[key]?.toLocaleString('en-IN') || '0'}
            </div>
            <span className="stat-foot">
              <TrendingUp size={14} /> {desc}
            </span>
          </div>
        ))}
      </div>

      <div className="dashboard-chart-grid">
        <section className="dash-panel chart-panel">
          <div className="dash-panel-head">
            <div>
              <h3>Revenue overview</h3>
              <p>Paid parking revenue in the last 7 days</p>
            </div>
            <span className="period-tag">Last 7 days</span>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chart} margin={{ top: 10, right: 12, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6256e9" stopOpacity={0.27} />
                    <stop offset="100%" stopColor="#6256e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#ececf5" strokeDasharray="4 7" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#969cb0', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#969cb0', fontSize: 12 }} />
                <Tooltip formatter={v => formatMoney(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#6256e9" strokeWidth={3} fill="url(#revenueGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="dash-panel utilization-panel">
          <div className="dash-panel-head">
            <div>
              <h3>Space occupancy</h3>
              <p>Current capacity at a glance</p>
            </div>
          </div>
          <div className="utilization-ring" style={{ '--pct': `${utilization}%` }}>
            <div>
              <strong>{utilization}%</strong>
              <small>Occupied</small>
            </div>
          </div>
          <div className="occupancy-breakdown">
            <div>
              <span className="dot-label"><i style={{ background: '#6755e9' }} /> Occupied</span>
              <b>{data.occupied}</b>
            </div>
            <div>
              <span className="dot-label"><i style={{ background: '#e7e7f5' }} /> Available</span>
              <b>{data.available}</b>
            </div>
          </div>
          <Link className="text-link" to="/manage/slots">
            Manage all spaces <ArrowRight size={16} />
          </Link>
        </section>
      </div>

      <section className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <h3>Latest reservations</h3>
            <p>Recent booking activity across your locations</p>
          </div>
          <Link to="/manage/bookings" className="text-link">
            View all <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>BOOKING</th>
                <th>CUSTOMER</th>
                <th>PARKING</th>
                <th>DATE</th>
                <th>AMOUNT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {data.latest?.length ? (
                data.latest.map(b => (
                  <tr key={b._id}>
                    <td><strong>{b.code}</strong></td>
                    <td>{b.user?.name || b.guestName || '—'}</td>
                    <td>{b.location?.name || '—'}<small>Slot {b.slot?.number || '—'}</small></td>
                    <td>{formatDate(b.createdAt)}</td>
                    <td><strong>{formatMoney(b.amount)}</strong></td>
                    <td><Status value={b.status} /></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No bookings yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
