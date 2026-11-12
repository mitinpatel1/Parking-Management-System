const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { User } = require('../models');
const { auth, signToken } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../lib/errors');
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone });
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, phone } = z.object({ name: z.string().trim().min(2).max(90), email: z.string().email(), password: z.string().min(8).max(100), phone: z.string().max(20).optional() }).parse(req.body);
  const mail = email.toLowerCase().trim();
  if (await User.exists({ email: mail })) throw new ApiError(409, 'Email is already registered');
  const user = await User.create({ name, email: mail, phone: phone || '', passwordHash: await bcrypt.hash(password, 12), role: 'user' });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));
router.post('/login', asyncHandler(async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await User.findOne({ email: parsed.email.toLowerCase().trim() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(parsed.password, user.passwordHash))) throw new ApiError(401, 'Invalid email or password');
  res.json({ token: signToken(user), user: publicUser(user) });
}));
router.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
router.patch('/me', auth, asyncHandler(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(90).optional(), phone: z.string().max(20).optional() }).parse(req.body);
  Object.assign(req.user, parsed); await req.user.save(); res.json({ user: publicUser(req.user) });
}));
module.exports = router;
