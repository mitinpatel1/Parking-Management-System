export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const store = {
  getToken: () => localStorage.getItem('parkease_token'),
  setToken: token => token ? localStorage.setItem('parkease_token', token) : localStorage.removeItem('parkease_token')
};
export const guestStore = {
  getIds: () => {
    try {
      return JSON.parse(localStorage.getItem('parkease_guest_bookings') || '[]');
    } catch { return []; }
  },
  addId: (id) => {
    if (!id) return;
    const current = guestStore.getIds();
    if (!current.includes(id)) {
      current.unshift(id);
      localStorage.setItem('parkease_guest_bookings', JSON.stringify(current.slice(0, 50)));
    }
  }
};
export async function api(path, { method = 'GET', body, headers = {}, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method, signal,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(store.getToken() ? { Authorization: `Bearer ${store.getToken()}` } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error('Cannot reach ParkEase API. Please check that the backend is running.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export function formatMoney(v) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v ?? 0); }
export function formatDate(v, options) { if (!v) return '—'; return new Date(v).toLocaleString('en-IN', options || { dateStyle: 'medium', timeStyle: 'short' }); }
export function dateTimeInput(d) { const dt = new Date(d); return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export const clampVehicle = v => ({ car: 'Car', bike: 'Bike', ev: 'Electric vehicle' }[v] || v);
export function locationImageClass(cover) { return `location-art art-${['violet','blue','mint','orange','pink'].includes(cover) ? cover : 'violet'}`; }
