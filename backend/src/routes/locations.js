const router = require('express').Router();
const mongoose = require('mongoose');
const { Location, Slot } = require('../models');
const { asyncHandler, ApiError } = require('../lib/errors');
const { parseWindow, eligible } = require('../lib/pricing');
router.get('/', asyncHandler(async (req, res) => {
  const { q = '', city = '', kind = '', ev = '' } = req.query;
  const filter = { isOpen: true };
  if (city) filter.city = new RegExp(String(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (kind) filter.kind = kind;
  if (q) {
    const query = String(q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['name', 'city', 'area', 'address'].map(k => ({ [k]: new RegExp(query, 'i') }));
  }
  const locations = await Location.find(filter).sort({ createdAt: -1 }).lean();
  const totals = await Slot.aggregate([{ $group: { _id: '$location', total: { $sum: 1 }, ev: { $sum: { $cond: [{ $eq: ['$kind', 'ev'] }, 1, 0] } }, occupied: { $sum: { $cond: [{ $eq: ['$state', 'occupied'] }, 1, 0] } } } }]);
  const byLoc = Object.fromEntries(totals.map(a => [String(a._id), a]));
  res.json(locations.filter(l => !ev || (byLoc[String(l._id)]?.ev || 0) > 0).map(l => ({ ...l, stats: byLoc[String(l._id)] || { total: 0, occupied: 0, ev: 0 } })));
}));
router.get('/office/primary', asyncHandler(async (req, res) => {
  let office = await Location.findOne({ kind: 'office', isOpen: true }).sort({ createdAt: -1 }).lean();
  if (!office) office = await Location.findOne({ isOpen: true }).sort({ createdAt: -1 }).lean();
  if (!office) throw new ApiError(404, 'Office parking venue not found');
  const totals = await Slot.aggregate([
    { $match: { location: office._id } },
    { $group: { _id: '$location', total: { $sum: 1 }, ev: { $sum: { $cond: [{ $eq: ['$kind', 'ev'] }, 1, 0] } }, occupied: { $sum: { $cond: [{ $eq: ['$state', 'occupied'] }, 1, 0] } } } }
  ]);
  const stats = totals[0] || { total: 0, occupied: 0, ev: 0 };
  res.json({ ...office, stats });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Location not found');
  const location = await Location.findById(req.params.id).lean();
  if (!location || !location.isOpen) throw new ApiError(404, 'Location not found');
  res.json(location);
}));
router.get('/:id/slots', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Location not found');
  const { startAt, endAt, vehicleType = '' } = req.query;
  const location = await Location.findById(req.params.id);
  if (!location?.isOpen) throw new ApiError(404, 'Location not available');
  let start, end;
  if (startAt && endAt) ({ start, end } = parseWindow(startAt, endAt));
  const slots = await Slot.find({ location: req.params.id }).lean();
  res.json(slots.map(s => {
    const reserved = start && end && s.reservations.some(r => r.startAt < end && r.endAt > start);
    const occupiedNow = s.state === 'occupied';
    const isNow = start && start.getTime() <= Date.now() + 5 * 60 * 1000;
    const isAvailable = s.state !== 'maintenance' && !reserved && !(isNow && occupiedNow);
    return {
      id: s._id,
      number: s.number,
      floor: s.floor,
      zone: s.zone,
      kind: s.kind,
      state: s.state,
      sensorId: s.sensorId,
      reserved: !!reserved,
      compatible: true,
      available: isAvailable
    };
  }));
}));
module.exports = router;
