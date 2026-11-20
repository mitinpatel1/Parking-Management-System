
const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { z } = require('zod');

const { Booking, Slot, Location } = require('../models');
const { optionalAuth } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../lib/errors');
const { parseWindow, priceFor } = require('../lib/pricing');
const { randomCode, releaseReservation } = require('../services/bookings');
const { emitLocation, emitBooking, notify } = require('../services/notify');

router.use(optionalAuth);

// Convert booking into a safe public response.
// Gate QR is visible only after Admin issues it.
const toPublic = booking => {
  const value = booking?.toObject
    ? booking.toObject()
    : booking;

  if (!value) return null;

  const result = { ...value };
  const gateQrToken = result.qrToken;

  delete result.qrToken;

  if (
    (result.payment?.gateQrIssuedAt || result.payment?.status === 'paid') &&
    gateQrToken
  ) {
    result.qrToken = gateQrToken;
  }

  return result;
};

// Find booking by MongoDB ID or booking code.
const findBooking = async idOrCode => {
  const value = String(idOrCode || '').trim();

  if (!value) return null;

  if (mongoose.isValidObjectId(value)) {
    const booking = await Booking.findById(value)
      .select('+qrToken');

    if (booking) return booking;
  }

  return Booking.findOne({
    code: value.toUpperCase()
  }).select('+qrToken');
};

// Check booking ownership / guest access.
const canAccessBooking = (booking, req) => {
  if (!booking) return false;

  if (booking.user) {
    return Boolean(
      req.user &&
      String(booking.user) === String(req.user.id)
    );
  }

  const suppliedCode = String(
    req.query.code ||
    req.body?.code ||
    ''
  ).trim().toUpperCase();

  return Boolean(
    suppliedCode &&
    suppliedCode === String(booking.code).toUpperCase()
  );
};

