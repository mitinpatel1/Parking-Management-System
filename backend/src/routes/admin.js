
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { z } = require('zod');

const { Location, Slot, Booking, User } = require('../models');
const { auth, roles } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../lib/errors');
const { emitLocation, emitBooking, notify } = require('../services/notify');
const { safeBookingForEmit } = require('../services/bookings');

router.use(auth, roles('admin'));

const locationData = z.object({
  name: z.string().trim().min(3).max(100),
  city: z.string().trim().min(2).max(70),
  area: z.string().trim().min(2).max(90),
  address: z.string().trim().min(5).max(250),
  pincode: z.string().trim().max(12).optional().default(''),

  kind: z.enum([
    'mall', 'airport', 'office', 'station', 'public'
  ]).optional(),

  cover: z.enum([
    'violet', 'blue', 'mint', 'orange', 'pink'
  ]).optional(),

  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),

  isOpen: z.boolean().optional(),

  features: z.array(z.string().max(40)).max(20).optional(),

  prices: z.object({
    car: z.coerce.number().min(0).max(10000),
    bike: z.coerce.number().min(0).max(10000),
    ev: z.coerce.number().min(0).max(10000),
    accessible: z.coerce.number().min(0).max(10000)
  }).optional(),

  weekendMultiplier: z.coerce.number().min(1).max(5).optional(),
  peakMultiplier: z.coerce.number().min(1).max(5).optional(),
  peakStart: z.coerce.number().int().min(0).max(23).optional(),
  peakEnd: z.coerce.number().int().min(0).max(24).optional()
});


// ==========================================
// ADMIN DASHBOARD STATS
// ==========================================

router.get('/stats', asyncHandler(async (req, res) => {
  const [
    locations,
    slots,
    bookings,
    people,
    todayBookings,
    paidBookings,
    pendingCounterPayments,
    pendingOnlinePayments
  ] = await Promise.all([
    Location.countDocuments(),
    Slot.countDocuments(),
    Booking.countDocuments(),
    User.countDocuments(),

    Booking.find({
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0))
      }
    }).lean(),

    Booking.find({
      'payment.status': 'paid',
      status: {
        $in: [
          'confirmed',
          'checked_in',
          'payment_due',
          'completed'
        ]
      }
    }, 'amount extraDue extraPaid createdAt').lean(),

    Booking.countDocuments({
      'payment.method': 'counter',
      'payment.status': { $ne: 'paid' },
      status: { $nin: ['cancelled', 'expired', 'completed'] },
      $or: [
        { 'payment.cashRequestAt': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        { 'payment.cashRequestAt': { $exists: false }, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      ]
    }),

    Booking.countDocuments({
      'payment.method': 'online',
      'payment.status': { $ne: 'paid' },
      status: 'pending_payment'
    })
  ]);

  const occupied = await Slot.countDocuments({
    state: 'occupied'
  });

  const active = await Booking.countDocuments({
    status: {
      $in: ['confirmed', 'checked_in', 'payment_due']
    }
  });

  const revenue = paidBookings.reduce(
    (sum, b) => sum + (b.amount || 0) + (b.extraPaid || 0),
    0
  );

  const chart = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();

    d.setDate(d.getDate() - 6 + i);
    d.setHours(0, 0, 0, 0);

    return {
      day: d.toLocaleDateString('en-IN', {
        weekday: 'short'
      }),
      date: d.toISOString().slice(0, 10),
      revenue: 0,
      bookings: 0
    };
  });

  const chartIndex = Object.fromEntries(
    chart.map((d, i) => [d.date, i])
  );

  const recent = await Booking.find({
    createdAt: {
      $gte: new Date(Date.now() - 8 * 86400000)
    }
  }).lean();

  for (const b of recent) {
    const key = new Date(b.createdAt)
      .toISOString()
      .slice(0, 10);

    const i = chartIndex[key];

    if (i !== undefined) {
      chart[i].bookings += 1;

      if (b.payment?.status === 'paid') {
        chart[i].revenue +=
          (b.amount || 0) + (b.extraPaid || 0);
      }
    }
  }

  const latest = await Booking.find()
    .populate('location', 'name')
    .populate('slot', 'number')
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  res.json({
    locations,
    slots,
    occupied,
    available: await Slot.countDocuments({
      state: 'available'
    }),
    bookings,
    active,
    people,
    todayBookings: todayBookings.length,
    revenue,
    pendingCounterPayments,
    pendingOnlinePayments,
    chart,
    latest
  });
}));


