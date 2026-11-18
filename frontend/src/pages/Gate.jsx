import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Camera,
  CarFront,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Printer,
  ScanLine,
  Search,
  ShieldCheck,
  Upload,
  VideoOff,
  Wallet,
  X
} from 'lucide-react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { api, formatDate, formatMoney } from '../lib/api';
import { useLive } from '../contexts/LiveContext';
import { ErrorBanner, Spinner, Status } from '../components/Status';
import ThermalReceipt58mm from '../components/ThermalReceipt58mm';

export default function Gate() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ref, setRef] = useState('');

  // 58mm Thermal Receipt state
  const [receiptBooking, setReceiptBooking] = useState(null);
  const [autoPrint, setAutoPrint] = useState(false);

  const video = useRef(null);
  const controls = useRef(null);
  const { version } = useLive();

  const load = () => api('/staff/active').then(setActive).catch(() => {});

  useEffect(() => {
    load();
  }, [version]);

  useEffect(() => () => {
    controls.current?.stop();
  }, []);

  const lookup = async (value = code) => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await api(`/staff/lookup?code=${encodeURIComponent(value)}`);
      setResult(res);
      return res;
    } catch (e) {
      setResult(null);
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const doAction = async action => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const d = await api(`/staff/${result._id}/${action}`, {
        method: 'POST',
        ...(action === 'settle' || action === 'record-cash' ? { body: { reference: ref } } : {})
      });

      setMessage(
        action === 'check-in'
          ? 'Vehicle successfully checked in.'
          : action === 'check-out'
          ? `Checked out. ${d.due > 0 ? `${formatMoney(d.due)} due at counter.` : 'Payment complete.'}`
          : action === 'record-cash'
          ? 'Cash payment collected. 58mm receipt ready.'
          : 'Payment settled. Visit complete. 58mm receipt ready.'
      );

      const refreshed = await lookup(result.code);
      load();

      // For cash payment actions, automatically show 58mm receipt for printing
      if (action === 'settle' || action === 'record-cash') {
        const receiptData = d.booking || refreshed || result;
        setReceiptBooking(receiptData);
        setAutoPrint(true);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const stopScan = () => {
    controls.current?.stop();
    controls.current = null;
    setScanning(false);
  };

  const scan = () => {
    setError('');
    setScanning(true);
  };

  useEffect(() => {
    if (!scanning || !video.current) return;
    let isActive = true;
    const reader = new BrowserQRCodeReader();
    reader
      .decodeFromVideoDevice(undefined, video.current, (r, err, ctrl) => {
        if (r && isActive) {
          const value = r.getText();
          setCode(value);
          ctrl.stop();
          setScanning(false);
          lookup(value);
        }
      })
      .then(c => {
        if (isActive) controls.current = c;
        else c.stop();
      })
      .catch(() => {
        if (isActive) {
          setScanning(false);
          setError('Camera unavailable. Use HTTPS (or localhost) and grant camera permission.');
        }
      });
    return () => {
      isActive = false;
      controls.current?.stop();
      controls.current = null;
    };
  }, [scanning]);

  const ocr = async file => {
    if (!file) return;
    setOcrBusy(true);
    setError('');
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      try {
        const {
          data: { text }
        } = await worker.recognize(file);
        const candidates = text
          .toUpperCase()
          .replace(/[^A-Z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(Boolean);
        const plate =
          candidates.join('').match(/[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}/)?.[0] ||
          candidates.join('').slice(0, 16);
        if (!plate) throw new Error('Could not read a number plate. Please enter it manually.');
        setCode(plate);
        setMessage(`OCR suggestion: ${plate}. Please verify manually before entry.`);
      } finally {
        await worker.terminate();
      }
    } catch (e) {
      setError(e.message || 'Plate recognition failed. Enter plate manually.');
    } finally {
      setOcrBusy(false);
    }
  };

  return (
    <>
      <div className="dash-page-heading">
        <div>
          <div className="section-kicker">GATE OPERATIONS</div>
          <h1>Vehicle check-in & out</h1>
          <p>Scan passes, verify plates and manage parking entry/exit and cash receipts.</p>
        </div>
        <span className="verified-pill">
          <ShieldCheck size={17} /> Operator access
        </span>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />
      {message && (
        <div className="success-banner">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}

      <div className="gate-grid">
        {/* SCAN / SEARCH PANEL */}
        <section className="dash-panel gate-scan-panel">
          <div className="dash-panel-head">
            <div>
              <h3>Find a reservation</h3>
              <p>Scan a QR, enter a booking code or vehicle plate.</p>
            </div>
            <ScanLine size={22} />
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              lookup();
            }}
          >
            <label className="field">
              Booking code / QR token / plate
              <div className="input-icon-wrap">
                <Search size={20} />
                <input
                  required
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="e.g. PK-ABC123 or DL01AB1234"
                />
              </div>
            </label>
            <button disabled={loading || !code.trim()} className="btn btn-primary btn-block">
              {loading ? 'Checking…' : 'Find booking'} <ArrowUpRight size={17} />
            </button>
          </form>

          <div className="gate-tools">
            <button className="btn btn-outline" onClick={scanning ? stopScan : scan}>
              {scanning ? <VideoOff size={17} /> : <Camera size={17} />}{' '}
              {scanning ? 'Stop camera' : 'Scan QR with camera'}
            </button>
            <label className="btn btn-outline upload-btn">
              <Upload size={17} /> {ocrBusy ? 'Reading plate…' : 'Read plate from photo'}
              <input
                type="file"
                accept="image/*"
                disabled={ocrBusy}
                onChange={e => ocr(e.target.files?.[0])}
              />
            </label>
          </div>
          <p className="hint">
            Camera scanning works on HTTPS or localhost. Photo OCR is experimental and requires
            checking manually.
          </p>
          {scanning && (
            <div className="scanner-box">
              <video ref={video} playsInline muted />
              <span>Point camera at the QR code</span>
            </div>
          )}
        </section>

        {/* RESERVATION DETAILS & ACTIONS */}
        <section className="dash-panel gate-result-panel">
          <div className="dash-panel-head">
            <div>
              <h3>Reservation details</h3>
              <p>Verify booking and take gate action.</p>
            </div>
            <BadgeCheck size={22} />
          </div>

          {result ? (
            <>
              <div className="gate-vehicle-card">
                <span className="gate-vehicle-icon">
                  <CarFront size={33} />
                </span>
                <div>
                  <small>REGISTERED VEHICLE</small>
                  <h2>{result.vehicleNumber}</h2>
                  <b>{result.code}</b>
                </div>
                <Status value={result.status} />
              </div>

              <div className="gate-detail-list">
                <div>
                  <span>Customer</span>
                  <b>{result.user?.name || result.guestName || 'Visitor'}</b>
                </div>
                <div>
                  <span>Parking</span>
                  <b>{result.location?.name}</b>
                </div>
                <div>
                  <span>Slot</span>
                  <b>
                    {result.slot?.number} · Floor {result.slot?.floor || 'G'}
                  </b>
                </div>
                <div>
                  <span>Arrival</span>
                  <b>{formatDate(result.startAt)}</b>
                </div>
                <div>
                  <span>Departure</span>
                  <b>{formatDate(result.endAt)}</b>
                </div>
                <div>
                  <span>Payment</span>
                  <Status value={result.payment?.status} />
                </div>
                <div>
                  <span>Method</span>
                  <b>{result.payment?.method === 'online' ? 'Online' : 'Cash / Gate'}</b>
                </div>
              </div>

              <div className="gate-actions">
                {/* 1. ENTRY CHECK-IN */}
                {result.status === 'confirmed' && (
                  <button
                    disabled={busy}
                    className="btn btn-primary btn-block"
                    onClick={() => doAction('check-in')}
                  >
                    <ArrowDownLeft size={19} /> Check vehicle in
                  </button>
                )}

                {/* 2. CASH PAYMENT ON ARRIVAL (if booking unpaid) */}
                {result.payment?.status !== 'paid' && result.status !== 'payment_due' && (
                  <button
                    disabled={busy}
                    className="btn btn-soft btn-block"
                    onClick={() => doAction('record-cash')}
                  >
                    <Wallet size={18} /> Collect Cash Payment ({formatMoney(result.amount)}) & Print Slip
                  </button>
                )}

                {/* 3. EXIT CHECK-OUT */}
                {result.status === 'checked_in' && (
                  <button
                    disabled={busy}
                    className="btn btn-primary btn-block"
                    onClick={() => doAction('check-out')}
                  >
                    <ArrowUpRight size={19} /> Check vehicle out
                  </button>
                )}

                {/* 4. SETTLE COUNTER CASH PAYMENT AT EXIT */}
                {result.status === 'payment_due' && (
                  <>
                    <div className="due-box">
                      Outstanding balance{' '}
                      <b>
                        {formatMoney(
                          (result.payment.status === 'paid' ? 0 : result.amount) +
                            (result.extraDue || 0)
                        )}
                      </b>
                    </div>
                    <label className="field">
                      Cash / Receipt reference (optional)
                      <input
                        value={ref}
                        onChange={e => setRef(e.target.value)}
                        placeholder="e.g. CASH-101 or receipt slip number"
                      />
                    </label>
                    <button
                      disabled={busy}
                      className="btn btn-primary btn-block"
                      onClick={() => doAction('settle')}
                    >
                      <Wallet size={18} /> Record Cash Payment & Print 58mm Receipt
                    </button>
                  </>
                )}

                {/* 5. PRINT 58MM THERMAL RECEIPT BUTTON (Available whenever paid or completed) */}
                {(result.payment?.status === 'paid' ||
                  result.status === 'completed' ||
                  result.status === 'checked_in') && (
                  <button
                    className="btn btn-outline btn-block"
                    onClick={() => {
                      setReceiptBooking(result);
                      setAutoPrint(false);
                    }}
                  >
                    <Printer size={18} /> Print 58mm Thermal Receipt
                  </button>
                )}

                {result.status === 'completed' && (
                  <div className="success-banner" style={{ marginTop: 8 }}>
                    <CheckCircle2 size={18} /> Visit completed.
                  </div>
                )}

                {['expired', 'cancelled', 'pending_payment'].includes(result.status) && (
                  <p className="hint">Entry unavailable for this booking status.</p>
                )}
              </div>
            </>
          ) : (
            <div className="gate-empty">
              <ScanLine size={54} />
              <h3>Ready when you are</h3>
              <p>Search for a reservation to show vehicle and payment details here.</p>
            </div>
          )}
        </section>
      </div>

      {/* ACTIVE RESERVATIONS TABLE */}
      <section className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <h3>Active parking activity</h3>
            <p>Current and upcoming reservations</p>
          </div>
          <span className="period-tag">{active.length} bookings</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>BOOKING</th>
                <th>VEHICLE</th>
                <th>LOCATION</th>
                <th>ARRIVAL</th>
                <th>STATUS</th>
                <th>PAYMENT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {active.map(b => (
                <tr key={b._id}>
                  <td>
                    <strong>{b.code}</strong>
                  </td>
                  <td>{b.vehicleNumber}</td>
                  <td>
                    {b.location?.name}
                    <small>Slot {b.slot?.number}</small>
                  </td>
                  <td>{formatDate(b.startAt)}</td>
                  <td>
                    <Status value={b.status} />
                  </td>
                  <td>
                    <Status value={b.payment?.status} />
                    <small>{b.payment?.method === 'online' ? 'Online' : 'Cash'}</small>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        className="link-button"
                        onClick={() => {
                          setCode(b.code);
                          lookup(b.code);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Open <ArrowUpRight size={15} />
                      </button>
                      <button
                        className="link-button"
                        onClick={() => {
                          setReceiptBooking(b);
                          setAutoPrint(false);
                        }}
                        title="Print 58mm Thermal Slip"
                      >
                        <Printer size={14} /> Slip
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!active.length && (
                <tr>
                  <td colSpan="7">No active bookings right now.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 58MM THERMAL RECEIPT PRINT MODAL */}
      {receiptBooking && (
        <ThermalReceipt58mm
          booking={receiptBooking}
          autoPrint={autoPrint}
          onClose={() => {
            setReceiptBooking(null);
            setAutoPrint(false);
          }}
        />
      )}
    </>
  );
}
