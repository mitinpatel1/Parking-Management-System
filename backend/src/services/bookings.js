const crypto = require('crypto');
const { Slot, Booking } = require('../models');
const { emitLocation, emitBooking, notify } = require('./notify');
const { ApiError } = require('../lib/errors');
const randomCode = () => `PK-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
async function releaseReservation(booking) {
  await Slot.updateOne({ _id: booking.slot }, { $pull: { reservations: { bookingId: booking._id } } });
  emitLocation(booking.location);
  emitBooking(booking);
}
async function confirmBooking(booking, reference = '') {
  if (booking.payment?.status === 'paid') throw new ApiError(400, 'Booking is already paid');
  if (['cancelled', 'expired', 'completed'].includes(booking.status)) throw new ApiError(400, 'This booking is no longer active');
  if (booking.holdUntil && booking.holdUntil < new Date() && booking.status === 'pending_payment') {
    throw new ApiError(409, 'Payment hold expired');
  }
  booking.status = booking.status === 'pending_payment' ? 'confirmed' : booking.status;
  booking.holdUntil = undefined;
  booking.payment.status = 'paid';
  booking.payment.reference = reference;
  booking.payment.paidAt = new Date();
  await booking.save();
  if (booking.user) {
    await notify(booking.user, 'Payment received', `Payment received for booking ${booking.code}.`, booking._id).catch(console.error);
  }
  emitBooking(booking);
  return booking;
}
async function cancelExpired() {
  const now = new Date();
  const overdue = await Booking.find({ $or: [
    { status: 'pending_payment', holdUntil: { $lt: now } },
    { status: 'confirmed', startAt: { $lt: new Date(now.getTime() - 20 * 60 * 1000) } }
  ] }).limit(150);
  for (const b of overdue) {
    b.status = 'expired'; await b.save(); await releaseReservation(b);
    await notify(b.user, 'Booking expired', `Booking ${b.code} expired. Its slot was released.`, b._id);
  }
}
module.exports = { randomCode, releaseReservation, confirmBooking, cancelExpired };
