const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const { Booking } = require('../models');
const { optionalAuth } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../lib/errors');
const { confirmBooking } = require('../services/bookings');

router.use(optionalAuth);

const demoAllowed = () => process.env.NODE_ENV !== 'production' && process.env.DEMO_PAYMENTS === 'true';

const findBooking = async idOrCode => {
  if (mongoose.isValidObjectId(idOrCode)) {
    const b = await Booking.findById(idOrCode);
    if (b) return b;
  }
  return await Booking.findOne({ code: String(idOrCode).trim().toUpperCase() });
};

router.get('/config', (req, res) => {
  res.json({
    demo: demoAllowed(),
    online: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    keyId: process.env.RAZORPAY_KEY_ID || null
  });
});

router.post('/:bookingId/order', asyncHandler(async (req, res) => {
  const b = await findBooking(req.params.bookingId);
  if (!b || b.payment?.status === 'paid' || ['cancelled', 'expired', 'completed'].includes(b.status)) {
    throw new ApiError(400, 'This booking cannot be paid online');
  }
  if (b.holdUntil && b.holdUntil < new Date() && b.status === 'pending_payment') {
    throw new ApiError(409, 'Payment hold expired');
  }
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(503, 'Online gateway is not configured. Use demo pay in development or choose Pay at Gate.');
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
  await confirmBooking(b, razorpay_payment_id);
  res.json({ success: true });
}));

router.post('/:bookingId/demo', asyncHandler(async (req, res) => {
  if (!demoAllowed()) {
    throw new ApiError(403, 'Demo payments are disabled');
  }
  const b = await findBooking(req.params.bookingId);
  if (!b) throw new ApiError(404, 'Booking not found');

  await confirmBooking(b, `DEMO-${Date.now()}`);
  res.json({ success: true, demo: true });
}));

module.exports = router;
