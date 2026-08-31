const AppError = require('../utils/AppError');
const { hasPermission } = require('../config/roles');

/**
 * requirePermission('ESCALATE_CASE') — checks the requester's role against
 * the central permission matrix. This is CLASS-level authorization only
 * ("can an Exam Officer ever do this") — resource-level ownership/stage
 * checks are a separate middleware (see ownership.js), matching spec §10:
 * "every route checks role AND resource ownership, not role alone."
 */
function requirePermission(action) {
  return (req, res, next) => {
    if (!req.user) throw new AppError('Not authenticated', 401);
    if (!hasPermission(req.user.role, action)) {
      throw new AppError('Forbidden — your role cannot perform this action', 403);
    }
    next();
  };
}

module.exports = { requirePermission };
