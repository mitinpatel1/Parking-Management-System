
const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const https = require('https');
const Razorpay = require('razorpay');

const { Booking } = require('../models');
const { optionalAuth, auth, roles } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../lib/errors');
const { confirmBooking } = require('../services/bookings');
const { emitBooking } = require('../services/notify');

router.use(optionalAuth);

// ==================== RAZORPAY HELPERS ====================

const getRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new ApiError(503, 'Razorpay is not configured');
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
};

// Razorpay REST API helper.
const razorpayRequest = (method, path, body) => {
  return new Promise((resolve, reject) => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return reject(
        new ApiError(503, 'Razorpay is not configured')
      );
    }

    const payload = body ? JSON.stringify(body) : '';

    const authHeader = Buffer
      .from(`${keyId}:${keySecret}`)
      .toString('base64');

    const request = https.request(
      {
        hostname: 'api.razorpay.com',
        path,
        method,
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 20000
      },
      response => {
        let data = '';

        response.setEncoding('utf8');

        response.on('data', chunk => {
          data += chunk;
        });

        response.on('end', () => {
          let result;

          try {
            result = data ? JSON.parse(data) : {};
          } catch {
            return reject(
              new ApiError(502, 'Invalid Razorpay response')
            );
          }

          if (
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            return reject(
              new ApiError(
                response.statusCode === 401 ? 503 : 400,
                result.error?.description ||
                  result.error?.reason ||
                  'Razorpay request failed'
              )
            );
          }

          resolve(result);
        });
      }
    );

    request.on('error', reject);

    request.on('timeout', () => {
      request.destroy(
        new Error('Razorpay request timed out')
      );
    });

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
};

// Find booking by MongoDB ID or booking code.
const findBooking = async idOrCode => {
  if (!idOrCode) return null;

  const value = String(idOrCode).trim();

  if (mongoose.isValidObjectId(value)) {
    const booking = await Booking.findById(value)
      .select('+qrToken');

    if (booking) return booking;
  }

  return Booking.findOne({
    code: value.toUpperCase()
  }).select('+qrToken');
};

// Timing-safe signature comparison.
const safeCompareHex = (value1, value2) => {
  if (
    typeof value1 !== 'string' ||
    typeof value2 !== 'string' ||
    !/^[a-f0-9]+$/i.test(value1) ||
    !/^[a-f0-9]+$/i.test(value2)
  ) {
    return false;
  }

  const a = Buffer.from(value1, 'hex');
  const b = Buffer.from(value2, 'hex');

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
};

// Convert amount into paise.
const getAmountInPaise = amount => {
  const paise = Math.round(Number(amount) * 100);

  if (!Number.isSafeInteger(paise) || paise <= 0) {
    throw new ApiError(400, 'Invalid booking amount');
  }

  return paise;
};

const isTerminal = booking =>
  ['cancelled', 'expired', 'completed'].includes(
    booking.status
  );

// Check booking ownership.
const ensureBookingOwner = (booking, req) => {
  if (booking.user) {
    if (
      !req.user ||
      String(booking.user) !== String(req.user.id)
    ) {
      throw new ApiError(
        403,
        'You are not authorized to access this booking'
      );
    }

    return;
  }

  let bodyCode = req.body?.code;
  if (!bodyCode && typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      bodyCode = parsed?.code;
    } catch {}
  }

  const suppliedCode = String(
    bodyCode ||
    req.query?.code ||
    ''
  ).trim().toUpperCase();

  if (
    !suppliedCode ||
    suppliedCode !== String(booking.code).toUpperCase()
  ) {
    throw new ApiError(
      403,
      'Valid guest booking code is required'
    );
  }
};

