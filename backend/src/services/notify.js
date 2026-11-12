const { Notification } = require('../models');
let io;
function configureIO(serverIO) { io = serverIO; }
function emitLocation(id) { io?.emit('location:updated', { locationId: String(id) }); }
function emitBooking(booking) {
  if (booking.user) {
    io?.to(`user:${booking.user?._id || booking.user}`).emit('booking:updated', { id: String(booking.id) });
  }
  io?.to('operators').emit('booking:updated', { id: String(booking.id) });
  io?.emit('booking:updated', { id: String(booking.id) });
}
async function notify(user, title, message, booking) {
  if (!user) return null;
  const row = await Notification.create({ user, title, message, booking });
  io?.to(`user:${user}`).emit('notification:new', row.toObject());
  return row;
}
module.exports = { configureIO, emitLocation, emitBooking, notify };
