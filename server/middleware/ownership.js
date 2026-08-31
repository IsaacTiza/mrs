const Report = require('../models/Report');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../config/roles');
const { STATES } = require('../config/workflow');

// Each internal review role is only ever "full" (can act) at its own
// stage, and "read" for every stage after that (so they can still see
// how the case turned out) — never before their own stage runs, and
// never full again once it's moved past them.
// Department stage removed (spec revision 2026-08-28) — SUBMITTED is now
// the Exam Officer's only active stage; they escalate straight to College.
const EXAM_OFFICER_ACTIVE_STAGES = [STATES.SUBMITTED];
const EXAM_OFFICER_READ_STAGES = [
  STATES.UNDER_REVIEW_COLLEGE,
  STATES.UNDER_REVIEW_REGISTRY,
  STATES.UNDER_REVIEW_SENATE,
  STATES.MEETING_REQUESTED,
  STATES.VERDICT_PASSED,
  STATES.CLOSED,
];

const COLLEGE_OFFICER_ACTIVE_STAGES = [STATES.UNDER_REVIEW_COLLEGE];
const COLLEGE_OFFICER_READ_STAGES = [
  STATES.UNDER_REVIEW_REGISTRY,
  STATES.UNDER_REVIEW_SENATE,
  STATES.MEETING_REQUESTED,
  STATES.VERDICT_PASSED,
  STATES.CLOSED,
];

const REGISTRY_OFFICER_ACTIVE_STAGES = [STATES.UNDER_REVIEW_REGISTRY];
const REGISTRY_OFFICER_READ_STAGES = [
  STATES.UNDER_REVIEW_SENATE,
  STATES.MEETING_REQUESTED,
  STATES.VERDICT_PASSED,
  STATES.CLOSED,
];

// Senate's own active stages now include verdict_passed — Senate is the
// role that calls /close (spec: closing a case after its own verdict is
// still Senate's job), so accessLevel must stay 'full' through that step.
// Previously this list stopped at meeting_requested, which meant the
// instant passVerdict() ran, accessLevel(senate_board, thisReport) fell
// straight to 'none' — Senate lost the ability to even VIEW the case they
// had just ruled on, let alone close it (this is the "Forbidden — you do
// not have access to this case" bug reported against a Senate-Review case:
// the case had already had a verdict passed, so status was 'verdict_passed',
// which fell outside the old SENATE_STAGES list).
const SENATE_STAGES = [STATES.UNDER_REVIEW_SENATE, STATES.MEETING_REQUESTED, STATES.VERDICT_PASSED];
// Read-only spectate stage for Senate once THEY close the case out. Used
// by accessLevel()'s stageAccess() below — deliberately just [CLOSED],
// NOT verdict_passed, because verdict_passed is still 'full' access via
// SENATE_STAGES above (so /close stays callable); adding it here too
// would be redundant for accessLevel (the active-stage check already
// wins) but would misdescribe this list's actual meaning.
const SENATE_READ_STAGES = [STATES.CLOSED];
// Separate list for the "Passed Cases" spectate query specifically (bug:
// a Senate President who just passed a verdict couldn't find the case
// under Passed Cases — it was still 'verdict_passed', which
// SENATE_READ_STAGES never included, since that list only means
// "read-only for accessLevel purposes", not "Senate is done with this
// case"). Unlike the other three internal-review roles, where "moved
// past my stage" and "read-only for me" are the same set of statuses,
// for Senate they diverge: Senate stays 'full' through verdict_passed,
// but from a "has Senate acted on this case" standpoint that verdict IS
// the action being looked for in Passed Cases, so it belongs here even
// though it isn't in SENATE_READ_STAGES.
const SENATE_PASSED_STAGES = [STATES.VERDICT_PASSED, STATES.CLOSED];

