const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

// Verifies the JWT and attaches { id, role } to req.user. Also re-checks
// the user's status in the DB (not just what was in the token at login
// time) so a Super Admin disabling an account takes effect immediately,
// not only after the old token expires.
const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Not authenticated — no token provided', 401);
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new AppError('Invalid or expired token', 401);
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new AppError('User no longer exists', 401);
  if (user.status !== 'active') {
    throw new AppError(`Account is ${user.status} — access denied`, 403);
  }

  // department/college are included here (not just role/id) because
  // getStageQueue relies on req.user.department / req.user.college to
  // scope an Exam Officer's / College Officer's queue to their own
  // department/college — leaving either off req.user silently breaks that
  // scoping even though the User record has it set. Also carry name/email
  // so controllers/UI never need a second DB round-trip just to greet
  // the logged-in user by name.
  req.user = {
    id: user._id.toString(),
    role: user.role,
    department: user.department,
    college: user.college,
    name: user.name,
    email: user.email,
  };
  next();
});

module.exports = { protect };
