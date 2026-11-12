const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWindow, priceFor, eligible } = require('../src/lib/pricing');
const location = { prices: { car: 40, bike: 20, ev: 60, accessible: 30 }, peakStart: 17, peakEnd: 20, weekendMultiplier: 1.2, peakMultiplier: 1.5 };
test('vehicle to slot compatibility', () => {
  assert.equal(eligible('ev','ev'), true); assert.equal(eligible('car','ev'), false); assert.equal(eligible('car','accessible'),false); assert.equal(eligible('accessible','accessible'),true); assert.equal(eligible('bike','bike'), true);
});
test('rate calculation for ordinary weekday hour', () => {
  const from = new Date('2026-11-03T10:00:00Z'), to = new Date('2026-11-03T11:00:00Z');
  assert.equal(priceFor(location, 'car', from, to).total, 40);
});
test('minimum billed hour', () => {
  const from = new Date('2026-11-03T10:00:00Z'), to = new Date('2026-11-03T10:20:00Z');
  assert.equal(priceFor(location, 'car', from, to).total, 40);
});
test('invalid windows rejected', () => {
  assert.throws(() => parseWindow('not-date', '2026-12-02T08:00:00Z'));
});

test('peak rate follows India local time (Asia/Kolkata)', () => {
  const from = new Date('2026-11-03T12:00:00Z'), to = new Date('2026-11-03T13:00:00Z');
  assert.equal(priceFor(location, 'car', from, to).total, 60);
});
test('weekend multiplier follows India local calendar', () => {
  const from = new Date('2026-11-07T10:00:00Z'), to = new Date('2026-11-07T11:00:00Z');
  assert.equal(priceFor(location, 'car', from, to).total, 48);
});
