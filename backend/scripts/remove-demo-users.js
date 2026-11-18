require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../src/models');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const del = await User.deleteMany({
    email: { $in: ['admin@parkease.local', 'staff@parkease.local'] }
  });
  console.log('Deleted', del.deletedCount, 'demo admin/staff users');

  const remaining = await User.find({}, { email: 1, role: 1 }).lean();
  console.log('Remaining users:', remaining.length);
  remaining.forEach(u => console.log(' ', u.role, u.email));

  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
