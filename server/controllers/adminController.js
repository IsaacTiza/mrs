const User = require('../models/User');
const StatusHistory = require('../models/StatusHistory');
const LoginEvent = require('../models/LoginEvent');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../config/roles');

const ADMIN_CREATABLE_ROLES = [
  ROLES.EXAM_OFFICER,
  ROLES.COLLEGE_OFFICER,
  ROLES.REGISTRY_OFFICER,
  ROLES.SENATE_BOARD,
  ROLES.SENATE_PRESIDENT,
  ROLES.SUPER_ADMIN,
];

// POST /api/admin/users — Super Admin only. Creates Exam Officer / Senate
// Board / Super Admin accounts (spec §3: "admin-created only").
const createStaffUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, department, college } = req.body;

  if (!ADMIN_CREATABLE_ROLES.includes(role)) {
    throw new AppError(
      `role must be one of: ${ADMIN_CREATABLE_ROLES.join(', ')}`,
      400
    );
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new AppError('An account with this email already exists', 409);

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
    // Only meaningful for exam_officer — scopes their queue in getStageQueue.
    // Leave unset for an exam officer who should see every department.
    department: role === ROLES.EXAM_OFFICER ? department : undefined,
    // Only meaningful for college_officer — scopes their queue the same
    // way. Leave unset for a college officer who should see every college.
    college: role === ROLES.COLLEGE_OFFICER ? college : undefined,
    status: 'active', // admin-created accounts don't need approval — admin IS the approval
  });

  res.status(201).json({ success: true, data: user });
});

// GET /api/admin/users/pending — list invigilator self-registrations awaiting approval
const listPendingUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ status: 'pending_approval' });
  res.json({ success: true, data: users });
});

// PATCH /api/admin/users/:userId/approve
const approveUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) throw new AppError('User not found', 404);
  if (user.status !== 'pending_approval') {
    throw new AppError(`User is already ${user.status}`, 400);
  }
  user.status = 'active';
  await user.save();
  res.json({ success: true, data: user });
});

// PATCH /api/admin/users/:userId/status — enable/disable any account
const setUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'disabled'].includes(status)) {
    throw new AppError('status must be "active" or "disabled"', 400);
  }
  const user = await User.findByIdAndUpdate(req.params.userId, { status }, { new: true });
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, data: user });
});

// GET /api/admin/users — Super Admin directory: every user in the system,
// grouped by role (spec addition: "super admin should be able to see all
// the users categorized by their roles"). Sorted within each group by name
// so the list reads consistently regardless of creation order.
const listAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ role: 1, name: 1 });

  const grouped = users.reduce((acc, u) => {
    if (!acc[u.role]) acc[u.role] = [];
    acc[u.role].push(u);
    return acc;
  }, {});

  res.json({ success: true, data: grouped, total: users.length });
});

// GET /api/admin/audit-logs — Super Admin full oversight (spec §4 RESOLVED #1).
// Merges report status-change history AND login events (success + failed
// attempts) into one feed sorted by time, so "who did what" and "who
// logged in / tried to" live in one place instead of two.
const getAuditLogs = asyncHandler(async (req, res) => {
  // Pagination (spec fix: an unpaginated 500-row cap meant years of use
  // would silently drop everything past the newest 500 events, with no
  // way to page back into older activity at all).
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  // This feed merges two independently-sorted collections (status
  // changes + login events), so a naive skip/limit applied separately to
  // each collection would return the wrong page whenever the two
  // sources interleave in time. Standard property of merging sorted
  // lists: the top K items of the UNION are always contained within the
  // top K items of EACH source list individually (an item ranked <=K in
  // the union has fewer than K items ahead of it in the union, so fewer
  // than K ahead of it in any subset of the union too). So fetching the
  // top K = page*limit rows from each side, merging, and slicing the
  // [skip, skip+limit) window out of that merged list is exactly
  // correct, not an approximation — at the cost of re-fetching from the
  // top on every page, which is the accepted trade-off for a feed this
  // size (see getAuditLogs count query below for the real total).
  const K = skip + limit;

  const [statusLogs, loginLogs, statusCount, loginCount] = await Promise.all([
    StatusHistory.find().sort({ timestamp: -1 }).limit(K).populate('actorId', 'name email role'),
    LoginEvent.find().sort({ timestamp: -1 }).limit(K).populate('userRef', 'name email role'),
    StatusHistory.countDocuments(),
    LoginEvent.countDocuments(),
  ]);

  const merged = [
    ...statusLogs.map((l) => ({
      id: `status-${l._id}`,
      type: 'status_change',
      timestamp: l.timestamp,
      actor: l.actorId,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      note: l.note,
      reportId: l.reportId,
    })),
    ...loginLogs.map((l) => ({
      id: `login-${l._id}`,
      type: 'login',
      timestamp: l.timestamp,
      actor: l.userRef || { email: l.email },
      success: l.success,
      reason: l.reason,
      ip: l.ip,
      userAgent: l.userAgent,
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const total = statusCount + loginCount;
  res.json({
    success: true,
    data: merged.slice(skip, skip + limit),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

module.exports = { createStaffUser, listPendingUsers, listAllUsers, approveUser, setUserStatus, getAuditLogs };
