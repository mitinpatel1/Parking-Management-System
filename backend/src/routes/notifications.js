const router = require('express').Router();
const { Notification } = require('../models');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../lib/errors');
router.use(auth);
router.get('/', asyncHandler(async (req, res) => res.json(await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50).lean())));
router.patch('/read-all', asyncHandler(async (req, res) => { await Notification.updateMany({ user: req.user.id, read: false }, { $set: { read: true } }); res.json({ success: true }); }));
module.exports = router;
