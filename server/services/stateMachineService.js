const StatusHistory = require('../models/StatusHistory');
const AppError = require('../utils/AppError');
const { isValidTransition, ESCALATION_ROLE } = require('../config/workflow');
const { notifyStatusChange } = require('./notificationService');

/**
 * Moves a report from its current status to a new one, IF the transition
 * is legal per config/workflow.js AND the actor's role is the one allowed
 * to trigger it at this stage. Every transition is logged (spec §5:
 * "Every transition logged: who, when, from-state, to-state, note").
 *
 * This is the ONLY function in the codebase allowed to change
 * report.status — controllers never set it directly, so the audit trail
 * can never be bypassed by a future engineer taking a shortcut.
 */
async function transitionReport({ report, toState, actor, note = '' }) {
  const fromState = report.status;

  if (!isValidTransition(fromState, toState)) {
    throw new AppError(`Illegal transition: ${fromState} -> ${toState}`, 400);
  }

  const requiredRole = ESCALATION_ROLE[fromState];
  if (requiredRole && actor.role !== requiredRole) {
    throw new AppError(`Only ${requiredRole} may escalate from ${fromState}`, 403);
  }

  report.status = toState;
  await report.save();

  await StatusHistory.create({
    reportId: report._id,
    fromStatus: fromState,
    toStatus: toState,
    actorId: actor.id,
    actorRole: actor.role,
    note,
  });

  // Non-blocking: a failed notification must never roll back a state
  // transition that already committed to the DB and the audit log.
  notifyStatusChange({ report, fromState, toState }).catch((err) => {
    console.error('Notification dispatch failed (non-blocking):', err.message);
  });

  return report;
}

module.exports = { transitionReport };