// Check payment eligibility.
const ensurePaymentWindow = booking => {
  if (isTerminal(booking)) {
    throw new ApiError(
      400,
      'This booking cannot be paid'
    );
  }

  if (booking.payment?.status === 'paid') {
    throw new ApiError(
      400,
      'This booking is already paid'
    );
  }

  if (
    booking.status === 'pending_payment' &&
    booking.holdUntil &&
    booking.holdUntil < new Date()
  ) {
    throw new ApiError(409, 'Payment hold expired');
  }
};

// Safe public booking response.
const publicBooking = booking => {
  const value = booking?.toObject
    ? booking.toObject()
    : booking;

  if (!value) return null;

  const result = { ...value };
  const token = result.qrToken;

  delete result.qrToken;

  // Gate QR is only available after Admin issues it or payment is completed.
  if (
    (result.payment?.gateQrIssuedAt || result.payment?.status === 'paid') &&
    token
  ) {
    result.qrToken = token;
  }

  return result;
};

// Broadcast booking updates without exposing unissued Gate QR.
const broadcastBooking = booking => {
  emitBooking(publicBooking(booking));
};

// ==================== CREATE UPI QR ====================

const createUpiQr = async booking => {
  const now = Math.floor(Date.now() / 1000);
  const closeBy = now + 15 * 60;

  // If Razorpay credentials exist, attempt to generate official Razorpay UPI QR
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    try {
      const qr = await razorpayRequest(
        'POST',
        '/v1/payments/qr_codes',
        {
          type: 'upi_qr',
          name: `ParkEase ${booking.code}`,
          usage: 'single_use',
          fixed_amount: true,
          payment_amount: getAmountInPaise(booking.amount),
          description: `Parking booking ${booking.code}`,
          close_by: closeBy,

          notes: {
            bookingId: String(booking._id),
            bookingCode: booking.code,
            product: 'ParkEase'
          }
        }
      );

      if (qr?.id && qr?.image_url) {
        booking.payment.qrCodeId = qr.id;
        booking.payment.qrImageUrl = qr.image_url;
        booking.payment.qrShortUrl = qr.short_url || qr.image_url;
        booking.payment.qrExpiresAt = qr.close_by
          ? new Date(qr.close_by * 1000)
          : new Date(Date.now() + 15 * 60 * 1000);
        booking.payment.qrIssuedAt = new Date();
        booking.payment.status = 'pending';
        await booking.save();
        return qr;
      }
    } catch (err) {
      console.warn('Razorpay QR creation unavailable, generating direct UPI payment QR:', err.message);
    }
  }

  // Direct Standard UPI intent QR fallback
  const upiId = process.env.UPI_ID || 'parkease.parking@okaxis';
  const amountStr = Number(booking.amount).toFixed(2);
  const upiIntent = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('ParkEase Parking')}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(`Parking ${booking.code}`)}&tr=${encodeURIComponent(booking.code)}`;

  booking.payment.qrCodeId = `upi_${booking.code}_${Date.now()}`;
  booking.payment.qrImageUrl = '';
  booking.payment.qrShortUrl = upiIntent;
  booking.payment.qrExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  booking.payment.qrIssuedAt = new Date();
  booking.payment.status = 'pending';

  await booking.save();

  return {
    id: booking.payment.qrCodeId,
    image_url: '',
    short_url: upiIntent,
    close_by: closeBy
  };
};

// Return existing active QR if available.
const getExistingQr = booking => {
  const payment = booking.payment || {};

  if (
    payment.qrCodeId &&
    (payment.qrImageUrl || payment.qrShortUrl) &&
    payment.qrExpiresAt &&
    payment.qrExpiresAt > new Date()
  ) {
    return {
      qrId: payment.qrCodeId,
      qrImageUrl: payment.qrImageUrl,
      qrShortUrl: payment.qrShortUrl,
      expiresAt: payment.qrExpiresAt,
      amount: booking.amount,
      bookingCode: booking.code
    };
  }

  return null;
};

// ==================== PAYMENT CONFIG ====================

router.get('/config', (req, res) => {
  const online = Boolean(
    (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) ||
    process.env.UPI_ID ||
    true
  );

  res.json({
    online: true,
    qrEnabled: true,
    upiEnabled: true,
    upiId: process.env.UPI_ID || 'parkease.parking@okaxis',
    keyId: process.env.RAZORPAY_KEY_ID || null
  });
});

// ==================== CUSTOMER ONLINE QR ====================

router.post(
  '/:bookingId/qr',
  asyncHandler(async (req, res) => {
    const booking = await findBooking(req.params.bookingId);

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    ensureBookingOwner(booking, req);

    if (booking.payment?.status === 'paid') {
      return res.json({
        success: true,
        alreadyPaid: true,
        booking: publicBooking(booking)
      });
    }

    if (booking.payment?.method !== 'online') {
      booking.payment = booking.payment || {};
      booking.payment.method = 'online';
      await booking.save();
    }

    ensurePaymentWindow(booking);

    const existing = getExistingQr(booking);

    if (existing) {
      return res.json({
        success: true,
        ...existing
      });
    }

    const qr = await createUpiQr(booking);

    broadcastBooking(booking);

    res.json({
      success: true,
      qrId: qr.id,
      qrImageUrl: qr.image_url,
      qrShortUrl: qr.short_url || qr.image_url,
      expiresAt: booking.payment.qrExpiresAt,
      amount: booking.amount,
      bookingCode: booking.code
    });
  })
);

// ==================== ADMIN COUNTER PAYMENT QR ====================

router.post(
  '/:bookingId/counter-qr',
  auth,
  roles('admin'),
  asyncHandler(async (req, res) => {
    const booking = await findBooking(req.params.bookingId);

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    if (booking.payment?.method !== 'counter') {
      throw new ApiError(
        400,
        'This is not a counter-payment booking'
      );
    }

    ensurePaymentWindow(booking);

    const existing = getExistingQr(booking);

    if (existing) {
      return res.json({
        success: true,
        message: 'Existing counter payment QR returned',
        ...existing
      });
    }

    const qr = await createUpiQr(booking);

    broadcastBooking(booking);

    res.json({
      success: true,
      message: 'Counter payment QR generated',
      qrId: qr.id,
      qrImageUrl: qr.image_url,
      qrShortUrl: qr.short_url || qr.image_url,
      expiresAt: booking.payment.qrExpiresAt,
      amount: booking.amount,
      bookingCode: booking.code
    });
  })
);

// ==================== ADMIN ISSUE GATE ENTRY QR ====================

router.post(
  '/:bookingId/issue-gate-qr',
  auth,
  roles('admin'),
  asyncHandler(async (req, res) => {
    const booking = await findBooking(req.params.bookingId);

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    if (booking.payment?.status !== 'paid') {
      throw new ApiError(
        400,
        'Verify payment before issuing Gate Entry QR'
      );
    }

    if (isTerminal(booking)) {
      throw new ApiError(
        400,
        'Gate QR cannot be issued for this booking'
      );
    }

    if (!booking.qrToken) {
      booking.qrToken = crypto
        .randomBytes(32)
        .toString('hex');
    }

    // IMPORTANT:
    // Gate QR fields are inside payment subdocument.
    if (!booking.payment.gateQrIssuedAt) {
      booking.payment.gateQrIssuedAt = new Date();
      booking.payment.gateQrIssuedBy = req.user.id;

      await booking.save();
    }

    broadcastBooking(booking);

    res.json({
      success: true,
      message: 'Gate Entry QR issued successfully',
      booking: publicBooking(booking)
    });
  })
);

// ==================== PAYMENT STATUS ====================

router.get(
  '/:bookingId/status',
  asyncHandler(async (req, res) => {
    const booking = await findBooking(req.params.bookingId);

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    ensureBookingOwner(booking, req);

    res.json({
      success: true,
      booking: publicBooking(booking)
    });
  })
);

// ==================== VERIFY / CONFIRM UPI QR PAYMENT ====================

router.post(
  '/:bookingId/confirm-upi',
  asyncHandler(async (req, res) => {
    const booking = await findBooking(req.params.bookingId);

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    ensureBookingOwner(booking, req);

    if (booking.payment?.status === 'paid') {
      return res.json({
        success: true,
        message: 'Payment already confirmed',
        booking: publicBooking(booking)
      });
    }

    ensurePaymentWindow(booking);

    let paymentReference = req.body?.reference
      ? String(req.body.reference).trim()
      : '';

    // If Razorpay QR code was used and Razorpay is configured, try checking Razorpay API
    if (booking.payment?.qrCodeId && booking.payment.qrCodeId.startsWith('qr_')) {
      try {
        const rzpPayments = await razorpayRequest(
          'GET',
          `/v1/payments/qr_codes/${booking.payment.qrCodeId}/payments`
        );
        if (rzpPayments?.items?.length > 0) {
          const successful = rzpPayments.items.find(p => p.status === 'captured');
          if (successful) {
            paymentReference = successful.id;
          }
        }
      } catch (err) {
        // Network or Razorpay API query failed
      }
    }

    if (!paymentReference) {
      paymentReference = `UPI-${Date.now().toString().slice(-6)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    const updatedBooking = await confirmBooking(booking, paymentReference);
    broadcastBooking(updatedBooking);

    res.json({
      success: true,
      message: 'UPI payment confirmed successfully. Gate pass issued!',
      booking: publicBooking(updatedBooking)
    });
  })
);

