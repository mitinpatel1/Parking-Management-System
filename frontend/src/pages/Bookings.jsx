import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck2,
  CarFront,
  Check,
  CreditCard,
  Download,
  MapPin,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  Ticket,
  User,
  Wallet,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useLocation } from 'react-router-dom';
import { api, formatDate, formatMoney, guestStore } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLive } from '../contexts/LiveContext';
import { Empty, ErrorBanner, Spinner, Status } from '../components/Status';
import ThermalReceipt58mm from '../components/ThermalReceipt58mm';

function injectRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Razorpay checkout'));
    document.body.append(script);
  });
}

export default function Bookings() {
  const { user } = useAuth();
  const { version } = useLive();
  const location = useLocation();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('all');
  const [busy, setBusy] = useState('');
  const [config, setConfig] = useState({ online: false });
  const [receiptBooking, setReceiptBooking] = useState(null);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);

  // Search by vehicle number or booking code
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const highlighted = location.state?.newBooking;

  const loadBookings = async () => {
    try {
      setError('');
      let list = [];
      if (user) {
        list = await api('/bookings');
      } else {
        const ids = guestStore.getIds();
        if (ids.length > 0) {
          list = await api(`/bookings?ids=${ids.join(',')}`);
        } else {
          list = [];
        }
      }
      setRows(list);

      // Auto-open new booking pass if redirected from booking page
      if (highlighted && list.length > 0) {
        const match = list.find(b => b._id === highlighted);
        if (match) setSelected(match);
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
    api('/payments/config')
      .then(setConfig)
      .catch(() => {});
  }, [user?.id, version]);

  // Handle manual vehicle plate or booking code search
  const handleSearch = async e => {
    e.preventDefault();
    const query = searchQuery.trim().toUpperCase().replace(/\s+/g, '');
    if (!query) return;

    setSearching(true);
    setError('');
    setSuccess('');

    try {
      let results = [];
      if (query.startsWith('PK-')) {
        results = await api(`/bookings?code=${encodeURIComponent(query)}`);
      } else {
        results = await api(`/bookings?vehicleNumber=${encodeURIComponent(query)}`);
      }

      if (!results || results.length === 0) {
        setError(`No bookings found for "${searchQuery}". Please check vehicle number or booking code.`);
      } else {
        // Save found IDs into guestStore so they stay visible
        results.forEach(r => guestStore.addId(r._id));
        setRows(prev => {
          const existingIds = new Set(prev.map(p => p._id));
          const newEntries = results.filter(r => !existingIds.has(r._id));
          return [...newEntries, ...prev];
        });
        setSuccess(`Found ${results.length} booking(s) for ${searchQuery}.`);
        if (results.length === 1) {
          setSelected(results[0]);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const cancel = async b => {
    if (!window.confirm(`Cancel booking ${b.code}? This will release your parking spot.`)) return;
    setBusy(b._id);
    setError('');
    try {
      await api(`/bookings/${b._id}/cancel`, { method: 'POST' });
      await loadBookings();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const pay = async b => {
    setBusy(b._id);
    setError('');
    try {
      const order = await api(`/payments/${b._id}/order`, { method: 'POST' });
      await injectRazorpay();
      const paymentResponse = await new Promise((resolve, reject) => {
        const rz = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'ParkEase Parking',
          description: `Parking Pass ${b.code}`,
          order_id: order.orderId,
          handler: async response => {
            try {
              const res = await api(`/payments/${b._id}/verify`, { method: 'POST', body: response });
              resolve({ ...response, updated: res.booking });
            } catch (e) {
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error('Payment window closed')) }
        });
        rz.on('payment.failed', e => reject(new Error(e.error?.description || 'Payment failed')));
        rz.open();
      });

      setSuccess(`Online payment confirmed for ${b.code}! Printing 58mm receipt...`);
      await loadBookings();

      // Automatically show and print 58mm thermal receipt
      const paidBooking = paymentResponse.updated || {
        ...b,
        payment: {
          ...b.payment,
          status: 'paid',
          method: 'online',
          paidAt: new Date(),
          reference: paymentResponse.razorpay_payment_id || 'ONLINE'
        }
      };
      setReceiptBooking(paidBooking);
      setAutoPrintReceipt(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const shown = rows.filter(b => {
    if (tab === 'all') return true;
    if (tab === 'upcoming') return ['confirmed', 'pending_payment'].includes(b.status);
    if (tab === 'active') return ['checked_in', 'payment_due'].includes(b.status);
    return ['completed', 'cancelled', 'expired'].includes(b.status);
  });

  return (
    <div className="container inner-page bookings-page">
      <div className="page-intro">
        <div className="section-kicker">VEHICLE PASS & BOOKINGS</div>
        <h1>
          Office Parking <em>Reservations.</em>
        </h1>
        <p>View your active parking passes, check QR tickets and manage payments.</p>
      </div>

      {/* QUICK LOOKUP BY VEHICLE NUMBER OR CODE */}
      <div className="search-toolbar" style={{ marginBottom: '1.5rem' }}>
        <form className="wide-search" onSubmit={handleSearch}>
          <Search size={20} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Find booking by Vehicle Number (e.g. DL01AB1234) or Booking Code (e.g. PK-XXXX)"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={searching || !searchQuery.trim()}>
            {searching ? 'Searching…' : 'Find Booking'}
          </button>
        </form>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />
      {success && (
        <div className="success-banner" style={{ marginBottom: '1rem' }}>
          <Check size={18} /> {success}
        </div>
      )}

      {/* TABS */}
      <div className="booking-tabs">
        {[
          ['all', 'All Bookings'],
          ['upcoming', 'Upcoming / Confirmed'],
          ['active', 'Parked at Office'],
          ['past', 'Completed / History']
        ].map(([v, title]) => (
          <button className={tab === v ? 'active' : ''} key={v} onClick={() => setTab(v)}>
            {title}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : shown.length ? (
        <div className="mybookings-list">
          {shown.map(b => (
            <div key={b._id} className={`booking-record ${highlighted === b._id ? 'just-booked' : ''}`}>
              <div className="booking-record-main">
                <div className="booking-record-icon">
                  <CarFront size={32} />
                </div>
                <div className="booking-record-info">
                  <span className="booking-code">
                    <Ticket size={14} /> {b.code}
                  </span>
                  <h3>
                    Vehicle: {b.vehicleNumber}{' '}
                    {b.guestName && <small style={{ fontWeight: 400, opacity: 0.8 }}>({b.guestName})</small>}
                  </h3>
                  <p>
                    <MapPin size={15} /> {b.location?.name || 'Office Parking'} · Slot {b.slot?.number || '—'} (Floor{' '}
                    {b.slot?.floor || 'G'})
                  </p>
                </div>
                <Status value={b.status} />
              </div>

              <div className="record-divide" />

              <div className="booking-record-meta">
                <div>
                  <small>Arrival Window</small>
                  <b>{formatDate(b.startAt)}</b>
                </div>
                <div>
                  <small>Departure</small>
                  <b>{formatDate(b.endAt)}</b>
                </div>
                <div>
                  <small>Parking Fare</small>
                  <b>{formatMoney(b.amount)}</b>
                </div>
                <div>
                  <small>Payment Status</small>
                  <Status value={b.payment?.status} />
                </div>
              </div>

              <div className="booking-record-actions">
                {/* Pay online if unpaid */}
                {b.payment?.status !== 'paid' && !['cancelled', 'expired', 'completed'].includes(b.status) && (
                  <>
                    {config.online ? (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy === b._id}
                        onClick={() => pay(b)}
                      >
                        {busy === b._id ? 'Processing…' : 'Pay Online'} <ArrowRight size={16} />
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.85rem' }}>
                        Pay at Gate via Cash/UPI
                      </span>
                    )}
                  </>
                )}

                {/* View QR Pass ticket for entry */}
                {['confirmed', 'checked_in', 'payment_due', 'completed'].includes(b.status) && (
                  <button className="btn btn-outline btn-sm" onClick={() => setSelected(b)}>
                    <QrCode size={17} /> View Gate QR Ticket
                  </button>
                )}

                {/* Print 58mm Thermal Receipt */}
                {b.payment?.status === 'paid' && (
                  <button
                    className="btn btn-soft btn-sm"
                    onClick={() => {
                      setReceiptBooking(b);
                      setAutoPrintReceipt(false);
                    }}
                    title="Print 58mm Thermal Slip"
                  >
                    <Printer size={16} /> Print 58mm Receipt
                  </button>
                )}

                {/* Cancel booking if not checked in and unpaid */}
                {['confirmed', 'pending_payment'].includes(b.status) && b.payment?.status !== 'paid' && (
                  <button className="btn btn-soft btn-sm" disabled={busy === b._id} onClick={() => cancel(b)}>
                    Cancel Booking
                  </button>
                )}

                {b.status === 'payment_due' && (
                  <span className="due-label">
                    Due at Exit: {formatMoney((b.payment?.status === 'paid' ? 0 : b.amount) + (b.extraDue || 0))}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={CalendarCheck2}
          title="No bookings found"
          message="No active reservations found on this browser. You can park a vehicle now or search using your vehicle plate number above."
          action={
            <Link to="/" className="btn btn-primary">
              Park a Vehicle Now <ArrowRight size={18} />
            </Link>
          }
        />
      )}

      {/* QR PASS MODAL */}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div
            className="ticket-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Parking QR ticket"
            onClick={e => e.stopPropagation()}
          >
            <button className="modal-close icon-btn" onClick={() => setSelected(null)}>
              <X />
            </button>
            <div className="ticket-modal-header">
              <div className="ticket-modal-icon">
                <QrCode size={26} />
              </div>
              <h2>Office Parking Gate Pass</h2>
              <p>Scan this QR code at the gate barrier or show it to security staff.</p>
            </div>

            <div className="ticket-qr">
              {selected.qrToken ? (
                <QRCodeSVG value={selected.qrToken} size={220} includeMargin level="H" />
              ) : (
                <p>QR code not available</p>
              )}
            </div>

            <div className="ticket-booking-code">{selected.code}</div>

            <div className="ticket-details">
              <span>Vehicle: {selected.vehicleNumber}</span>
              <strong>
                Slot {selected.slot?.number || '—'} · Floor {selected.slot?.floor || 'G'}
              </strong>
            </div>

            <div style={{ textAlign: 'center', margin: '0.5rem 0', fontSize: '0.9rem', color: '#636b83' }}>
              <div>Facility: {selected.location?.name || 'Office Workspace Parking'}</div>
              <div>
                Payment: <b>{selected.payment?.status === 'paid' ? 'PAID' : 'PAY AT GATE'}</b> (
                {formatMoney(selected.amount)})
              </div>
            </div>

            <p className="ticket-note">
              <ShieldCheck size={15} /> Authorized pass for office campus entry and exit.
            </p>

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  const target = selected;
                  setSelected(null);
                  setReceiptBooking(target);
                  setAutoPrintReceipt(true);
                }}
              >
                <Printer size={18} /> Print 58mm Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 58MM THERMAL RECEIPT MODAL */}
      {receiptBooking && (
        <ThermalReceipt58mm
          booking={receiptBooking}
          autoPrint={autoPrintReceipt}
          onClose={() => {
            setReceiptBooking(null);
            setAutoPrintReceipt(false);
          }}
        />
      )}
    </div>
  );
}
