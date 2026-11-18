const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const { Booking } = require('../models');
const { optionalAuth } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../lib/errors');
const { confirmBooking } = require('../services/bookings');

router.use(optionalAuth);

const findBooking = async idOrCode => {
  if (mongoose.isValidObjectId(idOrCode)) {
    const b = await Booking.findById(idOrCode);
    if (b) return b;
  }
  return await Booking.findOne({ code: String(idOrCode).trim().toUpperCase() });
};

// Check gateway availability
router.get('/config', (req, res) => {
  const online = Boolean(
    (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) ||
    process.env.PAYMENT_GATEWAY_CONFIGURED === 'true'
  );
  res.json({
    online,
    keyId: process.env.RAZORPAY_KEY_ID || null
  });
});

// Create payment order
router.post('/:bookingId/order', asyncHandler(async (req, res) => {
  const b = await findBooking(req.params.bookingId);
  if (!b || b.payment?.status === 'paid' || ['cancelled', 'expired', 'completed'].includes(b.status)) {
    throw new ApiError(400, 'This booking cannot be paid online');
  }
  if (b.holdUntil && b.holdUntil < new Date() && b.status === 'pending_payment') {
    throw new ApiError(409, 'Payment hold expired');
  }
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(503, 'Online payment gateway is not configured. Please set up your payment gateway credentials or choose Pay at Gate.');
  }

  const client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  const order = await client.orders.create({
    amount: Math.round(b.amount * 100),
    currency: 'INR',
    receipt: b.code,
    notes: { bookingId: String(b.id) }
  });

  b.payment.gatewayOrderId = order.id;
  await b.save();

  res.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    bookingCode: b.code
  });
}));

// Verify payment and confirm booking
router.post('/:bookingId/verify', asyncHandler(async (req, res) => {
  const b = await findBooking(req.params.bookingId);
  if (!b || b.payment?.status === 'paid' || ['cancelled', 'expired', 'completed'].includes(b.status)) {
    throw new ApiError(400, 'Invalid booking for verification');
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!process.env.RAZORPAY_KEY_SECRET || !b.payment.gatewayOrderId || b.payment.gatewayOrderId !== razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ApiError(400, 'Invalid payment data');
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected.length !== String(razorpay_signature).length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature))) {
    throw new ApiError(400, 'Payment signature verification failed');
  }

  const client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  const payment = await client.payments.fetch(razorpay_payment_id);

  if (payment.order_id !== razorpay_order_id || payment.status !== 'captured' || Number(payment.amount) !== Math.round(b.amount * 100) || payment.currency !== 'INR') {
    throw new ApiError(400, 'Payment has not been captured for this booking');
  }

  b.payment.gatewayPaymentId = razorpay_payment_id;
  // Mark booking as confirmed & paid with payment reference
  const updatedBooking = await confirmBooking(b, razorpay_payment_id);
  res.json({ success: true, booking: updatedBooking });
}));

module.exports = router;