// Get bookings.
router.get('/', asyncHandler(async (req, res) => {
  const { code, vehicleNumber, ids } = req.query;
  const filter = {};

  if (code) {
    filter.code = String(code).trim().toUpperCase();

    // Authenticated users can only access their own bookings.
    // Guest code lookup is allowed here; for production,
    // add phone/OTP verification as an additional check.
    if (req.user) {
      filter.user = req.user.id;
    } else {
      filter.user = null;
    }
  } else if (vehicleNumber) {
    if (!req.user) {
      throw new ApiError(
        401,
        'Login is required to access bookings by vehicle number.'
      );
    }

    filter.vehicleNumber = String(vehicleNumber)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    filter.user = req.user.id;
  } else if (ids) {
    const idList = String(ids)
      .split(',')
      .map(id => id.trim())
      .filter(id => mongoose.isValidObjectId(id));

    if (!idList.length) {
      return res.json([]);
    }

    filter._id = { $in: idList };

    if (req.user) {
      filter.user = req.user.id;
    } else {
      // Guest IDs are not sufficient authorization on their own
      // for authenticated bookings. Restrict to guest records.
      filter.user = null;
    }
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

  res.json(rows.map(toPublic));
}));

// Get single booking.
router.get('/:id', asyncHandler(async (req, res) => {
  const booking = await findBooking(req.params.id);

  if (!booking) {
    throw new ApiError(404, 'Booking not found');
  }

  if (!canAccessBooking(booking, req)) {
    throw new ApiError(
      403,
      'You are not authorized to access this booking.'
    );
  }

  await booking.populate([
    {
      path: 'location',
      select: 'name city address prices'
    },
    {
      path: 'slot',
      select: 'number floor kind'
    }
  ]);

  res.json(toPublic(booking));
}));

// Create booking.
router.post('/', asyncHandler(async (req, res) => {
  const parsed = z.object({
    slotId: z.string().refine(
      value => mongoose.isValidObjectId(value),
      'Invalid parking slot'
    ),

    startAt: z.string(),
    endAt: z.string(),

    vehicleType: z.enum([
      'car',
      'bike',
      'ev',
      'accessible'
    ]),

    vehicleNumber: z.string()
      .trim()
      .min(3)
      .max(20),

    paymentMethod: z.enum([
      'online',
      'counter'
    ]),

    guestName: z.string()
      .trim()
      .max(90)
      .optional()
      .or(z.literal('')),

    guestPhone: z.string()
      .trim()
      .max(25)
      .optional()
      .or(z.literal(''))
  }).parse(req.body);

  const onlineAvailable = Boolean(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  );

  if (
    parsed.paymentMethod === 'online' &&
    !onlineAvailable
  ) {
    throw new ApiError(
      503,
      'Online payment is not configured. Please use Pay at Gate.'
    );
  }

  const { start, end } = parseWindow(
    parsed.startAt,
    parsed.endAt
  );

  const slot = await Slot.findById(parsed.slotId);

  if (!slot) {
    throw new ApiError(404, 'Parking slot not found');
  }

  const location = await Location.findById(slot.location);

  if (!location || !location.isOpen) {
    throw new ApiError(
      400,
      'Parking location is currently closed'
    );
  }

  if (slot.state === 'maintenance') {
    throw new ApiError(
      400,
      'Parking slot is under maintenance'
    );
  }

  const isImmediateBooking =
    start.getTime() <= Date.now() + 5 * 60 * 1000;

  if (
    isImmediateBooking &&
    slot.state === 'occupied'
  ) {
    throw new ApiError(
      409,
      'Slot is physically occupied'
    );
  }

  const price = priceFor(
    location,
    slot.kind,
    start,
    end
  );

  const amountInPaise = Math.round(
    Number(price.total) * 100
  );

  if (
    !Number.isSafeInteger(amountInPaise) ||
    amountInPaise <= 0
  ) {
    throw new ApiError(
      400,
      'Invalid booking amount'
    );
  }

  const bookingId = new mongoose.Types.ObjectId();

  const slotFilter = {
    _id: slot._id,

    state: {
      $ne: 'maintenance'
    },

    reservations: {
      $not: {
        $elemMatch: {
          startAt: { $lt: end },
          endAt: { $gt: start },
          state: 'active'
        }
      }
    }
  };

  if (isImmediateBooking) {
    slotFilter.state = {
      $nin: [
        'maintenance',
        'occupied'
      ]
    };
  }

  const updated = await Slot.updateOne(
    slotFilter,
    {
      $push: {
        reservations: {
          bookingId,
          startAt: start,
          endAt: end,
          state: 'active'
        }
      }
    }
  );

  if (!updated.modifiedCount) {
    throw new ApiError(
      409,
      'This slot is unavailable or was just reserved. Please select another.'
    );
  }

  let booking;

  try {
    const isCounterPayment =
      parsed.paymentMethod === 'counter';

    booking = await Booking.create({
      _id: bookingId,

      code: randomCode(),

      // Token is generated privately.
      // It is never returned until Admin issues Gate QR.
      qrToken: crypto.randomBytes(32).toString('hex'),

      user: req.user
        ? req.user.id
        : null,

      guestName:
        parsed.guestName ||
        (req.user ? req.user.name : ''),

      guestPhone:
        parsed.guestPhone ||
        (req.user ? req.user.phone : ''),

      location: location._id,
      slot: slot._id,

      vehicleType: parsed.vehicleType,

      vehicleNumber: parsed.vehicleNumber
        .toUpperCase()
        .replace(/\s+/g, ''),

      startAt: start,
      endAt: end,

      amount: price.total,
      pricingBreakdown: price,

      payment: {
        method: parsed.paymentMethod,
        status: 'pending',

        ...(isCounterPayment
          ? { cashRequestAt: new Date() }
          : {})
      },

      status: 'pending_payment',

      holdUntil: isCounterPayment
        ? new Date(Date.now() + 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 10 * 60 * 1000)
    });
  } catch (error) {
    await Slot.updateOne(
      { _id: slot._id },
      {
        $pull: {
          reservations: {
            bookingId
          }
        }
      }
    );

    throw error;
  }

  emitLocation(location._id);
  emitBooking(toPublic(booking));

  if (req.user) {
    const message = parsed.paymentMethod === 'online'
      ? `Booking ${booking.code} created. Complete online payment within 10 minutes.`
      : `Counter payment request for booking ${booking.code} sent to Admin (valid for 24 hours).`;

    await notify(
      req.user.id,
      parsed.paymentMethod === 'online'
        ? 'Booking created'
        : 'Payment request sent',
      message,
      booking._id
    ).catch(console.error);
  }

  res.status(201).json(toPublic(booking));
}));

// Cancel booking safely.
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const booking = await findBooking(req.params.id);

  if (!booking) {
    throw new ApiError(404, 'Booking not found');
  }

  if (!canAccessBooking(booking, req)) {
    throw new ApiError(
      403,
      'You are not authorized to cancel this booking.'
    );
  }

  if (booking.payment?.status === 'paid') {
    throw new ApiError(
      400,
      'Paid bookings require a refund workflow. Please contact the operator.'
    );
  }

  if (
    ![
      'confirmed',
      'pending_payment'
    ].includes(booking.status)
  ) {
    throw new ApiError(
      400,
      'This booking cannot be cancelled'
    );
  }

  const cancelledBooking = await Booking.findOneAndUpdate(
    {
      _id: booking._id,

      status: {
        $in: [
          'confirmed',
          'pending_payment'
        ]
      },

      'payment.status': {
        $ne: 'paid'
      }
    },

    {
      $set: {
        status: 'cancelled'
      },

      $unset: {
        holdUntil: 1
      }
    },

    {
      new: true,
      runValidators: true
    }
  ).select('+qrToken');

  if (!cancelledBooking) {
    const latest = await Booking.findById(booking._id);

    if (latest?.payment?.status === 'paid') {
      throw new ApiError(
        409,
        'Payment has already been received. Refund workflow is required.'
      );
    }

    throw new ApiError(
      409,
      'Booking status changed. Please refresh and try again.'
    );
  }

  await releaseReservation(cancelledBooking);

  if (cancelledBooking.user) {
    await notify(
      cancelledBooking.user,
      'Booking cancelled',
      `Booking ${cancelledBooking.code} was cancelled.`,
      cancelledBooking._id
    ).catch(console.error);
  }

  emitBooking(toPublic(cancelledBooking));

  res.json({
    success: true,
    booking: toPublic(cancelledBooking)
  });
}));

