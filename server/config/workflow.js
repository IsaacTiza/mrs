/**
 * State machine config (spec §5).
 *
 * Strictly linear for now — no dismissal/branch states at Department,
 * College, or Registry, matching the model policy that these stages
 * "cannot resolve or dismiss internally". If JOSTUM's real policy allows
 * early dismissal later, add a branch transition to STATES/TRANSITIONS
 * below — that's a config change, not a rewrite of stateMachineService.
 */

const { ROLES } = require('./roles');

const STATES = Object.freeze({
  SUBMITTED: 'submitted',
  // 'under_review_department' removed (spec revision 2026-08-28) — the
  // Exam Officer now escalates straight from SUBMITTED to
  // UNDER_REVIEW_COLLEGE, one action, one button. IMPORTANT: any report
  // already sitting at the old 'under_review_department' status in an
  // existing database will NOT be auto-migrated by this change — run
  // scripts/migrateRemoveDepartmentStage.js once against that database
  // before (or immediately after) deploying this code, or those specific
  // cases will be stuck (no transition/role map entry can move them, and
  // the Mongoose enum will reject re-saving them as-is).
  UNDER_REVIEW_COLLEGE: 'under_review_college',
  UNDER_REVIEW_REGISTRY: 'under_review_registry',
  UNDER_REVIEW_SENATE: 'under_review_senate',
  MEETING_REQUESTED: 'meeting_requested', // optional sub-state, does not replace UNDER_REVIEW_SENATE
  VERDICT_PASSED: 'verdict_passed',
  CLOSED: 'closed',
});

// Linear forward transitions. Each entry: current state -> next state.
// meeting_requested is a side sub-state reachable from and returning to
// UNDER_REVIEW_SENATE, not a step in the main line.
const TRANSITIONS = {
  [STATES.SUBMITTED]: [STATES.UNDER_REVIEW_COLLEGE],
  [STATES.UNDER_REVIEW_COLLEGE]: [STATES.UNDER_REVIEW_REGISTRY],
  [STATES.UNDER_REVIEW_REGISTRY]: [STATES.UNDER_REVIEW_SENATE],
  [STATES.UNDER_REVIEW_SENATE]: [STATES.MEETING_REQUESTED, STATES.VERDICT_PASSED],
  [STATES.MEETING_REQUESTED]: [STATES.UNDER_REVIEW_SENATE],
  [STATES.VERDICT_PASSED]: [STATES.CLOSED],
  [STATES.CLOSED]: [],
};

// Which system role owns each "under_review_*" stage. Department, College,
// and Registry are now three distinct review bodies with their own
// accounts (previously all three were bundled under Exam Officer — that
// bundling is what made "push to college/registry" a no-op, since nobody
// but the Exam Officer could ever act on those stages).
const STAGE_ROLE_MAP = {
  [STATES.SUBMITTED]: ROLES.EXAM_OFFICER,
  [STATES.UNDER_REVIEW_COLLEGE]: ROLES.COLLEGE_OFFICER,
  [STATES.UNDER_REVIEW_REGISTRY]: ROLES.REGISTRY_OFFICER,
  [STATES.UNDER_REVIEW_SENATE]: ROLES.SENATE_BOARD,
  [STATES.MEETING_REQUESTED]: ROLES.SENATE_BOARD,
};

// Which role is allowed to ESCALATE *out of* a given state (move it forward).
// Senate does not "escalate" — it passes verdict, handled separately.
const ESCALATION_ROLE = {
  [STATES.SUBMITTED]: ROLES.EXAM_OFFICER,
  [STATES.UNDER_REVIEW_COLLEGE]: ROLES.COLLEGE_OFFICER,
  [STATES.UNDER_REVIEW_REGISTRY]: ROLES.REGISTRY_OFFICER,
  // Was previously unset, which meant transitionReport() (the ONLY place
  // that changes report.status) skipped its role check entirely for the
  // meeting_requested -> under_review_senate step — accessLevel() still
  // kept this stage senate-only in practice, but the check belongs here
  // explicitly rather than relying on that as the only line of defense.
  [STATES.MEETING_REQUESTED]: ROLES.SENATE_BOARD,
};

const VERDICT_ENUM = Object.freeze([
  'dismissed_no_case',
  'warning',
  'result_withheld',
  'result_cancelled',
  'suspension',
  'expulsion_recommended',
]);

function isValidTransition(fromState, toState) {
  const allowedNext = TRANSITIONS[fromState];
  return Array.isArray(allowedNext) && allowedNext.includes(toState);
}

module.exports = {
  STATES,
  TRANSITIONS,
  STAGE_ROLE_MAP,
  ESCALATION_ROLE,
  VERDICT_ENUM,
  isValidTransition,
};
