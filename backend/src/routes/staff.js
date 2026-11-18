const router = require('express').Router();
const { z } = require('zod');
const { Booking, Slot } = require('../models');
const { auth, roles } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../lib/errors');
const { priceFor } = require('../lib/pricing');
const { releaseReservation } = require('../services/bookings');
const { emitLocation, emitBooking, notify } = require('../services/notify');
router.use(auth, roles('staff', 'admin'));
const populate = b => b.populate([{ path: 'location', select: 'name city address prices weekendMultiplier peakMultiplier peakStart peakEnd' }, { path: 'slot', select: 'number floor kind' }, { path: 'user', select: 'name email' }]);
router.get('/lookup', asyncHandler(async (req, res) => {
  const query = String(req.query.code || '').trim();
  if (query.length < 5 || query.length > 100) throw new ApiError(400, 'Enter a booking code, QR token or plate number');
  const q = query.toUpperCase().replace(/\s/g, '');
  const b = await Booking.findOne({ $or: [{ code: q }, { qrToken: query }, { vehicleNumber: q }] }).sort({ createdAt: -1 }).select('+qrToken');
  if (!b) throw new ApiError(404, 'No booking found');
  await populate(b); res.json(b);
}));
router.get('/active', asyncHandler(async (req, res) => {
  res.json(await Booking.find({ status: { $in: ['confirmed', 'checked_in', 'payment_due'] } }).populate('location', 'name city').populate('slot', 'number floor kind').populate('user', 'name email').sort({ startAt: 1 }).limit(100).lean());
}));
router.post('/:id/check-in', asyncHandler(async (req, res) => {
  const b = await Booking.findById(req.params.id);
  if (!b || b.status !== 'confirmed') throw new ApiError(400, 'Booking is not ready for entry');
  if (b.startAt.getTime() - Date.now() > 30 * 60 * 1000) throw new ApiError(400, 'Entry opens 30 minutes before the booking start');
  if (Date.now() > b.startAt.getTime() + 20 * 60 * 1000) throw new ApiError(410, 'The no-show grace period has ended');
  if (b.payment.method === 'online' && b.payment.status !== 'paid') throw new ApiError(400, 'Online booking has not been paid');
  const slot = await Slot.findById(b.slot);
  if (!slot || slot.state === 'maintenance' || slot.state === 'occupied') throw new ApiError(409, 'Slot is not physically available');
  b.status = 'checked_in'; b.checkedInAt = new Date(); await b.save();
  slot.state = 'occupied'; await slot.save(); emitLocation(b.location); emitBooking(b);
  await notify(b.user, 'Vehicle checked in', `${b.vehicleNumber} entered slot ${slot.number}.`, b.id).catch(console.error);
  res.json({ success: true });
}));
router.post('/:id/check-out', asyncHandler(async (req, res) => {
  const b = await Booking.findById(req.params.id);
  if (!b || b.status !== 'checked_in') throw new ApiError(400, 'Vehicle is not checked in');
  const slot = await Slot.findById(b.slot); if (!slot) throw new ApiError(404, 'Slot not found');
  b.checkedOutAt = new Date();
  const loc = await require('../models').Location.findById(b.location);
  const actual = priceFor(loc, slot.kind, b.checkedInAt || b.startAt, b.checkedOutAt);
  b.extraDue = Math.max(0, actual.total - b.amount);
  b.status = (b.payment.status === 'paid' && b.extraDue === 0) ? 'completed' : 'payment_due';
  await b.save();
  if (slot.state === 'occupied') { slot.state = 'available'; await slot.save(); }
  await releaseReservation(b);
  await notify(b.user, b.status === 'completed' ? 'Checkout complete' : 'Payment due at exit', b.status === 'completed' ? `${b.code} checkout is complete.` : `Please settle ₹${b.payment.status === 'paid' ? b.extraDue : b.amount + b.extraDue} at the counter.`, b.id).catch(console.error);
  res.json({ success: true, status: b.status, due: (b.payment.status === 'paid' ? 0 : b.amount) + b.extraDue });
}));
router.post('/:id/settle', asyncHandler(async (req, res) => {
  const { reference = '' } = z.object({ reference: z.string().max(90).optional() }).parse(req.body);
  const b = await Booking.findById(req.params.id);
  if (!b || b.status !== 'payment_due') throw new ApiError(400, 'Booking has no due balance at exit');
  b.payment.status = 'paid'; b.payment.paidAt = new Date(); b.payment.reference = reference.trim() || `COUNTER-${Date.now()}`;
  b.extraPaid = b.extraDue; b.extraDue = 0; b.status = 'completed'; await b.save(); emitBooking(b);
  await notify(b.user, 'Payment settled', `Parking visit ${b.code} is complete.`, b.id).catch(console.error);
  await populate(b);
  res.json({ success: true, booking: b });
}));
router.post('/:id/record-cash', asyncHandler(async (req, res) => {
  const { reference = '' } = z.object({ reference: z.string().max(90).optional() }).parse(req.body);
  const b = await Booking.findById(req.params.id);
  if (!b) throw new ApiError(404, 'Booking not found');
  if (b.payment?.status === 'paid' && b.status !== 'payment_due') {
    throw new ApiError(400, 'Booking is already paid');
  }
  b.payment.status = 'paid';
  b.payment.method = 'counter';
  b.payment.paidAt = new Date();
  b.payment.reference = reference.trim() || `CASH-${Date.now()}`;
  if (b.status === 'pending_payment') {
    b.status = 'confirmed';
    b.holdUntil = undefined;
  }
  if (b.status === 'payment_due') {
    b.extraPaid = b.extraDue;
    b.extraDue = 0;
    b.status = 'completed';
  }
  await b.save();
  emitBooking(b);
  await notify(b.user, 'Cash payment received', `Cash payment recorded for booking ${b.code}.`, b.id).catch(console.error);
  await populate(b);
  res.json({ success: true, booking: b });
}));
module.exports = router;
