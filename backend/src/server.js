require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { User } = require('./models');
const { configureIO } = require('./services/notify');
const { cancelExpired } = require('./services/bookings');
const { startMQTT } = require('./services/mqtt');

const app = express();
app.disable('x-powered-by');
app.use(helmet()); app.use(compression());
const origins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean);
const isOriginAllowed = origin => {
  if (!origin) return true;
  if (origins.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
};
const corsConfig = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);
    callback(new Error('CORS: Origin not permitted'));
  },
  credentials: true
};
app.use(cors(corsConfig));
app.use(express.json({ limit: '60kb' }));
app.use('/api', rateLimit({ windowMs: 15*60*1000, limit: 500, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, limit: 15 }));
app.use('/api/auth/register', rateLimit({ windowMs: 15*60*1000, limit: 10 }));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ParkEase API', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/admin', require('./routes/admin'));
app.use((req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((err, req, res, next) => {
  if (err.name === 'ZodError') return res.status(400).json({ error: err.issues.map(x => `${x.path.join('.')}: ${x.message}`).join('; ') });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid identifier' });
  if (err.code === 11000) return res.status(409).json({ error: 'This record already exists' });
  if (err.message?.startsWith('CORS:')) return res.status(403).json({ error: err.message });
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Internal server error' });
});
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const data = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(data.sub);
        if (user) socket.user = user;
      } catch {
        // Token invalid or expired: gracefully connect as guest without rejecting
      }
    }
    next();
  } catch {
    next();
  }
});
io.on('connection', socket => {
  if (socket.user) {
    socket.join(`user:${socket.user.id}`);
    if (['admin','staff'].includes(socket.user.role)) socket.join('operators');
  }
});
configureIO(io);
async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET with at least 32 characters');
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env');
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_PAYMENTS === 'true') throw new Error('DEMO_PAYMENTS must be false in production');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
  startMQTT();
  setInterval(() => cancelExpired().catch(console.error), 60*1000).unref();
  cancelExpired().catch(console.error);
  server.listen(Number(process.env.PORT) || 5000, '0.0.0.0', () => {
    console.log(`ParkEase API listening on port ${process.env.PORT || 5000}`);
  });
}
if (require.main === module) start().catch(e => { console.error('Startup failed:', e.message); process.exit(1); });
module.exports = { app, start };