// ==========================================
// GET ALL PARKING LOCATIONS
// ==========================================

router.get('/locations', asyncHandler(async (req, res) => {
  const locations = await Location.find()
    .sort({ createdAt: -1 })
    .lean();

  res.json(locations);
}));


// ==========================================
// ADD PARKING LOCATION
// ==========================================

router.post('/locations', asyncHandler(async (req, res) => {
  const data = locationData.parse(req.body);

  const location = await Location.create(data);

  res.status(201).json(location);
}));


// ==========================================
// EDIT / UPDATE PARKING LOCATION
// ==========================================

router.patch('/locations/:id', asyncHandler(async (req, res) => {
  const location = await Location.findByIdAndUpdate(
    req.params.id,
    {
      $set: locationData.partial().parse(req.body)
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (!location) {
    throw new ApiError(404, 'Location not found');
  }

  emitLocation(location.id);

  res.json(location);
}));


// ==========================================
// DELETE PARKING LOCATION
// ==========================================

router.delete('/locations/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, 'Invalid parking location ID');
  }

  const location = await Location.findById(id);

  if (!location) {
    throw new ApiError(404, 'Parking location not found');
  }

  const existingBooking = await Booking.exists({
    location: location._id
  });

  if (existingBooking) {
    throw new ApiError(
      409,
      'Cannot delete this parking area because booking records are associated with it. Preserve the booking history and close the venue instead.'
    );
  }

  const protectedSlot = await Slot.exists({
    location: location._id,
    $or: [
      { state: 'occupied' },
      {
        reservations: {
          $elemMatch: {
            endAt: { $gt: new Date() }
          }
        }
      }
    ]
  });

  if (protectedSlot) {
    throw new ApiError(
      409,
      'Cannot delete this parking area because it has occupied slots or active/future reservations.'
    );
  }

  await Slot.deleteMany({
    location: location._id
  });

  await Location.deleteOne({
    _id: location._id
  });

  emitLocation(location.id);

  res.json({
    success: true,
    message: 'Parking location deleted successfully',
    id: location.id
  });
}));


// ==========================================
// GET PARKING SLOTS
// ==========================================

router.get('/slots', asyncHandler(async (req, res) => {
  const filter = req.query.location
    ? { location: req.query.location }
    : {};

  const slots = await Slot.find(filter)
    .select('-reservations')
    .populate('location', 'name city')
    .sort({ floor: 1, number: 1 })
    .limit(500)
    .lean();

  res.json(slots);
}));


// ==========================================
// ADD PARKING SLOTS
// ==========================================

router.post('/slots', asyncHandler(async (req, res) => {
  const body = z.object({
    location: z.string(),

    floor: z.string().min(1).max(12),

    zone: z.string().min(1).max(8).default('A'),

    prefix: z.string().min(1).max(8),

    startNumber: z.coerce.number()
      .int()
      .min(1)
      .max(9999)
      .default(1),

    count: z.coerce.number()
      .int()
      .min(1)
      .max(80),

    kind: z.enum([
      'car',
      'bike',
      'ev',
      'accessible'
    ])
  }).parse(req.body);

  if (!await Location.exists({
    _id: body.location
  })) {
    throw new ApiError(404, 'Location not found');
  }

  const docs = Array.from(
    { length: body.count },
    (_, i) => ({
      location: body.location,
      floor: body.floor,
      zone: body.zone,
      number: `${body.prefix.toUpperCase()}${body.startNumber + i}`,
      kind: body.kind
    })
  );

  let result;

  try {
    result = await Slot.insertMany(docs, {
      ordered: true
    });
  } catch (e) {
    if (e.code === 11000) {
      throw new ApiError(
        409,
        'One or more slot numbers already exist at this location'
      );
    }

    throw e;
  }

  emitLocation(body.location);

  res.status(201).json({
    count: result.length
  });
}));


