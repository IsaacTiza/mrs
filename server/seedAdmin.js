// Run once: node seedAdmin.js
// Creates the first super_admin account directly, bypassing the normal
// admin-only creation route (which needs a super_admin to already exist).
require('dotenv').config({path:require('path').join(__dirname, '.env')});
const mongoose = require('mongoose');
const User = require('./models/User');
const { ROLES } = require('./config/roles');

console.log('cwd:', process.cwd());
console.log('MONGO_URI: ', process.env.MONGO_URI)

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Super Admin';

  if (!email || !password) {
    console.error('Usage: node seedAdmin.js <email> <password> [name]');
    process.exit(1);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`User ${email} already exists (role: ${existing.role}, status: ${existing.status})`);
    process.exit(0);
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: ROLES.SUPER_ADMIN,
    status: 'active',
  });

  console.log(`Created super_admin: ${user.email}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
