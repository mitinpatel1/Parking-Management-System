require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Location, Slot } = require('../src/models');
async function seed() {
  if (!process.env.MONGODB_URI) throw new Error('Set backend/.env first (MONGODB_URI missing)');
  await mongoose.connect(process.env.MONGODB_URI);
  for (const [role, emailKey, passKey, name] of [['admin','ADMIN_EMAIL','ADMIN_PASSWORD','ParkEase Admin'],['staff','STAFF_EMAIL','STAFF_PASSWORD','Gate Operator']]) {
    const email = process.env[emailKey]?.toLowerCase(), pass = process.env[passKey];
    if (!email || !pass || pass.length < 10) throw new Error(`Set ${emailKey} and ${passKey} (minimum 10 chars)`);
    if (!await User.exists({ email })) {
      await User.create({ name, email, role, passwordHash: await bcrypt.hash(pass, 12) });
      console.log(`Created ${role}: ${email}`);
    } else console.log(`Existing account untouched: ${email}`);
  }
  const examples = [
    { name: 'CyberSquare Office Parking', city: 'Tech Park Campus', area: 'Tower A & B', address: 'Plot 14, Silicon Office Boulevard, Cyber Workspace Hub', kind: 'office', lat: 28.6216, lng: 77.3636, cover: 'mint', features: ['24/7 Security Gate','CCTV Surveillance','Covered Parking','EV Fast Charging','Automated Barrier','Accessible Parking'], prices: { car: 30, bike: 15, ev: 45, accessible: 20 } },
    { name: 'Skyline City Parking', city: 'Delhi', area: 'Connaught Place', address: 'Demo Parking, Connaught Place, New Delhi', kind: 'mall', lat: 28.6328, lng: 77.2197, cover: 'violet', features: ['CCTV','24/7 Security','Covered','EV Charging'], prices: { car: 50, bike: 25, ev: 70, accessible: 40 } },
    { name: 'MetroLink Parking Hub', city: 'Delhi', area: 'Rajiv Chowk', address: 'Demo Parking, Rajiv Chowk, New Delhi', kind: 'station', lat: 28.6323, lng: 77.2195, cover: 'blue', features: ['CCTV','Fast Entry','EV Charging'], prices: { car: 35, bike: 15, ev: 55, accessible: 30 } },
    { name: 'Orion Business Parking', city: 'Noida', area: 'Sector 62', address: 'Demo Parking, Sector 62, Noida', kind: 'office', lat: 28.6216, lng: 77.3636, cover: 'mint', features: ['CCTV','Covered','Security'], prices: { car: 45, bike: 20, ev: 65, accessible: 35 } },
    { name: 'AeroPark Terminal', city: 'Delhi', area: 'Aerocity', address: 'Demo Parking, Aerocity, New Delhi', kind: 'airport', lat: 28.5566, lng: 77.1001, cover: 'orange', features: ['24/7 Security','CCTV','EV Charging','Covered'], prices: { car: 80, bike: 40, ev: 100, accessible: 60 } }
  ];
  for (const item of examples) {
    let loc = await Location.findOne({ name: item.name });
    if (!loc) { loc = await Location.create(item); console.log(`Added demo location: ${loc.name}`); }
    if (await Slot.countDocuments({ location: loc.id }) === 0) {
      const slots = [];
      for (const [floor, zone, kinds] of [
        ['G', 'A', ['car','car','car','car','car','car','ev','ev','accessible','accessible','bike','bike','bike','bike']],
        ['B1', 'B', ['car','car','car','car','car','car','car','car','ev','ev','bike','bike','bike','bike']],
        ['B2', 'C', ['car','car','car','car','car','car','car','car','bike','bike','bike','bike']]
      ]) {
        kinds.forEach((kind, i) => slots.push({ location: loc.id, floor, zone, number: `${zone}${i + 1}`, kind, state: 'available' }));
      }
      await Slot.insertMany(slots); console.log(`Added ${slots.length} slots to ${loc.name}`);
    }
  }
  console.log('Seed complete. All locations are fictional demo venues, not real parking operators.');
  await mongoose.disconnect();
}
seed().catch(e => { console.error(e.message); process.exit(1); });
