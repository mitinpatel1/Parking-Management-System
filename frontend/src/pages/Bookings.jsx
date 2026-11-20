
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck2,
  CarFront,
  Check,
  Clock,
  MapPin,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  Ticket,
  Wallet,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useLocation } from 'react-router-dom';
import {
  api,
  formatDate,
  formatMoney,
  guestStore
} from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLive } from '../contexts/LiveContext';
import {
  Empty,
  ErrorBanner,
  Spinner,
  Status
} from '../components/Status';
import ThermalReceipt58mm from '../components/ThermalReceipt58mm';

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

  const [paymentQr, setPaymentQr] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const highlighted = location.state?.newBooking;

  // Guest booking code is required by protected guest payment endpoints.
  const guestCodeBody = booking => {
    return user ? {} : { code: booking.code };
  };

  const guestCodeQuery = booking => {
    return !user && booking?.code
      ? `?code=${encodeURIComponent(booking.code)}`
      : '';
  };

  // Load bookings.
  const loadBookings = async () => {
    try {
      setError('');

      let list = [];

      if (user) {
        list = await api('/bookings');
      } else {
        const ids = guestStore.getIds();

        if (ids.length > 0) {
          list = await api(
            `/bookings?ids=${encodeURIComponent(ids.join(','))}`
          );
        }
      }

      const safeList = Array.isArray(list) ? list : [];

      setRows(safeList);

      if (highlighted && safeList.length > 0) {
        const match = safeList.find(
          booking => booking._id === highlighted
        );

        if (match) {
          if (location.state?.autoOpenUpi && match.payment?.status !== 'paid') {
            payOnline(match);
          } else {
            setSelected(match);
          }
        }
      }

      return safeList;
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message);
      }

      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();

    api('/payments/config')
      .then(setConfig)
      .catch(() => {
        setConfig({ online: false });
      });
  }, [user?.id, version]);

  // Search booking by booking code or vehicle number.
  const handleSearch = async e => {
    e.preventDefault();

    const query = searchQuery
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    if (!query) return;

    setSearching(true);
    setError('');
    setSuccess('');

    try {
      let results = [];

      if (query.startsWith('PK-')) {
        results = await api(
          `/bookings?code=${encodeURIComponent(query)}`
        );
      } else {
        if (!user) {
          throw new Error(
            'Guest users should search using their booking code (PK-XXXX).'
          );
        }

        results = await api(
          `/bookings?vehicleNumber=${encodeURIComponent(query)}`
        );
      }

      if (!results || results.length === 0) {
        setError(
          `No bookings found for "${searchQuery}". Please check your vehicle number or booking code.`
        );
        return;
      }

      results.forEach(booking => {
        if (booking._id) {
          guestStore.addId(booking._id);
        }
      });

      setRows(prev => {
        const existingIds = new Set(
          prev.map(booking => booking._id)
        );

        const newEntries = results.filter(
          booking => !existingIds.has(booking._id)
        );

        return [...newEntries, ...prev];
      });

      setSuccess(
        `Found ${results.length} booking(s) for ${searchQuery}.`
      );

      if (results.length === 1) {
        setSelected(results[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  // Cancel booking.
  const cancel = async booking => {
    const confirmed = window.confirm(
      `Cancel booking ${booking.code}? This will release your parking spot.`
    );

    if (!confirmed) return;

    setBusy(booking._id);
    setError('');
    setSuccess('');

    try {
      await api(`/bookings/${booking._id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          code: booking.code
        })
      });

      setSuccess(
        `Booking ${booking.code} cancelled successfully.`
      );

      if (selected?._id === booking._id) {
        setSelected(null);
      }

      await loadBookings();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  // Start online UPI QR payment.
  const payOnline = async booking => {
    setBusy(booking._id);
    setError('');
    setSuccess('');

    try {
      const result = await api(
        `/payments/${booking._id}/qr${guestCodeQuery(booking)}`,
        {
          method: 'POST',
          body: guestCodeBody(booking)
        }
      );

      if (result.alreadyPaid && result.booking) {
        setSelected(result.booking);
        setSuccess(`Booking ${booking.code} is already paid! Gate Pass QR is ready.`);
        return;
      }

      const qrImageUrl =
        result.qrImageUrl ||
        result.imageUrl ||
        result.qr?.image_url ||
        result.image_url ||
        '';

      const qrShortUrl =
        result.qrShortUrl ||
        result.shortUrl ||
        result.qr?.short_url ||
        result.short_url ||
        '';

      if (!qrImageUrl && !qrShortUrl) {
        throw new Error(
          'Payment QR was not returned by the server. Please try again.'
        );
      }

      setPaymentQr({
        booking,
        method: 'online',
        imageUrl: qrImageUrl,
        shortUrl: qrShortUrl,
        expiresAt:
          result.expiresAt ||
          result.qrExpiresAt ||
          result.qr?.close_by ||
          null
      });

      setSuccess(
        `UPI QR generated for booking ${booking.code}. Complete payment using your UPI app.`
      );

      await loadBookings();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  // Open the QR generated by Admin for counter UPI payment.
  const openCounterQr = booking => {
    const payment = booking.payment || {};

    if (!payment.qrImageUrl && !payment.qrShortUrl) {
      setError(
        'Admin has not generated the counter payment QR yet.'
      );
      return;
    }

    setPaymentQr({
      booking,
      method: 'counter',
      imageUrl: payment.qrImageUrl || '',
      shortUrl: payment.qrShortUrl || '',
      expiresAt: payment.qrExpiresAt || null
    });

    setError('');
  };

  // Poll backend payment status. Only backend-confirmed payment is accepted.
  useEffect(() => {
    if (!paymentQr?.booking?._id) return;

    const booking = paymentQr.booking;
    let active = true;
    let intervalId;

    const checkStatus = async () => {
      if (!active) return;

      try {
        const result = await api(
          `/payments/${booking._id}/status${guestCodeQuery(booking)}`
        );

        if (!active) return;

        const updatedBooking =
          result.booking ||
          result.data?.booking ||
          result;

        const paymentStatus =
          updatedBooking.payment?.status ||
          result.payment?.status;

        if (paymentStatus === 'paid') {
          const refreshed =
            updatedBooking._id
              ? updatedBooking
              : {
                  ...booking,
                  payment: {
                    ...booking.payment,
                    status: 'paid'
                  }
                };

          setRows(prev =>
            prev.map(item =>
              item._id === booking._id
                ? { ...item, ...refreshed }
                : item
            )
          );

          setPaymentQr(null);
          setSelected(refreshed);
          setSuccess(
            `Payment confirmed for ${booking.code}! Your Gate Pass QR is generated and ready.`
          );

          loadBookings();
        }
      } catch (e) {
        // A temporary polling error should not close the payment QR.
        console.warn('Payment status check failed:', e.message);
      }
    };

    checkStatus();

    intervalId = window.setInterval(checkStatus, 4000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [paymentQr?.booking?._id]);

  // Auto-poll when viewing a pending payment or cash request in Gate Pass modal
  useEffect(() => {
    if (!selected?._id || selected.payment?.status === 'paid' || selected.status === 'expired') return;
    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await api(`/payments/${selected._id}/status${guestCodeQuery(selected)}`);
        if (!active) return;
        const updated = res.booking || res.data?.booking || res;
        if (updated?.payment?.status === 'paid') {
          setSelected(updated);
          setRows(prev => prev.map(b => (b._id === selected._id ? { ...b, ...updated } : b)));
          setSuccess(
            `Cash received by Admin! Parking & Gate Entry Access granted for ${updated.code}!`
          );
          loadBookings();
        } else if (updated?.status === 'expired') {
          setSelected(updated);
          setRows(prev => prev.map(b => (b._id === selected._id ? { ...b, ...updated } : b)));
        }
      } catch (err) {}
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selected?._id, selected?.payment?.status, selected?.status]);

  // Filter bookings.
  const shown = rows.filter(booking => {
    if (tab === 'all') return true;

    if (tab === 'upcoming') {
      return [
        'confirmed',
        'pending_payment'
      ].includes(booking.status);
    }

    if (tab === 'active') {
      return [
        'checked_in',
        'payment_due'
      ].includes(booking.status);
    }

    return [
      'completed',
      'cancelled',
      'expired'
    ].includes(booking.status);
  });

  const canShowGateQr = booking =>
    Boolean(
      (booking?.payment?.gateQrIssuedAt || booking?.payment?.status === 'paid') &&
      booking?.qrToken
    );

  return (
    <div className="container inner-page bookings-page">

      <div className="page-intro">
        <div className="section-kicker">
          VEHICLE PASS & BOOKINGS
        </div>

        <h1>
          Office Parking <em>Reservations.</em>
        </h1>

        <p>
          View your parking reservations, complete UPI payments
          and access your Admin-issued gate pass.
        </p>
      </div>

      {/* SEARCH */}
      <div
        className="search-toolbar"
        style={{ marginBottom: '1.5rem' }}
      >
        <form
          className="wide-search"
          onSubmit={handleSearch}
        >
          <Search size={20} />

          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={
              user
                ? 'Find by Vehicle Number or Booking Code (PK-XXXX)'
                : 'Find guest booking using Booking Code (PK-XXXX)'
            }
          />

          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? 'Searching…' : 'Find Booking'}
          </button>
        </form>
      </div>

      <ErrorBanner
        message={error}
        onClose={() => setError('')}
      />

      {success && (
        <div
          className="success-banner"
          style={{ marginBottom: '1rem' }}
        >
          <Check size={18} />
          {success}
        </div>
      )}

      {/* TABS */}
      <div className="booking-tabs">
        {[
          ['all', 'All Bookings'],
          ['upcoming', 'Upcoming / Confirmed'],
          ['active', 'Parked at Office'],
          ['past', 'Completed / History']
        ].map(([value, title]) => (
          <button
            className={tab === value ? 'active' : ''}
            key={value}
            onClick={() => setTab(value)}
          >
            {title}
          </button>
        ))}
      </div>

      {/* BOOKINGS LIST */}
      {loading ? (
        <Spinner />
      ) : shown.length ? (
        <div className="mybookings-list">
          {shown.map(booking => {
            const payment = booking.payment || {};
            const isTerminal = [
              'cancelled',
              'expired',
              'completed'
            ].includes(booking.status);

            const counterQrReady =
              payment.method === 'counter' &&
              payment.status !== 'paid' &&
              Boolean(payment.qrImageUrl || payment.qrShortUrl);

            return (
              <div
                key={booking._id}
                className={`booking-record ${
                  highlighted === booking._id
                    ? 'just-booked'
                    : ''
                }`}
              >
                <div className="booking-record-main">
                  <div className="booking-record-icon">
                    <CarFront size={32} />
                  </div>

                  <div className="booking-record-info">
                    <span className="booking-code">
                      <Ticket size={14} />
                      {booking.code}
                    </span>

                    <h3>
                      Vehicle: {booking.vehicleNumber}{' '}

                      {booking.guestName && (
                        <small
                          style={{
                            fontWeight: 400,
                            opacity: 0.8
                          }}
                        >
                          ({booking.guestName})
                        </small>
                      )}
                    </h3>

                    <p>
                      <MapPin size={15} />

                      {booking.location?.name || 'Office Parking'}
                      {' · '}
                      Slot {booking.slot?.number || '—'}
                      {' (Floor '}
                      {booking.slot?.floor || 'G'}
                      {')'}
                    </p>
                  </div>

                  <Status value={booking.status} />
                </div>

                <div className="record-divide" />

                <div className="booking-record-meta">
                  <div>
                    <small>Arrival Window</small>
                    <b>{formatDate(booking.startAt)}</b>
                  </div>

                  <div>
                    <small>Departure</small>
                    <b>{formatDate(booking.endAt)}</b>
                  </div>

                  <div>
                    <small>Parking Fare</small>
                    <b>{formatMoney(booking.amount)}</b>
                  </div>

                  <div>
                    <small>Payment Status</small>
                    <Status value={payment.status} />
                  </div>
                </div>

                <div className="booking-record-actions">

                  {/* ONLINE UPI PAYMENT */}
                  {payment.status !== 'paid' &&
                    !isTerminal &&
                    payment.method !== 'counter' && (
                      config.online ? (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy === booking._id}
                          onClick={() => payOnline(booking)}
                        >
                          {busy === booking._id
                            ? 'Generating QR…'
                            : 'Pay Online via UPI QR'}

                          <QrCode size={16} />
                        </button>
                      ) : (
                        <span
                          className="muted"
                          style={{ fontSize: '0.85rem' }}
                        >
                          Online QR payment is unavailable
                        </span>
                      )
                    )}

                  {/* CASH AT GATE STATUS */}
                  {payment.method === 'counter' &&
                    payment.status !== 'paid' &&
                    !isTerminal && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#fffbeb', border: '1px solid #fde68a', padding: '10px 14px', borderRadius: 10, width: '100%', marginTop: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b45309', fontWeight: 600, fontSize: '0.88rem' }}>
                            <Clock size={15} /> Cash Payment Request Sent to Admin
                          </div>
                          <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontWeight: 600, border: '1px solid #fde68a' }}>
                            Valid for 24h
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#92400e' }}>
                          Admin will collect <b>{formatMoney(booking.amount)}</b> cash and grant your parking & gate entry access.
                        </p>
                        <div style={{ fontSize: '0.78rem', color: '#a16207' }}>
                          ⏳ Request automatically ends in 24 hours if cash is not received (slot will be released).
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setSelected(booking)}
                          >
                            <QrCode size={15} />
                            View Cash Pass Status
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={busy === booking._id}
                            onClick={() => payOnline(booking)}
                            title="Pay online using UPI instead"
                          >
                            Pay Online via UPI Instead
                          </button>
                        </div>
                      </div>
                    )}

                  {/* GATE PASS ENTRY QR */}
                  {canShowGateQr(booking) && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setSelected(booking)}
                    >
                      <QrCode size={17} />
                      View Gate Pass QR
                    </button>
                  )}

                  {/* RECEIPT */}
                  {payment.status === 'paid' && (
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => {
                        setReceiptBooking(booking);
                        setAutoPrintReceipt(false);
                      }}
                      title="Open 58mm thermal receipt"
                    >
                      <Printer size={16} />
                      View 58mm Receipt
                    </button>
                  )}

                  {/* CANCEL */}
                  {[
                    'confirmed',
                    'pending_payment'
                  ].includes(booking.status) &&
                    payment.status !== 'paid' && (
                      <button
                        className="btn btn-soft btn-sm"
                        disabled={busy === booking._id}
                        onClick={() => cancel(booking)}
                      >
                        {busy === booking._id
                          ? 'Cancelling…'
                          : 'Cancel Booking'}
                      </button>
                    )}

                  {booking.status === 'payment_due' && (
                    <span className="due-label">
                      Due at Exit:{' '}
                      {formatMoney(
                        (payment.status === 'paid'
                          ? 0
                          : booking.amount) +
                          (booking.extraDue || 0)
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={CalendarCheck2}
          title="No bookings found"
          message="No active reservations found on this browser. You can park a vehicle now or search using your booking code."
          action={
            <Link to="/" className="btn btn-primary">
              Park a Vehicle Now
              <ArrowRight size={18} />
            </Link>
          }
        />
      )}

      {/* GATE QR MODAL */}
      {selected && (
        <div
          className="modal-backdrop"
          onClick={() => setSelected(null)}
        >
          <div
            className="ticket-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Parking QR ticket"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>

            <div className="ticket-modal-header">
              <div className="ticket-modal-icon">
                <QrCode size={26} />
              </div>

              <h2>Gate Pass & Payment Receipt</h2>

              <p>
                {selected.payment?.status === 'paid'
                  ? 'Payment verified! Present this QR code to security or scan at barrier scanner.'
                  : 'Pay cash to gate security upon arrival to validate your pass.'}
              </p>
            </div>

            <div className="ticket-qr">
              {canShowGateQr(selected) ? (
                <>
                  <QRCodeSVG
                    value={selected.qrToken}
                    size={220}
                    includeMargin
                    level="H"
                  />
                  <div style={{ marginTop: '8px', fontSize: '0.85rem', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <ShieldCheck size={16} /> VALID ENTRY PASS · BARRIER READY
                  </div>
                </>
              ) : selected.status === 'expired' ? (
                <div style={{ padding: '24px 18px', background: '#fef2f2', border: '1px dashed #ef4444', borderRadius: 16, textAlign: 'center' }}>
                  <Clock size={40} color="#dc2626" style={{ margin: '0 auto 10px' }} />
                  <h3 style={{ margin: '0 0 6px', color: '#991b1b', fontSize: '1.05rem' }}>Cash Request Expired</h3>
                  <p style={{ margin: '0', fontSize: '0.85rem', color: '#b91c1c' }}>
                    The 24-hour limit to pay cash at the gate has expired. The reserved parking slot has been released.
                  </p>
                </div>
              ) : selected.payment?.method === 'counter' ? (
                <div style={{ padding: '24px 18px', background: '#fffbeb', border: '1px dashed #f59e0b', borderRadius: 16, textAlign: 'center' }}>
                  <Wallet size={40} color="#d97706" style={{ margin: '0 auto 10px' }} />
                  <h3 style={{ margin: '0 0 6px', color: '#92400e', fontSize: '1.05rem' }}>Cash Request Sent to Admin</h3>
                  <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#78350f' }}>
                    Please hand over <b>{formatMoney(selected.amount)}</b> cash to the parking admin / gate attendant.
                  </p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fef3c7', padding: '6px 14px', borderRadius: 20, fontSize: '0.85rem', color: '#b45309', fontWeight: 600 }}>
                    <Clock size={15} /> Waiting for Admin to receive cash…
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#b45309', fontWeight: 600 }}>
                    ⏳ Valid for 24 hours (auto-expires if cash not received)
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#a16207' }}>
                    Once Admin confirms receiving your cash, your active Gate Entry Pass QR will appear right here automatically!
                  </p>
                </div>
              ) : (
                <div style={{ padding: '24px 16px', background: '#f8fafc', borderRadius: 12, textAlign: 'center' }}>
                  <QrCode size={36} color="#475569" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>Payment Pending</p>
                  <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Complete online UPI payment to unlock your Gate Pass QR.
                  </p>
                </div>
              )}
            </div>

            <div className="ticket-booking-code">
              {selected.code}
            </div>

            <div className="ticket-details">
              <span>
                Vehicle: {selected.vehicleNumber}
              </span>

              <strong>
                Slot {selected.slot?.number || '—'}
                {' · '}
                Floor {selected.slot?.floor || 'G'}
              </strong>
            </div>

            <div
              style={{
                textAlign: 'center',
                margin: '0.5rem 0',
                fontSize: '0.9rem',
                color: '#636b83'
              }}
            >
              <div>
                Facility:{' '}
                {selected.location?.name ||
                  'Office Workspace Parking'}
              </div>

              <div>
                Payment:{' '}
                <b style={{ color: selected.payment?.status === 'paid' ? '#16a34a' : '#d97706' }}>
                  {selected.payment?.status === 'paid'
                    ? (selected.payment?.method === 'online' ? 'PAID [ONLINE UPI]' : 'PAID [CASH]')
                    : 'CASH AT GATE (AWAITING ADMIN)'}
                </b>
                {' ('}
                {formatMoney(selected.amount)}
                {')'}
              </div>

              {selected.payment?.reference && (
                <div style={{ fontSize: '0.8rem', marginTop: 4, color: '#64748b' }}>
                  Ref: <code>{selected.payment.reference}</code>
                </div>
              )}
            </div>

            <p className="ticket-note">
              <ShieldCheck size={15} />
              {selected.payment?.status === 'paid'
                ? 'Instant digital pass with QR code for gate entry.'
                : 'Admin / Security will collect cash and activate gate barrier.'}
            </p>

            {selected.payment?.status !== 'paid' && selected.payment?.method === 'counter' && (
              <button
                className="btn btn-outline"
                style={{ width: '100%', marginTop: '12px' }}
                onClick={() => {
                  const target = selected;
                  setSelected(null);
                  payOnline(target);
                }}
              >
                <QrCode size={18} />
                Pay Online via UPI Instead
              </button>
            )}

            {selected.payment?.status !== 'paid' && selected.payment?.method !== 'counter' && (
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '12px' }}
                onClick={() => {
                  const target = selected;
                  setSelected(null);
                  payOnline(target);
                }}
              >
                <QrCode size={18} />
                Pay Online via UPI Now
              </button>
            )}

            {selected.payment?.status === 'paid' && (
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '12px' }}
                onClick={() => {
                  const target = selected;

                  setSelected(null);
                  setReceiptBooking(target);
                  setAutoPrintReceipt(false);
                }}
              >
                <Printer size={18} />
                View 58mm Thermal Receipt & Pass
              </button>
            )}
          </div>
        </div>
      )}

      {/* PAYMENT QR MODAL */}
      {paymentQr && (
        <div
          className="modal-backdrop"
          onClick={() => setPaymentQr(null)}
        >
          <div
            className="ticket-modal"
            role="dialog"
            aria-modal="true"
            aria-label="UPI payment QR"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              onClick={() => setPaymentQr(null)}
            >
              <X />
            </button>

            <div className="ticket-modal-header">
              <div className="ticket-modal-icon">
                <QrCode size={26} />
              </div>

              <h2>Online UPI Payment</h2>

              <p>
                Scan this QR using your UPI app (Google Pay, PhonePe, Paytm, BHIM) to complete payment.
              </p>
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: '16px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '230px'
              }}
            >
              {paymentQr.imageUrl ? (
                <img
                  src={paymentQr.imageUrl}
                  alt="UPI payment QR code"
                  style={{
                    width: '220px',
                    height: '220px',
                    objectFit: 'contain'
                  }}
                />
              ) : paymentQr.shortUrl ? (
                <QRCodeSVG
                  value={paymentQr.shortUrl}
                  size={220}
                  includeMargin
                  level="H"
                />
              ) : (
                <p>Payment QR is not available.</p>
              )}

              {paymentQr.shortUrl && paymentQr.shortUrl.startsWith('upi://') && (
                <a
                  href={paymentQr.shortUrl}
                  className="btn btn-soft btn-sm"
                  style={{ marginTop: '10px', fontSize: '0.85rem' }}
                >
                  Pay via UPI App on this Device ↗
                </a>
              )}
            </div>

            <div className="ticket-booking-code">
              {paymentQr.booking.code}
            </div>

            <div className="ticket-details">
              <span>Amount to Pay</span>
              <strong style={{ color: '#2563eb', fontSize: '1.2rem' }}>
                {formatMoney(paymentQr.booking.amount)}
              </strong>
            </div>

            {paymentQr.expiresAt && (
              <p
                style={{
                  textAlign: 'center',
                  fontSize: '0.85rem',
                  color: '#636b83'
                }}
              >
                QR expiry: {formatDate(paymentQr.expiresAt)}
              </p>
            )}

            <div
              style={{
                textAlign: 'center',
                marginTop: '10px',
                fontSize: '0.85rem'
              }}
            >
              <Clock size={15} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} />
              Waiting for UPI payment confirmation…
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                After completing the payment in your UPI app, click below to verify and generate your Gate Pass QR immediately.
              </p>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '12px' }}
              disabled={checkingPayment}
              onClick={async () => {
                setCheckingPayment(true);

                try {
                  const result = await api(
                    `/payments/${paymentQr.booking._id}/confirm-upi${guestCodeQuery(paymentQr.booking)}`,
                    {
                      method: 'POST',
                      body: guestCodeBody(paymentQr.booking)
                    }
                  );

                  const updated =
                    result.booking ||
                    result.data?.booking ||
                    result;

                  if (updated.payment?.status === 'paid' ||
                      result.payment?.status === 'paid') {
                    setPaymentQr(null);
                    setSuccess(
                      `Payment confirmed for ${paymentQr.booking.code}! Gate Pass QR is ready.`
                    );

                    await loadBookings();
                    setSelected(updated);
                  } else {
                    setSuccess(
                      'Payment is not confirmed yet. Please complete the transaction in your UPI app.'
                    );
                  }
                } catch (e) {
                  setError(e.message);
                } finally {
                  setCheckingPayment(false);
                }
              }}
            >
              <ShieldCheck size={18} />
              {checkingPayment
                ? 'Verifying UPI Payment…'
                : 'I Have Paid / Verify & Get Gate Pass QR'}
            </button>
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT */}
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
