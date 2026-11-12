const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { ApiError, asyncHandler } = require('../lib/errors');
const auth = asyncHandler(async (req, res, next) => {
  const token = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError(401, 'Please sign in to continue');
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { throw new ApiError(401, 'Your session has expired. Please sign in again'); }
  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'Account no longer exists');
  req.user = user;
  next();
});
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.sub);
  } catch {
    req.user = null;
  }
  next();
});
const roles = (...allowed) => (req, res, next) => allowed.includes(req.user?.role) ? next() : next(new ApiError(403, 'Insufficient permissions'));
function signToken(user) { return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' }); }
module.exports = { auth, optionalAuth, roles, signToken };
