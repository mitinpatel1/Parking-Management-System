import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Bike,
  Building2,
  CalendarDays,
  CarFront,
  Check,
  Clock,
  Clock3,
  CreditCard,
  MapPin,
  ParkingSquare,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  User,
  Wallet,
  Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, dateTimeInput, formatMoney, guestStore, locationImageClass } from '../lib/api';
import { useLive } from '../contexts/LiveContext';
import { ErrorBanner, Spinner } from '../components/Status';

const slotMeta = {
  car: { title: 'Car', icon: CarFront, badge: 'Standard car bays' },
  bike: { title: 'Two-wheeler', icon: Bike, badge: 'Bike & scooter bays' },
  ev: { title: 'Electric vehicle', icon: Zap, badge: 'EV charging bays' },
  accessible: { title: 'Accessible', icon: ShieldCheck, badge: 'Reserved accessible bays' }
};

export default function OfficeParking() {
  const nav = useNavigate();
  const { version } = useLive();

  const [location, setLocation] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [vehicle, setVehicle] = useState('car');
  const [floor, setFloor] = useState('');
  const [plate, setPlate] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [pay, setPay] = useState('counter');
  const [saving, setSaving] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState({ demo: false, online: false });

  // Default time window: Current time to +4 hours
  const [start, setStart] = useState(() => dateTimeInput(new Date()));
  const [end, setEnd] = useState(() => dateTimeInput(new Date(Date.now() + 4 * 3600000)));

  // Load primary office location & payment configuration
  useEffect(() => {
    let active = true;
    setError('');
    api('/locations/office/primary')
      .then(loc => {
        if (active) setLocation(loc);
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    api('/payments/config')
      .then(cfg => {
        if (active) setPaymentConfig(cfg);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // Fetch slots whenever location, dates, vehicle type or live version changes
  useEffect(() => {
    if (!location?._id) return;
    let active = true;
    setFetching(true);
    const a = new Date(start);
    const b = new Date(end);
    if (isNaN(a.getTime()) || isNaN(b.getTime()) || b <= a) {
      setSlots([]);
      setFetching(false);
      return;
    }

    api(
      `/locations/${location._id}/slots?startAt=${encodeURIComponent(a.toISOString())}&endAt=${encodeURIComponent(b.toISOString())}&vehicleType=${vehicle}`
    )
      .then(d => {
        if (active) {
          setSlots(d);
          setSelected(prev => (d.some(s => s.id === prev && s.available) ? prev : ''));
        }
      })
      .catch(e => {
        if (active && e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (active) setFetching(false);
      });

    return () => {
      active = false;
    };
  }, [location?._id, start, end, vehicle, version]);

  const floors = useMemo(() => [...new Set(slots.map(s => s.floor))], [slots]);
  const filtered = useMemo(() => slots.filter(s => !floor || s.floor === floor), [slots, floor]);
  const chosen = useMemo(() => slots.find(s => s.id === selected), [slots, selected]);
  const availableCount = useMemo(() => filtered.filter(s => s.available).length, [filtered]);
  const totalAvailableAll = useMemo(() => slots.filter(s => s.available).length, [slots]);

  const hours = Math.max(1, (new Date(end) - new Date(start)) / 3600000);
  const hourlyRate = chosen && location?.prices ? location.prices[chosen.kind] || 0 : location?.prices?.[vehicle] || 30;
  const estimate = chosen && location ? Math.ceil(hours * hourlyRate) : 0;

  const setDuration = h => {
    const s = new Date(start);
    if (isNaN(s.getTime())) return;
    const n = new Date(s.getTime() + h * 3600000);
    setEnd(dateTimeInput(n));
  };

  const submitBooking = async e => {
    e.preventDefault();
    if (!chosen) {
      setError('Please select an available parking slot from the layout.');
      return;
    }
    const cleanPlate = plate.trim().toUpperCase().replace(/\s+/g, '');
    if (cleanPlate.length < 4 || cleanPlate.length > 16) {
      setError('Please enter a valid vehicle registration number (4 to 16 characters).');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let startTime = new Date(start);
      let endTime = new Date(end);
      if (isNaN(startTime.getTime())) startTime = new Date();
      if (isNaN(endTime.getTime()) || endTime <= startTime) {
        endTime = new Date(startTime.getTime() + 4 * 3600000);
      }
      // If start was earlier while filling form, auto-advance to current time
      if (startTime.getTime() < Date.now() - 60000) {
        const durationMs = Math.max(3600000, endTime.getTime() - startTime.getTime());
        startTime = new Date();
        endTime = new Date(startTime.getTime() + durationMs);
      }

      const booking = await api('/bookings', {
        method: 'POST',
        body: {
          slotId: selected,
          startAt: startTime.toISOString(),
          endAt: endTime.toISOString(),
          vehicleType: vehicle,
          vehicleNumber: cleanPlate,
          guestName: guestName.trim() || undefined,
          guestPhone: guestPhone.trim() || undefined,
          paymentMethod: pay
        }
      });

      // Save ID to local storage so user can view booking without login
      guestStore.addId(booking._id);

      // Redirect to My Bookings with new ticket open
      nav('/bookings', { state: { newBooking: booking._id, justBooked: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  if (!location) {
    return (
      <div className="container inner-page">
        <ErrorBanner message={error || 'Office parking facility details could not be loaded.'} />
      </div>
    );
  }

  const paymentReady = paymentConfig.demo || paymentConfig.online;

  return (
    <div className="container inner-page office-parking-page">
      {/* VENUE HERO / HEADER */}
      <div className="office-header-card">
        <div className="office-header-main">
          <div className="office-badge">
            <Building2 size={16} />
            <span>OFFICE WORKSPACE PARKING</span>
          </div>
          <h1>{location.name}</h1>
          <p className="office-address">
            <MapPin size={16} /> {location.address}, {location.area}, {location.city}
          </p>
          <div className="office-amenities">
            {location.features?.map(feat => (
              <span key={feat} className="amenity-tag">
                <Check size={14} /> {feat}
              </span>
            ))}
          </div>
        </div>

        <div className="office-capacity-card">
          <div className="capacity-number">{totalAvailableAll}</div>
          <div className="capacity-label">Spaces Available Now</div>
          <div className="capacity-sub">Total {slots.length} bays across all floors</div>
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />

      {/* MAIN TWO-COLUMN BOOKING INTERFACE */}
      <div className="detail-grid">
        <div className="detail-left">
          {/* STEP 1: PARKING DURATION & TIME */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>1. Select Parking Timing</h2>
                <p>When will your vehicle arrive and depart from the office?</p>
              </div>
              <CalendarDays size={22} />
            </div>

            <div className="form-grid">
              <label className="field">
                Arrival Date & Time
                <input
                  type="datetime-local"
                  value={start}
                  min={dateTimeInput(new Date())}
                  onChange={e => {
                    setSelected('');
                    setStart(e.target.value);
                    if (new Date(end) <= new Date(e.target.value)) {
                      setEnd(dateTimeInput(new Date(new Date(e.target.value).getTime() + 4 * 3600000)));
                    }
                  }}
                />
              </label>

              <label className="field">
                Departure Date & Time
                <input
                  type="datetime-local"
                  value={end}
                  min={start}
                  onChange={e => {
                    setSelected('');
                    setEnd(e.target.value);
                  }}
                />
              </label>
            </div>

            <div className="quick-duration-row">
              <span className="quick-label">
                <Clock3 size={15} /> Quick presets:
              </span>
              <button type="button" className="btn btn-outline btn-xs" onClick={() => setDuration(2)}>
                2 Hours
              </button>
              <button type="button" className="btn btn-outline btn-xs" onClick={() => setDuration(4)}>
                4 Hours
              </button>
              <button type="button" className="btn btn-outline btn-xs" onClick={() => setDuration(8)}>
                Full Workday (8h)
              </button>
            </div>
          </div>

          {/* STEP 2: VEHICLE CATEGORY */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>2. Select Vehicle Type</h2>
                <p>Choose your vehicle to show compatible parking bays.</p>
              </div>
              <CarFront size={22} />
            </div>

            <div className="vehicle-tabs">
              {Object.entries(slotMeta).map(([vKey, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    type="button"
                    key={vKey}
                    className={`vehicle-tab ${vKey === vehicle ? 'selected' : ''}`}
                    onClick={() => {
                      setVehicle(vKey);
                      setSelected('');
                    }}
                  >
                    <Icon size={24} />
                    <strong>{meta.title}</strong>
                    <small>₹{location.prices?.[vKey] || 30}/hr</small>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 3: INTERACTIVE FLOOR & SLOT MAP */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>3. Choose Your Parking Slot</h2>
                <p>Live bay layout for your selected time window.</p>
              </div>
              <span className="mini-live">
                <i /> LIVE
              </span>
            </div>

            <div className="slot-topline">
              <b>Select Floor:</b>
              <div className="floor-tabs">
                <button
                  type="button"
                  className={!floor ? 'active' : ''}
                  onClick={() => {
                    setFloor('');
                    setSelected('');
                  }}
                >
                  All Floors
                </button>
                {floors.map(f => (
                  <button
                    type="button"
                    key={f}
                    className={floor === f ? 'active' : ''}
                    onClick={() => {
                      setFloor(f);
                      setSelected('');
                    }}
                  >
                    Floor {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="slot-legend">
              <span>
                <i className="legend-available" /> Available
              </span>
              <span>
                <i className="legend-selected" /> Selected
              </span>
              <span>
                <i className="legend-reserved" /> Reserved
              </span>
              <span>
                <i className="legend-occupied" /> Occupied
              </span>
            </div>

            {fetching ? (
              <div className="subtle-loading">Updating live slot status…</div>
            ) : (
              <>
                <div className="slots-grid">
                  {filtered.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!s.available}
                      onClick={() => setSelected(s.id)}
                      className={`slot-tile ${
                        s.id === selected
                          ? 'slot-selected'
                          : s.reserved
                          ? 'slot-reserved'
                          : s.state === 'occupied'
                          ? 'slot-occupied'
                          : s.available
                          ? 'slot-available'
                          : 'slot-inactive'
                      }`}
                      aria-label={`Slot ${s.number}, Floor ${s.floor}`}
                    >
                      <CarFront size={24} />
                      <b>{s.number}</b>
                      <small>
                        {s.floor} · {s.kind.toUpperCase()}
                      </small>
                    </button>
                  ))}
                </div>

                <div className="slot-foot">
                  <span>
                    <span className="availability-dot" /> {availableCount} matching spaces available
                  </span>
                  <span>{filtered.length} total spots shown</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* SIDEBAR: NO-LOGIN VEHICLE & RESERVATION FORM */}
        <aside className="detail-aside">
          <form className="panel booking-widget" onSubmit={submitBooking}>
            <div className="panel-head">
              <div>
                <h2>Park Vehicle</h2>
                <p>Instant pass generation. No login required.</p>
              </div>
              <span className="booking-icon">
                <QrCode size={22} />
              </span>
            </div>

            {/* RESERVATION SUMMARY */}
            <div className="booking-mini-summary">
              <div>
                <span>Facility</span>
                <b>{location.name}</b>
              </div>
              <div>
                <span>Selected Spot</span>
                <b>{chosen ? `${chosen.number} (Floor ${chosen.floor})` : 'Select from map'}</b>
              </div>
              <div>
                <span>Duration</span>
                <b>{Number.isFinite(hours) ? `${Math.round(hours * 10) / 10} hrs` : '—'}</b>
              </div>
            </div>

            {/* DRIVER & VEHICLE DETAILS (NO LOGIN NEEDED) */}
            <label className="field">
              Vehicle Registration Number *
              <input
                required
                maxLength={16}
                value={plate}
                onChange={e => setPlate(e.target.value.toUpperCase())}
                placeholder="e.g. DL01AB1234"
              />
            </label>

            <div className="form-grid">
              <label className="field">
                Driver / Employee Name
                <input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="e.g. Rajesh Sharma"
                />
              </label>

              <label className="field">
                Contact Phone
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                />
              </label>
            </div>

            {/* PAYMENT CHOICE */}
            <div className="field">
              <span className="field-label">Payment Option</span>
              <div className="payment-options">
                <label className={`payment-choice ${pay === 'counter' ? 'chosen' : ''}`}>
                  <input
                    type="radio"
                    name="paymethod"
                    checked={pay === 'counter'}
                    onChange={() => setPay('counter')}
                  />
                  <Wallet size={18} /> Pay at Gate (Cash/UPI)
                </label>

                <label
                  className={`payment-choice ${pay === 'online' ? 'chosen' : ''}`}
                  style={!paymentReady ? { opacity: 0.5 } : undefined}
                >
                  <input
                    type="radio"
                    name="paymethod"
                    disabled={!paymentReady}
                    checked={pay === 'online'}
                    onChange={() => setPay('online')}
                  />
                  <CreditCard size={18} /> Pay Online Now
                </label>
              </div>
            </div>

            {/* FARE ESTIMATE */}
            <div className="price-breakdown">
              <span>Estimated Parking Fare</span>
              <b>{chosen ? formatMoney(estimate) : 'Select a slot'}</b>
            </div>

            <small className="rate-note">
              Rate: ₹{hourlyRate}/hr. Payment is securely recorded and credited directly to parking administration.
            </small>

            <button disabled={saving || !chosen} className="btn btn-primary btn-block btn-book" type="submit">
              {saving ? 'Confirming parking…' : 'Park Vehicle & Get QR Pass'} <ArrowRight size={18} />
            </button>

            <div className="security-text">
              <ShieldCheck size={15} /> Instant digital ticket with QR code for gate entry
            </div>
          </form>

          <div className="aside-small-card">
            <Sparkles size={20} />
            <div>
              <b>Gate Entry Instruction</b>
              <p>Present the generated QR pass to security staff or gate scanner upon arrival.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

