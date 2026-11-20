import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  CheckCircle2,
  Download,
  Filter,
  Search,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import { api, API_BASE, formatDate, formatMoney, store } from '../lib/api';
import { useLive } from '../contexts/LiveContext';
import { Empty, ErrorBanner, Spinner, Status } from '../components/Status';

export default function AdminBookings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [onlyCashPending, setOnlyCashPending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busyId, setBusyId] = useState('');
  const { version } = useLive();

  const loadData = () => {
    return api('/admin/bookings')
      .then(setRows)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [version]);

  const cashPendingCount = useMemo(
    () => rows.filter(b => b.payment?.method === 'counter' && b.payment?.status !== 'paid' && b.status !== 'expired' && b.status !== 'cancelled').length,
    [rows]
  );

  const shown = useMemo(
    () =>
      rows.filter(b => {
        if (onlyCashPending) {
          if (b.payment?.method !== 'counter' || b.payment?.status === 'paid' || b.status === 'expired' || b.status === 'cancelled') return false;
        }
        if (status && b.status !== status) return false;
        if (q) {
          const match = [
            b.code,
            b.vehicleNumber,
            b.user?.name,
            b.guestName,
            b.guestPhone,
            b.user?.email,
            b.location?.name
          ]
            .join(' ')
            .toLowerCase();
          if (!match.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [q, rows, status, onlyCashPending]
  );

  const handleReceiveCash = async id => {
    setBusyId(id);
    setError('');
    try {
      const res = await api(`/admin/bookings/${id}/receive-cash`, { method: 'POST' });
      setSuccess(`Cash received for ${res.booking?.code || 'booking'}! Parking & gate entry access granted.`);
      setTimeout(() => setSuccess(''), 6000);
      setRows(prev =>
        prev.map(b =>
          b._id === id
            ? {
                ...b,
                ...res.booking,
                payment: { ...b.payment, status: 'paid', method: 'counter' },
                status: 'confirmed'
              }
            : b
        )
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const exportCSV = async () => {
    setExporting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/export.csv`, {
        headers: { Authorization: `Bearer ${store.getToken()}` }
      });
      if (!res.ok) throw new Error('Export failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'parkease-bookings.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="dash-page-heading">
        <div>
          <div className="section-kicker">ALL RESERVATIONS</div>
          <h1>Bookings & Revenue Log</h1>
          <p>Keep track of every parking reservation, vehicle entry and payment transaction.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={exportCSV} disabled={exporting}>
          <Download size={17} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />

      {success && (
        <div className="success-banner" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8, background: '#ecfdf5', border: '1px solid #6ee7b7', padding: '10px 16px', borderRadius: 10, color: '#065f46', fontWeight: 500 }}>
          <CheckCircle2 size={18} color="#059669" />
          {success}
        </div>
      )}

      <section className="dash-panel">
        <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="table-search">
            <Search size={18} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search plate, driver name or booking code"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${!onlyCashPending ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setOnlyCashPending(false)}
            >
              All Bookings ({rows.length})
            </button>

            <button
              type="button"
              className={`btn btn-sm ${onlyCashPending ? 'btn-primary' : 'btn-outline'}`}
              style={cashPendingCount > 0 && !onlyCashPending ? { borderColor: '#f59e0b', color: '#b45309' } : undefined}
              onClick={() => setOnlyCashPending(true)}
            >
              <Wallet size={15} />
              Pending Cash Requests ({cashPendingCount})
            </button>
          </div>

          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All booking statuses</option>
            {['pending_payment', 'confirmed', 'checked_in', 'payment_due', 'completed', 'cancelled', 'expired'].map(
              x => (
                <option key={x} value={x}>
                  {x.replace('_', ' ')}
                </option>
              )
            )}
          </select>

          <span className="muted">{shown.length} results</span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>BOOKING</th>
                <th>DRIVER / EMPLOYEE</th>
                <th>LOCATION</th>
                <th>VEHICLE</th>
                <th>PERIOD</th>
                <th>FARE</th>
                <th>PAYMENT</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>Loading bookings…</td>
                </tr>
              ) : shown.length ? (
                shown.map(b => (
                  <tr key={b._id}>
                    <td>
                      <strong>{b.code}</strong>
                      <small>{formatDate(b.createdAt)}</small>
                    </td>
                    <td>
                      <strong>{b.user?.name || b.guestName || 'Employee / Visitor'}</strong>
                      <small>{b.user?.email || b.guestPhone || 'Direct Office Entry'}</small>
                    </td>
                    <td>
                      {b.location?.name}
                      <small>Slot {b.slot?.number} (Floor {b.slot?.floor || 'G'})</small>
                    </td>
                    <td>
                      <strong>{b.vehicleNumber}</strong>
                      <small>{b.vehicleType}</small>
                    </td>
                    <td>
                      {formatDate(b.startAt)}
                      <small>to {formatDate(b.endAt)}</small>
                    </td>
                    <td>
                      <strong>{formatMoney(b.amount)}</strong>
                    </td>
                    <td>
                      <Status value={b.payment?.status} />
                      <small>{b.payment?.method === 'online' ? 'Online UPI' : 'Cash at Gate'}</small>
                    </td>
                    <td>
                      <Status value={b.status} />
                    </td>
                    <td>
                      {b.payment?.method === 'counter' && b.payment?.status !== 'paid' ? (
                        b.status === 'expired' ? (
                          <span style={{ color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                            Expired (24h limit)
                          </span>
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            style={{
                              background: '#16a34a',
                              borderColor: '#16a34a',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: '0.8rem',
                              padding: '6px 12px',
                              whiteSpace: 'nowrap',
                              fontWeight: 600
                            }}
                            disabled={busyId === b._id}
                            onClick={() => handleReceiveCash(b._id)}
                          >
                            <CheckCircle2 size={15} />
                            {busyId === b._id ? 'Receiving…' : 'Receive Cash & Grant Access'}
                          </button>
                        )
                      ) : b.payment?.status === 'paid' ? (
                        <span
                          style={{
                            color: '#16a34a',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <ShieldCheck size={16} /> Access Granted
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>
                          Awaiting Online Pay
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9}>No bookings match your search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
