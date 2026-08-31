const jwt = require('jsonwebtoken');
const User = require('../models/User');
const LoginEvent = require('../models/LoginEvent');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../config/roles');

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

// POST /api/auth/register — public. Invigilator ONLY (spec §9 step 1).
// Any other role in the body is rejected outright, not silently downgraded,
// so a malicious client can't probe which behavior the server falls back to.
const registerInvigilator = asyncHandler(async (req, res) => {
  const { name, email, password, requestedRole } = req.body;

  if (requestedRole && requestedRole !== ROLES.INVIGILATOR) {
    throw new AppError('Public self-registration is only available for the Invigilator role', 403);
  }
  if (!name || !email || !password) {
    throw new AppError('name, email, and password are required', 400);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new AppError('An account with this email already exists', 409);

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: ROLES.INVIGILATOR,
    status: 'pending_approval',
  });

  res.status(201).json({
    success: true,
    message: 'Registration received — pending Super Admin approval',
    data: { id: user._id, email: user.email, status: user.status },
  });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('email and password are required', 400);

  const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };
  // Students log in with the email captured on the report + their matric
  // number as the default password — but there's no UI moment where a
  // student is ever told or asked to set up an "email" of their own, so
  // in practice they only ever know their matric number. Accepting either
  // as the identifier here (matricNumber lookup is exact-match, not
  // lowercased, since matric numbers aren't case-normalized) means the
  // login screen doesn't have to force a choice the student was never
  // given.
  const identifier = email.trim();
  const user = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { matricNumber: identifier }],
  });

  if (!user || !(await user.comparePassword(password))) {
    await LoginEvent.create({
      email,
      userRef: user?._id,
      success: false,
      reason: 'invalid_credentials',
      ...meta,
    });
    throw new AppError('Invalid credentials', 401);
  }
  if (user.status !== 'active') {
    await LoginEvent.create({
      email,
      userRef: user._id,
      success: false,
      reason: `account_${user.status}`,
      ...meta,
    });
    throw new AppError(`Account is ${user.status} — cannot log in yet`, 403);
  }

  await LoginEvent.create({ email, userRef: user._id, success: true, reason: 'ok', ...meta });

  const token = signToken(user);
  res.json({ success: true, data: { token, user } });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ success: true, data: user });
});

module.exports = { registerInvigilator, login, getMe };