// Shared shape for the three internal-review roles above: 'full' at their
// own active stage(s), 'read' at any stage that comes after, 'none' otherwise
// (including before their stage — a case that hasn't reached them yet).
function stageAccess(status, activeStages, readStages) {
  if (activeStages.includes(status)) return 'full';
  if (readStages.includes(status)) return 'read';
  return 'none';
}

/**
 * Computes what a given user can do with a given report.
 * Returns 'full' | 'read' | 'none'.
 *
 * This is the single place resource-level rules live (spec §10: role AND
 * ownership, checked together, per route). Controllers ask this instead
 * of re-deriving stage logic themselves.
 */
function accessLevel(user, report) {
  const { id, role } = user;

  if (role === ROLES.SUPER_ADMIN) return 'full'; // full oversight, all content incl. evidence

  if (role === ROLES.INVIGILATOR) {
    const isCreator =
      report.chiefInvigilator?.userRef?.toString() === id ||
      report.assistantInvigilator?.userRef?.toString() === id;
    // Spec §4: "View own submitted reports (read-only after submit)"
    return isCreator ? 'read' : 'none';
  }

  if (role === ROLES.STUDENT) {
    return report.studentRef?.toString() === id ? 'read' : 'none';
  }

  if (role === ROLES.EXAM_OFFICER) {
    return stageAccess(report.status, EXAM_OFFICER_ACTIVE_STAGES, EXAM_OFFICER_READ_STAGES);
  }

  if (role === ROLES.COLLEGE_OFFICER) {
    return stageAccess(report.status, COLLEGE_OFFICER_ACTIVE_STAGES, COLLEGE_OFFICER_READ_STAGES);
  }

  if (role === ROLES.REGISTRY_OFFICER) {
    return stageAccess(report.status, REGISTRY_OFFICER_ACTIVE_STAGES, REGISTRY_OFFICER_READ_STAGES);
  }

  // Senate President (spec revision 2026-08-28) shares the exact same
  // stage window as an ordinary Senate Board member — they need to see
  // (and pass the final verdict on) the same cases, just with a
  // narrower set of actions once inside that window (enforced by
  // PASS_VERDICT/SUBMIT_SENATE_REVIEW in config/roles.js, not here).
  if (role === ROLES.SENATE_BOARD || role === ROLES.SENATE_PRESIDENT) {
    // "Only cases reaching them" (spec §4) — nothing before senate stage.
    // 'full' through verdict_passed (so /close remains callable), 'read'
    // once THEY close it (spectate their own resolved cases), 'none'
    // before the case has ever reached Senate.
    return stageAccess(report.status, SENATE_STAGES, SENATE_READ_STAGES);
  }

  return 'none';
}

/**
 * Loads the report by req.params.reportId, computes access level, and
 * enforces a minimum required level ('read' or 'full'). Attaches the
 * loaded report to req.report and the computed level to req.accessLevel
 * so the controller doesn't need to reload it or re-derive rules.
 */
function requireReportAccess(minLevel = 'read') {
  return asyncHandler(async (req, res, next) => {
    const report = await Report.findById(req.params.reportId);
    if (!report) throw new AppError('Report not found', 404);

    const level = accessLevel(req.user, report);

    if (level === 'none') {
      throw new AppError('Forbidden — you do not have access to this case', 403);
    }
    if (minLevel === 'full' && level !== 'full') {
      throw new AppError('Forbidden — this case is read-only for your role at its current stage', 403);
    }

    req.report = report;
    req.accessLevel = level;
    next();
  });
}

module.exports = {
  accessLevel,
  requireReportAccess,
  EXAM_OFFICER_ACTIVE_STAGES,
  EXAM_OFFICER_READ_STAGES,
  COLLEGE_OFFICER_ACTIVE_STAGES,
  COLLEGE_OFFICER_READ_STAGES,
  REGISTRY_OFFICER_ACTIVE_STAGES,
  REGISTRY_OFFICER_READ_STAGES,
  SENATE_STAGES,
  SENATE_READ_STAGES,
  SENATE_PASSED_STAGES,
};
