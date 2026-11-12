const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { z } = require('zod');
const { Booking, Slot, Location } = require('../models');
const { optionalAuth } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../lib/errors');
const { parseWindow, priceFor, eligible } = require('../lib/pricing');
const { randomCode, releaseReservation } = require('../services/bookings');
const { emitLocation, emitBooking, notify } = require('../services/notify');

router.use(optionalAuth);

const toPublic = b => {
  const v = b.toObject ? b.toObject() : b;
  return { ...v, qrToken: b.qrToken || v.qrToken };
};

router.get('/', asyncHandler(async (req, res) => {
  const { code, vehicleNumber, ids } = req.query;
  const filter = {};

  if (code) {
    filter.code = String(code).trim().toUpperCase();
  } else if (vehicleNumber) {
    const cleanPlate = String(vehicleNumber).trim().toUpperCase().replace(/\s+/g, '');
    filter.vehicleNumber = cleanPlate;
  } else if (ids) {
    const idList = String(ids).split(',').map(s => s.trim()).filter(id => mongoose.isValidObjectId(id));
    if (idList.length) filter._id = { $in: idList };
    else return res.json([]);
  } else if (req.user) {
    filter.user = req.user.id;
  } else {
    return res.json([]);
  }

  const rows = await Booking.find(filter)
    .select('+qrToken')
    .populate('location', 'name city address prices')
    .populate('slot', 'number floor kind')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  let b;
  if (mongoose.isValidObjectId(req.params.id)) {
    b = await Booking.findById(req.params.id)
      .select('+qrToken')
      .populate('location', 'name city address prices')
      .populate('slot', 'number floor kind');
  }
  if (!b) {
    b = await Booking.findOne({ code: req.params.id.trim().toUpperCase() })
      .select('+qrToken')
      .populate('location', 'name city address prices')
      .populate('slot', 'number floor kind');
  }
  if (!b) throw new ApiError(404, 'Booking not found');
  res.json(toPublic(b));
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = z.object({
    slotId: z.string(),
    startAt: z.string(),
    endAt: z.string(),
    vehicleType: z.enum(['car', 'bike', 'ev', 'accessible']),
    vehicleNumber: z.string().trim().min(3).max(20),
    paymentMethod: z.enum(['online', 'counter']),
    guestName: z.string().trim().max(90).optional().or(z.literal('')),
    guestPhone: z.string().trim().max(25).optional().or(z.literal(''))
  }).parse(req.body);

  if (parsed.paymentMethod === 'online' && !((process.env.NODE_ENV !== 'production' && process.env.DEMO_PAYMENTS === 'true') || (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET))) {
    throw new ApiError(503, 'Online payment is not configured. Please use Pay at Gate.');
  }

  const { start, end } = parseWindow(parsed.startAt, parsed.endAt);
  const slot = await Slot.findById(parsed.slotId);
  if (!slot) throw new ApiError(404, 'Parking slot not found');

  const loc = await Location.findById(slot.location);
  if (!loc?.isOpen || slot.state === 'maintenance') throw new ApiError(400, 'Parking slot is unavailable');
  if (start.getTime() <= Date.now() + 5 * 60 * 1000 && slot.state === 'occupied') throw new ApiError(409, 'Slot is physically occupied');

  const price = priceFor(loc, slot.kind, start, end);
  const _id = new mongoose.Types.ObjectId();

  // Atomic reservation check
  const updated = await Slot.updateOne(
    {
      _id: slot.id,
      state: { $ne: 'maintenance' },
      reservations: { $not: { $elemMatch: { startAt: { $lt: end }, endAt: { $gt: start }, state: 'active' } } }
    },
    { $push: { reservations: { bookingId: _id, startAt: start, endAt: end, state: 'active' } } }
  );

  if (!updated.modifiedCount) throw new ApiError(409, 'This slot was just reserved. Please select another.');

  let booking;
  try {
    booking = await Booking.create({
      _id,
      code: randomCode(),
      qrToken: crypto.randomBytes(32).toString('hex'),
      user: req.user ? req.user.id : null,
      guestName: parsed.guestName || (req.user ? req.user.name : ''),
      guestPhone: parsed.guestPhone || (req.user ? req.user.phone : ''),
      location: loc.id,
      slot: slot.id,
      vehicleType: parsed.vehicleType,
      vehicleNumber: parsed.vehicleNumber.toUpperCase().replace(/\s+/g, ''),
      startAt: start,
      endAt: end,
      amount: price.total,
      pricingBreakdown: price,
      payment: { method: parsed.paymentMethod, status: 'unpaid' },
      status: parsed.paymentMethod === 'online' ? 'pending_payment' : 'confirmed',
      holdUntil: parsed.paymentMethod === 'online' ? new Date(Date.now() + 10 * 60 * 1000) : undefined
    });
  } catch (e) {
    await Slot.updateOne({ _id: slot.id }, { $pull: { reservations: { bookingId: _id } } });
    throw e;
  }

  emitLocation(loc.id);
  emitBooking(booking);

  if (req.user) {
    await notify(
      req.user.id,
      'Slot reserved',
      `Booking ${booking.code} created${booking.status === 'pending_payment' ? '. Please pay within 10 minutes.' : '. Pay at the gate.'}`,
      booking.id
    ).catch(console.error);
  }

  res.status(201).json(toPublic(booking));
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  let b;
  if (mongoose.isValidObjectId(req.params.id)) {
    b = await Booking.findById(req.params.id);
  }
  if (!b) {
    b = await Booking.findOne({ code: req.params.id.trim().toUpperCase() });
  }
  if (!b) throw new ApiError(404, 'Booking not found');
  if (!['confirmed', 'pending_payment'].includes(b.status)) throw new ApiError(400, 'This booking cannot be cancelled');
  if (b.payment?.status === 'paid') throw new ApiError(400, 'Paid bookings require a refund workflow; contact the operator.');

  b.status = 'cancelled';
  await b.save();
  await releaseReservation(b);

  if (b.user) {
    await notify(b.user, 'Booking cancelled', `Booking ${b.code} was cancelled.`, b.id).catch(console.error);
  }

  res.json({ success: true });
}));

module.exports = router;
