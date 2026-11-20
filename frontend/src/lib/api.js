
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ==================== AUTH TOKEN STORE ====================

export const store = {
  getToken: () => localStorage.getItem('parkease_token'),

  setToken: token =>
    token
      ? localStorage.setItem('parkease_token', token)
      : localStorage.removeItem('parkease_token')
};


// ==================== GUEST BOOKING STORE ====================

export const guestStore = {
  getIds: () => {
    try {
      const ids = JSON.parse(
        localStorage.getItem('parkease_guest_bookings') || '[]'
      );

      return Array.isArray(ids) ? ids : [];
    } catch {
      return [];
    }
  },

  addId: id => {
    if (!id) return;

    const current = guestStore.getIds();

    if (!current.includes(id)) {
      current.unshift(id);

      localStorage.setItem(
        'parkease_guest_bookings',
        JSON.stringify(current.slice(0, 50))
      );
    }
  }
};


// ==================== API REQUEST HANDLER ====================

export async function api(
  path,
  {
    method = 'GET',
    body,
    headers = {},
    signal
  } = {}
) {
  let res;

  try {
    const token = store.getToken();

    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      signal,

      headers: {
        ...(body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),

        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),

        ...headers
      },

      ...(body !== undefined
        ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
        : {})
    });

  } catch (err) {
    if (err?.name === 'AbortError') {
      throw err;
    }

    throw new Error(
      'Cannot reach ParkEase API. Please check that the backend is running.'
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${res.status})`
    );
  }

  return data;
}


// ==================== FORMAT HELPERS ====================

export function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value ?? 0);
}

export function formatDate(value, options) {
  if (!value) return '—';

  return new Date(value).toLocaleString(
    'en-IN',
    options || {
      dateStyle: 'medium',
      timeStyle: 'short'
    }
  );
}

export function dateTimeInput(date) {
  const dt = new Date(date);

  return new Date(
    dt.getTime() - dt.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 16);
}

export const clampVehicle = value => ({
  car: 'Car',
  bike: 'Bike',
  ev: 'Electric vehicle'
}[value] || value);

export function locationImageClass(cover) {
  return `location-art art-${
    ['violet', 'blue', 'mint', 'orange', 'pink'].includes(cover)
      ? cover
      : 'violet'
  }`;
}


// ==================== CITY SELECTION STORE ====================

export const cityStore = {
  get: () => localStorage.getItem('parkease_city') || '',

  set: city =>
    city
      ? localStorage.setItem('parkease_city', city)
      : localStorage.removeItem('parkease_city')
};
