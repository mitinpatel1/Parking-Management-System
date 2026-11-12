const mqtt = require('mqtt');
const { Slot } = require('../models');
const { emitLocation } = require('./notify');
function startMQTT() {
  const url = process.env.MQTT_URL;
  if (!url) return;
  const client = mqtt.connect(url, { username: process.env.MQTT_USERNAME || undefined, password: process.env.MQTT_PASSWORD || undefined, reconnectPeriod: 5000 });
  client.on('connect', () => { console.log('MQTT connected'); client.subscribe('parkease/sensors/+/state', { qos: 1 }); });
  client.on('message', async (topic, payload) => {
    try {
      const sensorId = topic.split('/')[2];
      if (!sensorId || sensorId.length > 60) return;
      const msg = JSON.parse(payload.toString());
      if (typeof msg.occupied !== 'boolean') return;
      const slot = await Slot.findOne({ sensorId });
      if (!slot || slot.state === 'maintenance') return;
      slot.state = msg.occupied ? 'occupied' : 'available';
      await slot.save(); emitLocation(slot.location);
    } catch (err) { console.warn('Ignored invalid sensor message:', err.message); }
  });
  client.on('error', err => console.warn('MQTT:', err.message));
}
module.exports = { startMQTT };
