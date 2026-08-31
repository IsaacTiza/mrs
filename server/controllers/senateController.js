const User = require('../models/User');
const { ROLES } = require('../config/roles');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/senate/members — Senate President's oversight directory
// (spec: "he can see all the senate board members" — this is a plain
// user directory, not per-case data; per-case review notes are read
// from GET /api/reports/:reportId instead, which now populates
// senateReviews.memberId, see reportController.getReportById).
const listSenateMembers = asyncHandler(async (req, res) => {
  const members = await User.find({ role: ROLES.SENATE_BOARD })
    .select('name email status createdAt')
    .sort({ name: 1 });
  res.json({ success: true, data: members });
});

module.exports = { listSenateMembers };
