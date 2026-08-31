const mongoose = require('mongoose');
const sseHub = require('../services/sseHub');

const statusHistorySchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  fromStatus: { type: String, required: true },
  toStatus: { type: String, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note: { type: String, default: '' },
});

// Append-only audit trail — no update/delete route should ever touch this.
statusHistorySchema.pre('findOneAndUpdate', function blockMutation(next) {
  next(new Error('StatusHistory entries are append-only.'));
});

// Live audit feed (spec: "add a live serving for notifications... this
// will help mainly in places like the Admin Audit blocks"). Hooked here
// rather than in reportController.js, which has 10+ separate
// StatusHistory.create() call sites (escalate, request-meeting,
// annotate, close, verdict, etc.) — a post-save hook fires for every one
// of them automatically, present and future, instead of relying on each
// call site remembering to also push an event. Shape matches
// adminController.getAuditLogs' status-change row exactly, so
// AuditLog.jsx can prepend it straight into the list it already renders.
statusHistorySchema.post('save', async function pushLive(doc) {
  await doc.populate('actorId', 'name email role');
  sseHub.broadcastToRole('super_admin', 'audit', {
    id: `status-${doc._id}`,
    type: 'status_change',
    timestamp: doc.timestamp,
    actor: doc.actorId,
    fromStatus: doc.fromStatus,
    toStatus: doc.toStatus,
    note: doc.note,
    reportId: doc.reportId,
  });
});

module.exports = mongoose.model('StatusHistory', statusHistorySchema);
