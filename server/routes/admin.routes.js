const express = require('express');
const {
  createStaffUser,
  listPendingUsers,
  approveUser,
  setUserStatus,
  getAuditLogs,
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

router.use(protect);

router.post('/users', requirePermission('MANAGE_USERS'), createStaffUser);
router.get('/users/pending', requirePermission('APPROVE_REGISTRATION'), listPendingUsers);
router.patch('/users/:userId/approve', requirePermission('APPROVE_REGISTRATION'), approveUser);
router.patch('/users/:userId/status', requirePermission('MANAGE_USERS'), setUserStatus);
router.get('/audit-logs', requirePermission('VIEW_ALL_REPORTS'), getAuditLogs);

module.exports = router;
