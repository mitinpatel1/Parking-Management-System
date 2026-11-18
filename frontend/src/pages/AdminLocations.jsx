
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  CirclePlus,
  Edit3,
  MapPin,
  ParkingSquare,
  Plus,
  Save,
  X,
  Trash2
} from 'lucide-react';

import { api, formatMoney } from '../lib/api';
import { ErrorBanner, Spinner, Status } from '../components/Status';

const empty = {
  name: '',
  city: '',
  area: '',
  address: '',
  kind: 'public',
  cover: 'violet',
  lat: 0,
  lng: 0,
  isOpen: true,
  features: ['CCTV', 'Security'],
  prices: {
    car: 40,
    bike: 20,
    ev: 65,
    accessible: 35
  },
  weekendMultiplier: 1.15,
  peakMultiplier: 1.2,
  peakStart: 17,
  peakEnd: 20
};

export default function AdminLocations() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(empty);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Load parking locations
  const load = async () => {
    try {
      setError('');
      const data = await api('/admin/locations');
      setRows(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Add new location
  const startNew = () => {
    setEdit(null);

    setForm({
      ...empty,
      prices: { ...empty.prices },
      features: [...empty.features]
    });

    setOpen(true);
  };

  // Edit location
  const startEdit = (l) => {
    setEdit(l._id);

    setForm({
      ...empty,
      ...l,
      prices: {
        ...empty.prices,
        ...(l.prices || {})
      },
      features: [...(l.features || [])]
    });

    setOpen(true);
  };

  // Save location
  const save = async (e) => {
    e.preventDefault();

    setSaving(true);
    setError('');

    try {
      await api(
        edit
          ? `/admin/locations/${edit}`
          : '/admin/locations',
        {
          method: edit ? 'PATCH' : 'POST',
          body: form
        }
      );

      setOpen(false);
      await load();

    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Open / Close parking location
  const toggle = async (l) => {
    try {
      setError('');

      await api(`/admin/locations/${l._id}`, {
        method: 'PATCH',
        body: {
          isOpen: !l.isOpen
        }
      });

      setRows(prev =>
        prev.map(item =>
          item._id === l._id
            ? { ...item, isOpen: !l.isOpen }
            : item
        )
      );

    } catch (e) {
      setError(e.message);
    }
  };

  // Delete parking location
  const removeLocation = async (l) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${l.name}" parking area?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(l._id);
    setError('');

    try {
      await api(`/admin/locations/${l._id}`, {
        method: 'DELETE'
      });

      // Remove deleted location from UI
      setRows(prev =>
        prev.filter(item => item._id !== l._id)
      );

      // Close edit modal if deleted location was being edited
      if (edit === l._id) {
        setOpen(false);
        setEdit(null);
      }

    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      {/* Page Header */}
      <div className="dash-page-heading">
        <div>
          <div className="section-kicker">
            PROPERTY MANAGEMENT
          </div>

          <h1>Parking locations</h1>

          <p>
            Manage your venues, amenities and pricing in one place.
          </p>
        </div>

        <button
          className="btn btn-primary btn-sm"
          onClick={startNew}
        >
          <Plus size={18} />
          Add location
        </button>
      </div>

      <ErrorBanner
        message={error}
        onClose={() => setError('')}
      />

      {/* Parking Locations */}
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <ParkingSquare size={42} />

          <h3>No parking locations found</h3>

          <p>
            Add your first parking area to get started.
          </p>

          <button
            className="btn btn-primary"
            onClick={startNew}
          >
            <Plus size={18} />
            Add parking area
          </button>
        </div>
      ) : (
        <div className="admin-cards-grid">
          {rows.map(l => (
            <div
              key={l._id}
              className="admin-location-card"
            >
              <div
                className={`admin-location-banner banner-${l.cover}`}
              >
                <ParkingSquare size={42} />
                <span>{l.kind}</span>
              </div>

              <div className="admin-location-body">
                <div className="admin-location-head">
                  <h3>{l.name}</h3>

                  <Status
                    value={
                      l.isOpen
                        ? 'available'
                        : 'maintenance'
                    }
                  />
                </div>

                <p>
                  <MapPin size={15} />
                  {l.area}, {l.city}
                </p>

                <div className="admin-location-price">
                  Car rate
                  <b>
                    {formatMoney(l.prices?.car)}/hr
                  </b>
                </div>

                {/* Action Buttons */}
                <div className="card-button-row">

                  {/* Edit */}
                  <button
                    className="btn btn-soft btn-sm"
                    onClick={() => startEdit(l)}
                    disabled={deleting === l._id}
                  >
                    <Edit3 size={16} />
                    Edit
                  </button>

                  {/* Open / Close */}
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => toggle(l)}
                    disabled={deleting === l._id}
                  >
                    {l.isOpen
                      ? 'Close venue'
                      : 'Open venue'}
                  </button>

                  {/* Delete */}
                  <button
                    className="btn btn-outline btn-sm"
                    style={{
                      color: '#dc2626',
                      borderColor: '#dc2626'
                    }}
                    onClick={() => removeLocation(l)}
                    disabled={deleting === l._id}
                  >
                    <Trash2 size={16} />

                    {deleting === l._id
                      ? 'Deleting...'
                      : 'Delete'}
                  </button>

                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {open && (
        <div
          className="modal-backdrop"
          onClick={() => setOpen(false)}
        >
          <div
            className="form-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Parking location"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2>
                  {edit
                    ? 'Edit parking location'
                    : 'Add parking location'}
                </h2>

                <p>
                  These details appear to your customers.
                </p>
              </div>

              <button
                className="icon-btn"
                onClick={() => setOpen(false)}
              >
                <X />
              </button>
            </div>

            <form onSubmit={save}>
              <div className="modal-fields">

                <label className="field">
                  Parking name

                  <input
                    required
                    minLength={3}
                    value={form.name}
                    onChange={e =>
                      setForm({
                        ...form,
                        name: e.target.value
                      })
                    }
                  />
                </label>

                <div className="form-grid">
                  <label className="field">
                    City

                    <input
                      required
                      value={form.city}
                      onChange={e =>
                        setForm({
                          ...form,
                          city: e.target.value
                        })
                      }
                    />
                  </label>

                  <label className="field">
                    Area

                    <input
                      required
                      value={form.area}
                      onChange={e =>
                        setForm({
                          ...form,
                          area: e.target.value
                        })
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  Full address

                  <textarea
                    required
                    rows={2}
                    value={form.address}
                    onChange={e =>
                      setForm({
                        ...form,
                        address: e.target.value
                      })
                    }
                  />
                </label>

                <div className="form-grid">
                  <label className="field">
                    Venue type

                    <select
                      value={form.kind}
                      onChange={e =>
                        setForm({
                          ...form,
                          kind: e.target.value
                        })
                      }
                    >
                      {[
                        'public',
                        'mall',
                        'airport',
                        'office',
                        'station'
                      ].map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    Branding color

                    <select
                      value={form.cover}
                      onChange={e =>
                        setForm({
                          ...form,
                          cover: e.target.value
                        })
                      }
                    >
                      {[
                        'violet',
                        'blue',
                        'mint',
                        'orange',
                        'pink'
                      ].map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    Latitude

                    <input
                      type="number"
                      step="any"
                      value={form.lat}
                      onChange={e =>
                        setForm({
                          ...form,
                          lat: Number(e.target.value)
                        })
                      }
                    />
                  </label>

                  <label className="field">
                    Longitude

                    <input
                      type="number"
                      step="any"
                      value={form.lng}
                      onChange={e =>
                        setForm({
                          ...form,
                          lng: Number(e.target.value)
                        })
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  Amenities (comma separated)

                  <input
                    value={form.features.join(', ')}
                    onChange={e =>
                      setForm({
                        ...form,
                        features: e.target.value
                          .split(',')
                          .map(s => s.trim())
                          .filter(Boolean)
                      })
                    }
                  />
                </label>

                <div className="modal-section-title">
                  Hourly rates (₹)
                </div>

                <div className="form-grid form-grid-4">
                  {[
                    'car',
                    'bike',
                    'ev',
                    'accessible'
                  ].map(k => (
                    <label className="field" key={k}>
                      {k}

                      <input
                        type="number"
                        min="0"
                        max="10000"
                        required
                        value={form.prices?.[k] ?? 0}
                        onChange={e =>
                          setForm({
                            ...form,
                            prices: {
                              ...form.prices,
                              [k]: Number(e.target.value)
                            }
                          })
                        }
                      />
                    </label>
                  ))}
                </div>

                <div className="modal-section-title">
                  Dynamic pricing settings
                </div>

                <div className="form-grid form-grid-4">
                  {[
                    ['weekendMultiplier', 'Weekend ×'],
                    ['peakMultiplier', 'Peak ×'],
                    ['peakStart', 'Peak start (IST)'],
                    ['peakEnd', 'Peak end (IST)']
                  ].map(([k, label]) => (
                    <label className="field" key={k}>
                      {label}

                      <input
                        type="number"
                        step={
                          k.includes('Multiplier')
                            ? '0.05'
                            : '1'
                        }
                        min={
                          k.includes('Multiplier')
                            ? '1'
                            : '0'
                        }
                        max={
                          k.includes('Multiplier')
                            ? '5'
                            : '24'
                        }
                        value={form[k]}
                        onChange={e =>
                          setForm({
                            ...form,
                            [k]: Number(e.target.value)
                          })
                        }
                      />
                    </label>
                  ))}
                </div>

              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving...'
                    : 'Save location'}

                  <Save size={17} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
