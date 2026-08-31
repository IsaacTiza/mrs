const mongoose = require('mongoose');
const sseHub = require('../services/sseHub');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true },
    type: { type: String, required: true }, // e.g. 'status_change', 'meeting_requested', 'verdict_passed'
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Live push (spec: "live serving for notifications... so there won't be
// any need to refresh the page to get updates"). Hooked on the MODEL,
// not threaded through notificationService.js's two call sites
// (notifyStatusChange / notifyCaseParticipants) individually — a
// post-save hook fires for every Notification.create() regardless of
// which function or future call site creates it, so this can't
// silently go stale the way manually adding a push call at each site
// could. NotificationBell.jsx listens for this exact event name/shape.
notificationSchema.post('save', function pushLive(doc) {
  sseHub.sendToUser(doc.userId, 'notification', {
    _id: doc._id,
    reportId: doc.reportId,
    type: doc.type,
    message: doc.message,
    read: doc.read,
    createdAt: doc.createdAt,
  });
});

module.exports = mongoose.model('Notification', notificationSchema);