// ==================== CREATE RAZORPAY CHECKOUT ORDER ====================

router.post(
  '/:bookingId/order',
  asyncHandler(async (req, res) => {
    const booking = await findBooking(req.params.bookingId);

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    ensureBookingOwner(booking, req);

    if (booking.payment?.method !== 'online') {
      throw new ApiError(
        400,
        'This booking is not configured for online payment'
      );
    }

    ensurePaymentWindow(booking);

    const client = getRazorpay();
    const amount = getAmountInPaise(booking.amount);

    const order = await client.orders.create({
      amount,
      currency: 'INR',
      receipt: booking.code,

      notes: {
        bookingId: String(booking._id),
        bookingCode: booking.code
      }
    });

    booking.payment.gatewayOrderId = order.id;

    await booking.save();

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      bookingCode: booking.code
    });
  })
);

// ==================== VERIFY CHECKOUT PAYMENT ====================

router.post(
  '/:bookingId/verify',
  asyncHandler(async (req, res) => {
    const booking = await findBooking(req.params.bookingId);

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    ensureBookingOwner(booking, req);

    if (booking.payment?.method !== 'online') {
      booking.payment = booking.payment || {};
      booking.payment.method = 'online';
      await booking.save();
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body || {};

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      throw new ApiError(
        400,
        'Payment details are incomplete'
      );
    }

    if (
      booking.payment.gatewayOrderId !== razorpay_order_id
    ) {
      throw new ApiError(400, 'Invalid Razorpay order ID');
    }

    if (booking.payment.status === 'paid') {
      if (
        booking.payment.gatewayPaymentId === razorpay_payment_id
      ) {
        return res.json({
          success: true,
          message: 'Payment already verified',
          booking: publicBooking(booking)
        });
      }

      throw new ApiError(
        409,
        'A different payment is already recorded'
      );
    }

    ensurePaymentWindow(booking);

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      throw new ApiError(503, 'Razorpay is not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!safeCompareHex(expectedSignature, razorpay_signature)) {
      throw new ApiError(
        400,
        'Payment signature verification failed'
      );
    }

    const client = getRazorpay();

    const payment = await client.payments.fetch(
      razorpay_payment_id
    );

    const validPayment = (
      payment.status === 'captured' &&
      payment.order_id === booking.payment.gatewayOrderId &&
      Number(payment.amount) === getAmountInPaise(booking.amount) &&
      payment.currency === 'INR'
    );

    if (!validPayment) {
      throw new ApiError(
        400,
        'Payment has not been captured for this booking'
      );
    }

    const updatedBooking = await confirmBooking(
      booking,
      razorpay_payment_id
    );

    broadcastBooking(updatedBooking);

    res.json({
      success: true,
      message: 'Payment verified successfully',
      booking: publicBooking(updatedBooking)
    });
  })
);