// ==========================================
// UPDATE PARKING SLOT
// ==========================================

router.patch('/slots/:id', asyncHandler(async (req, res) => {
  const parsed = z.object({
    state: z.enum([
      'available',
      'occupied',
      'maintenance'
    ]).optional(),

    kind: z.enum([
      'car',
      'bike',
      'ev',
      'accessible'
    ]).optional(),

    sensorId: z.string().max(60).optional()
  }).parse(req.body);

  const slot = await Slot.findById(req.params.id);

  if (!slot) {
    throw new ApiError(404, 'Slot not found');
  }

  if (
    parsed.state === 'maintenance' &&
    slot.reservations.some(r => r.endAt > new Date())
  ) {
    throw new ApiError(
      409,
      'Cannot close a slot with active/future bookings'
    );
  }

  Object.assign(slot, parsed);

  await slot.save();

  emitLocation(slot.location);

  res.json(slot);
}));


// ==========================================
// GET ALL BOOKINGS
// ==========================================

router.get('/bookings', asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.status) {
    filter.status = String(req.query.status);
  }

  if (req.query.paymentMethod) {
    if (!['online', 'counter'].includes(req.query.paymentMethod)) {
      throw new ApiError(400, 'Invalid payment method filter');
    }

    filter['payment.method'] = req.query.paymentMethod;
  }

  if (req.query.paymentStatus) {
    if (!['unpaid', 'pending', 'paid'].includes(req.query.paymentStatus)) {
      throw new ApiError(400, 'Invalid payment status filter');
    }

    filter['payment.status'] = req.query.paymentStatus;
  }

  const rows = await Booking.find(filter)
    .populate('location', 'name city')
    .populate('slot', 'number floor')
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(250)
    .lean();

  res.json(rows);
}));


// ==========================================
// GET PENDING COUNTER PAYMENT REQUESTS
// ==========================================

router.get('/payment-requests', asyncHandler(async (req, res) => {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await Booking.find({
    'payment.method': 'counter',
    'payment.status': { $ne: 'paid' },
    status: { $nin: ['cancelled', 'expired', 'completed'] },
    $or: [
      { 'payment.cashRequestAt': { $gte: cutoff24h } },
      { 'payment.cashRequestAt': { $exists: false }, createdAt: { $gte: cutoff24h } }
    ]
  })
    .populate('location', 'name city address')
    .populate('slot', 'number floor kind')
    .populate('user', 'name email phone')
    .sort({ 'payment.cashRequestAt': -1, createdAt: -1 })
    .limit(200)
    .lean();

  res.json(rows);
}));


// ==========================================
// RECEIVE CASH & GRANT PARKING ACCESS
// ==========================================

