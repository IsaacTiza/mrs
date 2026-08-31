const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const sseHub = require('../services/sseHub');

const router = express.Router();
router.use(protect);

// GET /api/notifications/stream — Server-Sent Events. Every logged-in
// client opens exactly one of these (see client/src/api/sseClient.js)
// and receives:
//  - `notification` events: this user's own new notifications, pushed
//    the instant Notification.create() runs anywhere in the app (see
//    the post-save hook on models/Notification.js) — NotificationBell.jsx
//    prepends these live instead of waiting on its poll interval.
//  - `audit` events: broadcast to every connected super_admin only, on
//    every new StatusHistory/LoginEvent row (see the post-save hooks on
//    those two models) — AuditLog.jsx prepends these to page 1.
// requirePermission isn't used here (unlike other admin-only routes)
// because this single stream serves every role — the `audit` events are
// simply never sent to a connection whose role isn't 'super_admin' (see
// sseHub.broadcastToRole), so no extra authorization check is needed on
// top of the existing `protect` (valid, active-account JWT) already
// required for this whole router.
router.get('/stream', (req, res) => {
  const close = sseHub.addClient({ userId: req.user.id, role: req.user.role }, res);
  req.on('close', close);
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, data: notifications });
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id }, // ownership check inline — users can only mark their own read
      { read: true },
      { new: true }
    );
    res.json({ success: true, data: notification });
  })
);

module.exports = router;
