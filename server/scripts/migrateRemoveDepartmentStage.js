/**
 * One-off migration: run this ONCE, before or immediately after
 * deploying the "remove department review stage" change, against any
 * database that might already have a Report sitting at the old
 * 'under_review_department' status.
 *
 * That status was removed from config/workflow.js STATES entirely, so
 * without this migration those specific reports would be stuck: no
 * transition/role-map entry exists to move them forward any more, the
 * Exam Officer's UI stops rendering an escalate button for that status,
 * and the Mongoose enum will reject re-saving the document as-is.
 *
 * This moves each one straight to 'under_review_college' — exactly
 * where a Department-stage case would have gone next anyway — stamps
 * assignedCollege the same way escalateCase() does, and writes a
 * StatusHistory entry so the audit trail shows the migration happened
 * (actorRole: 'system_migration') instead of silently rewriting history.
 *
 * Usage (from the server/ directory):
 *   node scripts/migrateRemoveDepartmentStage.js
 *
 * Safe to run more than once — the query only matches reports still at
 * the old status, so a second run finds nothing to do.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Report = require('../models/Report');
const StatusHistory = require('../models/StatusHistory');
const User = require('../models/User');
const { STATES } = require('../config/workflow');
const { ROLES } = require('../config/roles');
const { resolveCollegeForEscalation } = require('../services/collegeResolver');

async function run() {
  await connectDB();

  // Raw string, not STATES.UNDER_REVIEW_DEPARTMENT — that constant no
  // longer exists now that the state has been removed from workflow.js.
  const stuck = await Report.find({ status: 'under_review_department' });

  if (stuck.length === 0) {
    console.log('No reports found at under_review_department — nothing to migrate.');
    await mongoose.connection.close();
    return;
  }

  // StatusHistory.actorId is `required: true` (it's an append-only audit
  // trail attributing every change to a real user) — a migration has no
  // human actor, so this attributes the entries to the first active
  // Super Admin account instead of passing null, which would fail that
  // validation and abort every migrated report's audit entry (the report
  // itself would still migrate, since its own save() doesn't touch
  // StatusHistory, but the audit trail would go silently unwritten).
  const systemActor = await User.findOne({ role: ROLES.SUPER_ADMIN, status: 'active' });
  if (!systemActor) {
    console.warn(
      'No active Super Admin account found — reports will still be migrated, but no StatusHistory audit entry can be written for it (actorId is required). Create a Super Admin first if you want the audit trail to reflect this migration.'
    );
  }

  console.log(`Found ${stuck.length} report(s) at under_review_department. Migrating to under_review_college...`);

  for (const report of stuck) {
    const fromStatus = report.status;
    report.status = STATES.UNDER_REVIEW_COLLEGE;
    if (!report.assignedCollege) {
      // No specific acting officer for a migration — resolveCollegeForEscalation
      // falls back to examDetails.faculty when no officer object is passed.
      report.assignedCollege = resolveCollegeForEscalation(null, report);
    }
    await report.save();

    if (systemActor) {
      await StatusHistory.create({
        reportId: report._id,
        fromStatus,
        toStatus: report.status,
        actorId: systemActor._id,
        actorRole: 'system_migration',
        note: 'Migrated off the removed under_review_department stage directly to under_review_college.',
      });
    }

    console.log(`  Migrated report ${report._id}`);
  }

  console.log('Migration complete.');
  await mongoose.connection.close();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
