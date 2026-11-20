
const crypto = require('crypto');

const { Slot, Booking } = require('../models');
const { emitLocation, emitBooking, notify } = require('./notify');
const { ApiError } = require('../lib/errors');

const randomCode = () =>
  `PK-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;


// ==================== SAFE BOOKING RESPONSE ====================

function safeBookingForEmit(booking) {
  const value = booking?.toObject
    ? booking.toObject()
    : booking;

  if (!value) return null;

  const result = { ...value };
  const token = result.qrToken;

  // Never expose the Gate QR token by default.
  delete result.qrToken;

  // Gate QR is exposed once Admin issues it or payment is completed.
  if (
    (result.payment?.gateQrIssuedAt || result.payment?.status === 'paid') &&
    token
  ) {
    result.qrToken = token;
  }

  return result;
}


// ==================== RELEASE SLOT RESERVATION ====================

async function releaseReservation(booking) {
  if (!booking?.slot) return;

  await Slot.updateOne(
    { _id: booking.slot },
    {
      $pull: {
        reservations: {
          bookingId: booking._id
        }
      }
    }
  );

  emitLocation(booking.location);
  emitBooking(safeBookingForEmit(booking));
}


// ==================== CONFIRM BOOKING PAYMENT ====================

async function confirmBooking(booking, reference = '') {
  if (!booking) {
    throw new ApiError(404, 'Booking not found');
  }

  reference = String(reference || '').trim();

  // Every online or counter UPI payment must have a
  // verified payment reference before confirmation.
  if (!reference) {
    throw new ApiError(
      400,
      'Verified payment reference is required'
    );
  }

  // Already paid: only allow the same transaction again.
  if (booking.payment?.status === 'paid') {
    const samePayment =
      booking.payment.reference === reference ||
      booking.payment.gatewayPaymentId === reference;

    if (samePayment) {
      return booking;
    }

    throw new ApiError(
      409,
      'Booking is already paid with a different transaction'
    );
  }

  const now = new Date();

  // Only active bookings can be confirmed.
  const filter = {
    _id: booking._id,

    'payment.status': {
      $ne: 'paid'
    },

    status: {
      $in: [
        'pending_payment',
        'confirmed'
      ]
    },

    $or: [
      {
        status: 'confirmed'
      },
      {
        status: 'pending_payment',
        holdUntil: { $exists: false }
      },
      {
        status: 'pending_payment',
        holdUntil: null
      },
      {
        status: 'pending_payment',
        holdUntil: { $gte: now }
      }
    ]
  };

  const setFields = {
    status: 'confirmed',
    'payment.status': 'paid',
    'payment.paidAt': now,
    'payment.reference': reference,
    'payment.gatewayPaymentId': reference,
    'payment.gateQrIssuedAt': now
  };

  const updatedBooking = await Booking.findOneAndUpdate(
    filter,
    {
      $set: setFields,

      $unset: {
        holdUntil: 1
      }
    },
    {
      new: true,
      runValidators: true
    }
  ).select('+qrToken');

  if (!updatedBooking) {
    // Another webhook or request may have processed payment.
    const latestBooking = await Booking.findById(
      booking._id
    ).select('+qrToken');

    if (
      latestBooking?.payment?.status === 'paid' &&
      (
        latestBooking.payment.reference === reference ||
        latestBooking.payment.gatewayPaymentId === reference
      )
    ) {
      return latestBooking;
    }

    if (latestBooking?.payment?.status === 'paid') {
      throw new ApiError(
        409,
        'Booking is already paid'
      );
    }

    if (
      latestBooking &&
      [
        'expired',
        'cancelled',
        'completed'
      ].includes(latestBooking.status)
    ) {
      throw new ApiError(
        409,
        'Booking is no longer active. Payment cannot be applied to this booking.'
      );
    }

    throw new ApiError(
      409,
      'Booking cannot be confirmed. Its payment hold may have expired. Please refresh.'
    );
  }

  // Notify only after successful payment confirmation.
  if (updatedBooking.user) {
    await notify(
      updatedBooking.user,
      'Payment received',
      `Payment received for booking ${updatedBooking.code}.`,
      updatedBooking._id
    ).catch(console.error);
  }

  // Gate QR is NOT issued here.
  // Admin must issue the Gate Entry QR separately.
  emitBooking(safeBookingForEmit(updatedBooking));

  return updatedBooking;
}


// ==================== AUTOMATIC BOOKING EXPIRY ====================

async function cancelExpired() {
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const cutoffConfirmed = new Date(now.getTime() - 20 * 60 * 1000);

  const overdue = await Booking.find({
    $or: [
      // 1. Pending payment whose hold window has elapsed (10m for online, 24h for cash requests)
      {
        status: 'pending_payment',
        'payment.status': { $ne: 'paid' },
        holdUntil: {
          $ne: null,
          $lt: now
        }
      },
      // 2. Counter/cash requests older than 24 hours (covers any counter booking where cashRequestAt or createdAt is older than 24h)
      {
        'payment.method': 'counter',
        'payment.status': { $ne: 'paid' },
        status: { $in: ['pending_payment', 'confirmed'] },
        $or: [
          { 'payment.cashRequestAt': { $ne: null, $lt: cutoff24h } },
          { createdAt: { $lt: cutoff24h } }
        ]
      },
      // 3. Confirmed paid booking overdue past cutoff
      {
        status: 'confirmed',
        'payment.status': 'paid',
        startAt: { $lt: cutoffConfirmed }
      }
    ]
  }).limit(150);

  for (const booking of overdue) {
    const isCounterPayment =
      booking.payment?.method === 'counter' &&
      booking.payment?.status !== 'paid';

    const conditions = {
      _id: booking._id,
      status: booking.status,
      'payment.status': booking.payment?.status
    };

    // Atomic expiry prevents overwriting a concurrent payment.
    const expiredBooking = await Booking.findOneAndUpdate(
      conditions,
      {
        $set: {
          status: 'expired',
          ...(isCounterPayment ? { 'payment.status': 'unpaid' } : {})
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

    if (!expiredBooking) continue;

    await releaseReservation(expiredBooking);

    if (expiredBooking.user) {
      const msg = isCounterPayment
        ? `Cash payment request for booking ${expiredBooking.code} expired after 24 hours. The reserved slot has been released.`
        : `Booking ${expiredBooking.code} expired. Its slot was released.`;

      await notify(
        expiredBooking.user,
        'Booking expired',
        msg,
        expiredBooking._id
      ).catch(console.error);
    }
  }
}


// ==================== EXPORT ====================

module.exports = {
  randomCode,
  safeBookingForEmit,
  releaseReservation,
  confirmBooking,
  cancelExpired
};