// ==========================================
// REQUEST CASH PAYMENT AT GATE
// ==========================================

router.post('/:id/request-cash', asyncHandler(async (req, res) => {
  const booking = await findBooking(req.params.id);

  if (!booking) {
    throw new ApiError(404, 'Booking not found');
  }

  if (!canAccessBooking(booking, req)) {
    throw new ApiError(403, 'You do not have access to this booking');
  }

  if (booking.payment?.status === 'paid') {
    throw new ApiError(400, 'This booking is already paid');
  }

  if (booking.status === 'expired' || booking.status === 'cancelled') {
    throw new ApiError(400, 'This booking is no longer active');
  }

  const now = new Date();
  booking.payment = booking.payment || {};
  booking.payment.method = 'counter';
  booking.payment.cashRequestAt = now;
  booking.payment.status = 'pending';
  // 24 hour automatic hold for cash request
  booking.holdUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (booking.status !== 'checked_in' && booking.status !== 'payment_due') {
    booking.status = 'pending_payment';
  }

  await booking.save();

  if (booking.user) {
    await notify(
      booking.user,
      'Cash Payment Request Sent',
      `Cash payment request for booking ${booking.code} sent to Admin (valid for 24 hours).`,
      booking._id
    ).catch(console.error);
  }

  emitLocation(booking.location);
  emitBooking(toPublic(booking));

  res.json({
    success: true,
    message: 'Cash payment request sent to Admin successfully (valid for 24 hours)',
    booking: toPublic(booking)
  });
}));

module.exports = router;
