const express = require('express');
const { listSenateMembers } = require('../controllers/senateController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

router.use(protect);

router.get('/members', requirePermission('VIEW_SENATE_MEMBERS'), listSenateMembers);

module.exports = router;