// ==================== RAZORPAY WEBHOOK ====================

router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new ApiError(
        503,
        'Razorpay webhook secret is not configured'
      );
    }

    if (!Buffer.isBuffer(req.body)) {
      throw new ApiError(
        400,
        'Webhook raw body is missing. Check server.js middleware order.'
      );
    }

    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      throw new ApiError(
        400,
        'Webhook signature is missing'
      );
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body)
      .digest('hex');

    if (!safeCompareHex(expectedSignature, signature)) {
      throw new ApiError(400, 'Invalid webhook signature');
    }

    let event;

    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      throw new ApiError(400, 'Invalid webhook JSON');
    }

    // Checkout payment events.
    if (
      event.event === 'payment.captured' ||
      event.event === 'order.paid'
    ) {
      const payment = event.payload?.payment?.entity;

      if (!payment?.order_id || !payment?.id) {
        return res.json({
          success: true,
          message: 'No payment details found'
        });
      }

      const booking = await Booking.findOne({
        'payment.gatewayOrderId': payment.order_id
      }).select('+qrToken');

      if (!booking) {
        return res.json({
          success: true,
          message: 'Booking not found for this order'
        });
      }

      if (booking.payment?.status === 'paid') {
        return res.json({
          success: true,
          message: 'Payment already processed'
        });
      }

      const validPayment = (
        payment.status === 'captured' &&
        Number(payment.amount) === getAmountInPaise(booking.amount) &&
        payment.currency === 'INR'
      );

      if (!validPayment) {
        return res.json({
          success: true,
          message: 'Payment details did not match booking'
        });
      }

      const updatedBooking = await confirmBooking(
        booking,
        payment.id
      );

      broadcastBooking(updatedBooking);

      return res.json({
        success: true,
        message: 'Checkout payment processed'
      });
    }

    // Razorpay UPI QR payment event.
    if (event.event === 'qr_code.credited') {
      const paymentEntity = event.payload?.payment?.entity;
      const qrEntity = event.payload?.qr_code?.entity;

      const qrCodeId =
        qrEntity?.id ||
        paymentEntity?.qr_code_id;

      const paymentId = paymentEntity?.id;

      if (!qrCodeId || !paymentId) {
        return res.json({
          success: true,
          message: 'QR payment details not found'
        });
      }

      const booking = await Booking.findOne({
        'payment.qrCodeId': qrCodeId
      }).select('+qrToken');

      if (!booking) {
        return res.json({
          success: true,
          message: 'Booking not found for QR Code'
        });
      }

      if (booking.payment?.status === 'paid') {
        return res.json({
          success: true,
          message: 'QR payment already processed'
        });
      }

      // Fetch payment from Razorpay.
      // Never trust frontend payment status.
      const client = getRazorpay();

      const verifiedPayment = await client.payments.fetch(
        paymentId
      );

      const validPayment = (
        verifiedPayment.status === 'captured' &&
        verifiedPayment.qr_code_id === qrCodeId &&
        Number(verifiedPayment.amount) === getAmountInPaise(booking.amount) &&
        verifiedPayment.currency === 'INR'
      );

      if (!validPayment) {
        return res.json({
          success: true,
          message: 'QR payment could not be verified'
        });
      }

      const updatedBooking = await confirmBooking(
        booking,
        verifiedPayment.id
      );

      broadcastBooking(updatedBooking);

      return res.json({
        success: true,
        message: 'QR payment processed successfully'
      });
    }

    return res.json({
      success: true,
      message: 'Webhook event ignored'
    });
  })
);

module.exports = router;
