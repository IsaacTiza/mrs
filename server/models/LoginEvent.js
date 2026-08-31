const mongoose = require('mongoose');
const sseHub = require('../services/sseHub');

// One row per login attempt, success or failure. This is what actually
// answers "who logged in, when" and "who tried to break in" — StatusHistory
// only ever logged report stage transitions, never auth events.
const loginEventSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    userRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // unset if email didn't match any account
    success: { type: Boolean, required: true },
    reason: { type: String }, // e.g. 'invalid_credentials', 'account_disabled', 'ok'
    ip: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

// Live audit feed — see the matching hook on StatusHistory.js for the
// full reasoning (model-level hook so it can't drift out of sync with
// authController.login's three separate LoginEvent.create() call
// sites). Shape matches adminController.getAuditLogs' login row.
loginEventSchema.post('save', async function pushLive(doc) {
  if (doc.userRef) await doc.populate('userRef', 'name email role');
  sseHub.broadcastToRole('super_admin', 'audit', {
    id: `login-${doc._id}`,
    type: 'login',
    timestamp: doc.timestamp,
    actor: doc.userRef || { email: doc.email },
    success: doc.success,
    reason: doc.reason,
    ip: doc.ip,
    userAgent: doc.userAgent,
  });
});

module.exports = mongoose.model('LoginEvent', loginEventSchema);
