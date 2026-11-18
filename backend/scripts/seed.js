require('dotenv').config();
const mongoose = require('mongoose');
const { Location, Slot } = require('../src/models');

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error('Set backend/.env first (MONGODB_URI missing)');
  await mongoose.connect(process.env.MONGODB_URI);

  // ============================
  // MULTI-CITY PARKING LOCATIONS
  // ============================
  const examples = [
    // ----- DELHI -----
    {
      name: 'Skyline City Parking',
      city: 'Delhi',
      area: 'Connaught Place',
      address: 'Block A, Connaught Place, New Delhi',
      pincode: '110001',
      kind: 'mall',
      lat: 28.6328, lng: 77.2197,
      cover: 'violet',
      features: ['CCTV', '24/7 Security', 'Covered Parking', 'EV Charging'],
      prices: { car: 50, bike: 25, ev: 70, accessible: 40 }
    },
    {
      name: 'MetroLink Parking Hub',
      city: 'Delhi',
      area: 'Rajiv Chowk',
      address: 'Near Rajiv Chowk Metro Station, New Delhi',
      pincode: '110001',
      kind: 'station',
      lat: 28.6323, lng: 77.2195,
      cover: 'blue',
      features: ['CCTV', 'Fast Entry', 'EV Charging'],
      prices: { car: 35, bike: 15, ev: 55, accessible: 30 }
    },
    {
      name: 'AeroPark Terminal Parking',
      city: 'Delhi',
      area: 'Aerocity',
      address: 'IGI Airport Area, Aerocity, New Delhi',
      pincode: '110037',
      kind: 'airport',
      lat: 28.5566, lng: 77.1001,
      cover: 'orange',
      features: ['24/7 Security', 'CCTV', 'EV Charging', 'Covered', 'Valet Available'],
      prices: { car: 80, bike: 40, ev: 100, accessible: 60 }
    },
    {
      name: 'Delhi Tech Office Parking',
      city: 'Delhi',
      area: 'Nehru Place',
      address: 'Nehru Place IT Hub, New Delhi',
      pincode: '110019',
      kind: 'office',
      lat: 28.5494, lng: 77.2534,
      cover: 'mint',
      features: ['CCTV', 'Covered Parking', 'Security Gate', 'EV Charging'],
      prices: { car: 40, bike: 20, ev: 60, accessible: 30 }
    },

    // ----- BAREILLY -----
    {
      name: 'Phoenix Mall Parking',
      city: 'Bareilly',
      area: 'Civil Lines',
      address: 'Near Phoenix Mall, Civil Lines, Bareilly',
      pincode: '243001',
      kind: 'mall',
      lat: 28.3670, lng: 79.4304,
      cover: 'violet',
      features: ['CCTV', 'Covered Parking', 'Security Guard'],
      prices: { car: 25, bike: 10, ev: 40, accessible: 20 }
    },
    {
      name: 'Bareilly Junction Parking',
      city: 'Bareilly',
      area: 'Station Road',
      address: 'Bareilly Junction Railway Station, Station Road',
      pincode: '243003',
      kind: 'station',
      lat: 28.3488, lng: 79.4172,
      cover: 'blue',
      features: ['CCTV', '24/7 Security', 'Open Parking'],
      prices: { car: 20, bike: 10, ev: 30, accessible: 15 }
    },
    {
      name: 'CyberSquare Office Parking',
      city: 'Bareilly',
      area: 'Pilibhit Bypass',
      address: 'CyberSquare Tech Park, Pilibhit Bypass, Bareilly',
      pincode: '243006',
      kind: 'office',
      lat: 28.3800, lng: 79.4500,
      cover: 'mint',
      features: ['24/7 Security Gate', 'CCTV Surveillance', 'Covered Parking', 'EV Fast Charging', 'Automated Barrier', 'Accessible Parking'],
      prices: { car: 30, bike: 15, ev: 45, accessible: 20 }
    },

    // ----- NOIDA -----
    {
      name: 'Orion Business Parking',
      city: 'Noida',
      area: 'Sector 62',
      address: 'Orion Business Park, Sector 62, Noida',
      pincode: '201301',
      kind: 'office',
      lat: 28.6216, lng: 77.3636,
      cover: 'mint',
      features: ['CCTV', 'Covered', 'Security', 'EV Charging'],
      prices: { car: 45, bike: 20, ev: 65, accessible: 35 }
    },
    {
      name: 'DLF Mall Parking',
      city: 'Noida',
      area: 'Sector 18',
      address: 'DLF Mall of India, Sector 18, Noida',
      pincode: '201301',
      kind: 'mall',
      lat: 28.5700, lng: 77.3270,
      cover: 'orange',
      features: ['Multi-Level', 'CCTV', 'EV Charging', 'Valet'],
      prices: { car: 60, bike: 30, ev: 80, accessible: 45 }
    },

    // ----- LUCKNOW -----
    {
      name: 'Hazratganj Public Parking',
      city: 'Lucknow',
      area: 'Hazratganj',
      address: 'Near GPO, Hazratganj, Lucknow',
      pincode: '226001',
      kind: 'public',
      lat: 26.8508, lng: 80.9469,
      cover: 'pink',
      features: ['CCTV', 'Open Parking', 'Guard'],
      prices: { car: 20, bike: 10, ev: 30, accessible: 15 }
    },
    {
      name: 'Gomti Nagar Office Complex Parking',
      city: 'Lucknow',
      area: 'Gomti Nagar',
      address: 'IT City, Gomti Nagar Extension, Lucknow',
      pincode: '226010',
      kind: 'office',
      lat: 26.8550, lng: 81.0150,
      cover: 'mint',
      features: ['CCTV', 'Covered', 'EV Charging', 'Automated Entry', 'Security'],
      prices: { car: 35, bike: 15, ev: 50, accessible: 25 }
    }
  ];

  for (const item of examples) {
    let loc = await Location.findOne({ name: item.name });
    if (!loc) {
      loc = await Location.create(item);
      console.log(`Added location: ${loc.name} (${loc.city})`);
    } else {
      console.log(`Existing location untouched: ${loc.name}`);
    }

    // Add slots if none exist for this location
    if (await Slot.countDocuments({ location: loc.id }) === 0) {
      const slots = [];
      for (const [floor, zone, kinds] of [
        ['G', 'A', ['car', 'car', 'car', 'car', 'car', 'car', 'ev', 'ev', 'accessible', 'accessible', 'bike', 'bike', 'bike', 'bike']],
        ['B1', 'B', ['car', 'car', 'car', 'car', 'car', 'car', 'car', 'car', 'ev', 'ev', 'bike', 'bike', 'bike', 'bike']],
        ['B2', 'C', ['car', 'car', 'car', 'car', 'car', 'car', 'car', 'car', 'bike', 'bike', 'bike', 'bike']]
      ]) {
        kinds.forEach((kind, i) =>
          slots.push({ location: loc.id, floor, zone, number: `${zone}${i + 1}`, kind, state: 'available' })
        );
      }
      await Slot.insertMany(slots);
      console.log(`  → Added ${slots.length} slots to ${loc.name}`);
    }
  }

  console.log('\n✅ Seed complete!');
  console.log('Cities seeded: Delhi, Bareilly, Noida, Lucknow');
  console.log('\n👉 Create your admin account at: /admin/login → "Create Account" tab');
  await mongoose.disconnect();
}

seed().catch(e => { console.error(e.message); process.exit(1); });
