const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { Location, Slot, Booking, User } = require('../models');
const { auth, roles } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../lib/errors');
const { emitLocation } = require('../services/notify');
router.use(auth, roles('admin'));
const locationData = z.object({
  name: z.string().trim().min(3).max(100), city: z.string().trim().min(2).max(70),
  area: z.string().trim().min(2).max(90), address: z.string().trim().min(5).max(250),
  kind: z.enum(['mall','airport','office','station','public']).optional(),
  cover: z.enum(['violet','blue','mint','orange','pink']).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional(),
  isOpen: z.boolean().optional(), features: z.array(z.string().max(40)).max(20).optional(),
  prices: z.object({ car: z.coerce.number().min(0).max(10000), bike: z.coerce.number().min(0).max(10000), ev: z.coerce.number().min(0).max(10000), accessible: z.coerce.number().min(0).max(10000) }).optional(),
  weekendMultiplier: z.coerce.number().min(1).max(5).optional(), peakMultiplier: z.coerce.number().min(1).max(5).optional(), peakStart: z.coerce.number().int().min(0).max(23).optional(), peakEnd: z.coerce.number().int().min(0).max(24).optional()
});
router.get('/stats', asyncHandler(async (req, res) => {
  const [locations, slots, bookings, people, todayBookings, paidBookings] = await Promise.all([
    Location.countDocuments(), Slot.countDocuments(), Booking.countDocuments(), User.countDocuments(),
    Booking.find({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }).lean(),
    Booking.find({ 'payment.status': 'paid', status: { $in: ['confirmed','checked_in','payment_due','completed'] } }, 'amount extraDue extraPaid createdAt').lean()
  ]);
  const occupied = await Slot.countDocuments({ state: 'occupied' });
  const active = await Booking.countDocuments({ status: { $in: ['confirmed','checked_in','payment_due'] } });
  const revenue = paidBookings.reduce((sum, b) => sum + (b.amount || 0) + (b.extraPaid || 0), 0);
  const chart = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 6 + i); d.setHours(0,0,0,0);
    return { day: d.toLocaleDateString('en-IN', { weekday: 'short' }), date: d.toISOString().slice(0,10), revenue: 0, bookings: 0 };
  });
  const chartIndex = Object.fromEntries(chart.map((d,i) => [d.date,i]));
  const recent = await Booking.find({ createdAt: { $gte: new Date(Date.now() - 8*86400000) } }).lean();
  for (const b of recent) {
    const key = new Date(b.createdAt).toISOString().slice(0,10); const i = chartIndex[key];
    if (i !== undefined) { chart[i].bookings += 1; if (b.payment?.status === 'paid') chart[i].revenue += (b.amount || 0) + (b.extraPaid || 0); }
  }
  const latest = await Booking.find().populate('location', 'name').populate('slot', 'number').populate('user', 'name').sort({ createdAt: -1 }).limit(6).lean();
  res.json({ locations, slots, occupied, available: await Slot.countDocuments({ state: 'available' }), bookings, active, people, todayBookings: todayBookings.length, revenue, chart, latest });
}));
router.get('/locations', asyncHandler(async (req, res) => res.json(await Location.find().sort({ createdAt: -1 }).lean())));
router.post('/locations', asyncHandler(async (req, res) => { const l = await Location.create(locationData.parse(req.body)); res.status(201).json(l); }));
router.patch('/locations/:id', asyncHandler(async (req, res) => {
  const l = await Location.findByIdAndUpdate(req.params.id, { $set: locationData.partial().parse(req.body) }, { new: true, runValidators: true });
  if (!l) throw new ApiError(404, 'Location not found'); emitLocation(l.id); res.json(l);
}));
router.get('/slots', asyncHandler(async (req, res) => {
  const filter = req.query.location ? { location: req.query.location } : {};
  res.json(await Slot.find(filter).select('-reservations').populate('location', 'name city').sort({ floor: 1, number: 1 }).limit(500).lean());
}));
router.post('/slots', asyncHandler(async (req, res) => {
  const body = z.object({ location: z.string(), floor: z.string().min(1).max(12), zone: z.string().min(1).max(8).default('A'), prefix: z.string().min(1).max(8), startNumber: z.coerce.number().int().min(1).max(9999).default(1), count: z.coerce.number().int().min(1).max(80), kind: z.enum(['car','bike','ev','accessible']) }).parse(req.body);
  if (!await Location.exists({ _id: body.location })) throw new ApiError(404, 'Location not found');
  const docs = Array.from({ length: body.count }, (_, i) => ({ location: body.location, floor: body.floor, zone: body.zone, number: `${body.prefix.toUpperCase()}${body.startNumber+i}`, kind: body.kind }));
  let result;
  try { result = await Slot.insertMany(docs, { ordered: true }); }
  catch (e) { if (e.code === 11000) throw new ApiError(409, 'One or more slot numbers already exist at this location'); throw e; }
  emitLocation(body.location); res.status(201).json({ count: result.length });
}));
router.patch('/slots/:id', asyncHandler(async (req, res) => {
  const parsed = z.object({ state: z.enum(['available','occupied','maintenance']).optional(), kind: z.enum(['car','bike','ev','accessible']).optional(), sensorId: z.string().max(60).optional() }).parse(req.body);
  const slot = await Slot.findById(req.params.id);
  if (!slot) throw new ApiError(404, 'Slot not found');
  if (parsed.state === 'maintenance' && slot.reservations.some(r => r.endAt > new Date())) throw new ApiError(409, 'Cannot close a slot with active/future bookings');
  Object.assign(slot, parsed); await slot.save(); emitLocation(slot.location); res.json(slot);
}));
router.get('/bookings', asyncHandler(async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const rows = await Booking.find(filter).populate('location', 'name city').populate('slot', 'number floor').populate('user', 'name email').sort({ createdAt: -1 }).limit(250).lean();
  res.json(rows);
}));
router.get('/staff', asyncHandler(async (req, res) => res.json(await User.find({ role: { $in: ['staff','admin'] } }, 'name email role createdAt').sort({ createdAt: -1 }).lean())));
router.post('/staff', asyncHandler(async (req, res) => {
  const data = z.object({ name: z.string().trim().min(2).max(90), email: z.string().email(), password: z.string().min(10).max(100) }).parse(req.body);
  if (await User.exists({ email: data.email.toLowerCase() })) throw new ApiError(409, 'Email is already registered');
  const staff = await User.create({ name: data.name, email: data.email.toLowerCase(), passwordHash: await bcrypt.hash(data.password, 12), role: 'staff' });
  res.status(201).json({ id: staff.id, name: staff.name, email: staff.email, role: staff.role });
}));
router.get('/export.csv', asyncHandler(async (req, res) => {
  const bookings = await Booking.find().populate('location','name').populate('slot','number').populate('user','name email').sort({ createdAt: -1 }).limit(10000).lean();
  const safe = x => `"${String(x ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const header = ['Code','Customer','Contact','Parking','Slot','Vehicle','Start','End','AmountINR','OverstayPaidINR','Payment','Status'];
  const lines = [header.map(safe).join(','), ...bookings.map(b => [b.code,b.user?.name || b.guestName || 'Guest',b.user?.email || b.guestPhone || '—',b.location?.name,b.slot?.number,b.vehicleNumber,new Date(b.startAt).toISOString(),new Date(b.endAt).toISOString(),b.amount,b.extraPaid||0,b.payment?.status,b.status].map(safe).join(','))];
  res.set('Content-Type','text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="parkease-bookings.csv"').send('\uFEFF' + lines.join('\n'));
}));
module.exports = router;
