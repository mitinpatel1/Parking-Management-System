const { ApiError } = require('./errors');
const HOUR = 60 * 60 * 1000;
const HALF_HOUR = 30 * 60 * 1000;
const INDIA_OFFSET_MS = 330 * 60 * 1000;
const vehicleSlotKinds = { car: ['car'], bike: ['bike'], ev: ['ev'], accessible: ['accessible'] };
function parseWindow(startAt, endAt, { allowPast = false } = {}) {
  const start = new Date(startAt), end = new Date(endAt);
  if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf())) throw new ApiError(400, 'Invalid start or end date');
  const now = Date.now();
  if (!allowPast && start.getTime() < now - 3 * HOUR) throw new ApiError(400, 'Start time cannot be more than 3 hours in the past');
  if (!allowPast && start.getTime() > now + 30 * 24 * HOUR) throw new ApiError(400, 'Bookings are available up to 30 days ahead');
  if (end <= start || end - start > 7 * 24 * HOUR) throw new ApiError(400, 'Choose a duration between 1 minute and 7 days');
  return { start, end };
}
function priceFor(location, slotKind, start, end) {
  const baseRate = location.prices?.[slotKind] ?? 40;
  if (!Number.isFinite(baseRate) || baseRate < 0) throw new ApiError(400, 'Invalid parking price');
  let total = 0, segments = 0;
  const effectiveEnd = Math.max(end.getTime(), start.getTime() + HOUR);
  for (let t = start.getTime(); t < effectiveEnd;) {
    // Demo venues are in India. Evaluate weekend/peak against Asia/Kolkata local time.
    // 30-minute boundaries preserve exact Indian hourly price transitions.
    const local = new Date(t + INDIA_OFFSET_MS);
    const next = Math.min(effectiveEnd, (Math.floor(t / HALF_HOUR) + 1) * HALF_HOUR);
    const hour = local.getUTCHours();
    const weekend = local.getUTCDay() === 0 || local.getUTCDay() === 6;
    const peak = hour >= location.peakStart && hour < location.peakEnd;
    total += baseRate * (next - t) / HOUR * (weekend ? location.weekendMultiplier : 1) * (peak ? location.peakMultiplier : 1);
    segments++;
    t = next;
  }
  return { total: Math.ceil(total), baseRate, hours: Number(((effectiveEnd - start.getTime()) / HOUR).toFixed(2)), segments };
}
function eligible(vehicleType, slotKind) { return Boolean(vehicleSlotKinds[vehicleType]?.includes(slotKind)); }
module.exports = { parseWindow, priceFor, eligible, vehicleSlotKinds };