router.post('/bookings/:id/receive-cash', asyncHandler(async (req, res) => {
  const { reference = '', autoCheckIn = false } = req.body || {};
  const booking = await Booking.findById(req.params.id)
    .select('+qrToken')
    .populate('location', 'name city')
    .populate('slot', 'number floor kind')
    .populate('user', 'name email');

  if (!booking) {
    throw new ApiError(404, 'Booking not found');
  }

  if (booking.status === 'expired') {
    throw new ApiError(400, 'This cash payment request expired after 24 hours and the reserved slot was released.');
  }

  const requestedAt = booking.payment?.cashRequestAt || booking.createdAt;
  if (requestedAt && Date.now() - new Date(requestedAt).getTime() > 24 * 60 * 60 * 1000) {
    throw new ApiError(400, 'This cash payment request expired after 24 hours.');
  }

  if (booking.payment?.status === 'paid' && booking.status !== 'payment_due') {
    throw new ApiError(400, 'Cash payment has already been recorded for this booking');
  }

  const now = new Date();
  booking.payment.status = 'paid';
  booking.payment.method = 'counter';
  booking.payment.paidAt = now;
  booking.payment.cashApprovedAt = now;
  booking.payment.reference = reference.trim() || `CASH-${Date.now()}`;
  booking.payment.gateQrIssuedAt = now;
  booking.payment.gateQrIssuedBy = req.user.id;

  if (booking.status === 'pending_payment') {
    booking.status = 'confirmed';
    booking.holdUntil = undefined;
  }

  if (booking.status === 'payment_due') {
    booking.extraPaid = booking.extraDue;
    booking.extraDue = 0;
    booking.status = 'completed';
  }

  if (!booking.qrToken) {
    booking.qrToken = crypto.randomBytes(32).toString('hex');
  }

  if (autoCheckIn && booking.slot) {
    booking.status = 'checked_in';
    booking.checkedInAt = now;
    await Slot.updateOne({ _id: booking.slot._id || booking.slot }, { state: 'occupied' });
  }

  await booking.save();

  // Real-time broadcast
  emitLocation(booking.location);
  emitBooking(safeBookingForEmit(booking));

  if (booking.user) {
    await notify(
      booking.user,
      'Cash Received - Parking Access Granted',
      `Cash payment of ₹${booking.amount} received. Your Gate Pass QR is active for entry!`,
      booking._id
    ).catch(console.error);
  }

  res.json({
    success: true,
    message: 'Cash received successfully. Parking & gate entry access granted!',
    booking: safeBookingForEmit(booking)
  });
}));


// ==========================================
// GET STAFF
// ==========================================

router.get('/staff', asyncHandler(async (req, res) => {
  const staff = await User.find({
    role: {
      $in: ['staff', 'admin']
    }
  }, 'name email role createdAt')
    .sort({ createdAt: -1 })
    .lean();

  res.json(staff);
}));


// ==========================================
// ADD STAFF
// ==========================================

router.post('/staff', asyncHandler(async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(2).max(90),

    email: z.string().email(),

    password: z.string().min(10).max(100)
  }).parse(req.body);

  if (await User.exists({
    email: data.email.toLowerCase()
  })) {
    throw new ApiError(409, 'Email is already registered');
  }

  const staff = await User.create({
    name: data.name,
    email: data.email.toLowerCase(),
    passwordHash: await bcrypt.hash(data.password, 12),
    role: 'staff'
  });

  res.status(201).json({
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role
  });
}));


// ==========================================
// EXPORT BOOKINGS CSV
// ==========================================

router.get('/export.csv', asyncHandler(async (req, res) => {
  const bookings = await Booking.find()
    .populate('location', 'name')
    .populate('slot', 'number')
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(10000)
    .lean();

  const safe = x =>
    `"${String(x ?? '')
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replace(/"/g, '""')}"`;

  const header = [
    'Code',
    'Customer',
    'Contact',
    'Parking',
    'Slot',
    'Vehicle',
    'Start',
    'End',
    'AmountINR',
    'OverstayPaidINR',
    'PaymentMethod',
    'PaymentStatus',
    'GateQRIssued',
    'Status'
  ];

  const lines = [
    header.map(safe).join(','),

    ...bookings.map(b => [
      b.code,
      b.user?.name || b.guestName || 'Guest',
      b.user?.email || b.guestPhone || '—',
      b.location?.name,
      b.slot?.number,
      b.vehicleNumber,
      new Date(b.startAt).toISOString(),
      new Date(b.endAt).toISOString(),
      b.amount,
      b.extraPaid || 0,
      b.payment?.method,
      b.payment?.status,
      b.gateQrIssuedAt ? 'Yes' : 'No',
      b.status
    ].map(safe).join(','))
  ];

  res
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set(
      'Content-Disposition',
      'attachment; filename="parkease-bookings.csv"'
    )
    .send('\uFEFF' + lines.join('\n'));
}));


module.exports = router;
