/**
 * Central, config-driven permission matrix.
 *
 * This is the single source of truth for "who can do what" per §4 of the
 * locked spec. Controllers/routes NEVER hardcode `if (role === 'senate_board')`
 * for authorization decisions — they call hasPermission(role, action) instead.
 *
 * Why this matters operationally: when the school's real malpractice policy
 * resolves the PENDING meeting-request question for Exam Officer, you flip
 * ONE boolean below (or set it via env/DB later) and the feature activates
 * with zero code changes anywhere else in the system.
 */

const ROLES = Object.freeze({
  INVIGILATOR: 'invigilator',
  EXAM_OFFICER: 'exam_officer',
  // Split out from EXAM_OFFICER — College and Registry are their own
  // review bodies with their own accounts, not extra hats worn by the
  // department-level Exam Officer (see workflow.js STAGE_ROLE_MAP).
  COLLEGE_OFFICER: 'college_officer',
  REGISTRY_OFFICER: 'registry_officer',
  SENATE_BOARD: 'senate_board',
  // New role (2026-08-28 revision): chairs the Senate Board. Sees every
  // Senate Board member and their per-case review notes, and is now the
  // ONLY role that may record the case's final verdict (see PASS_VERDICT
  // below) — ordinary Senate Board members submit a review/note instead
  // (see SUBMIT_SENATE_REVIEW), they no longer pass verdicts themselves.
  SENATE_PRESIDENT: 'senate_president',
  SUPER_ADMIN: 'super_admin',
  STUDENT: 'student',
});

// Feature flags — policy-dependent, not hardcoded logic (spec §4 RESOLVED #2).
const POLICY_FLAGS = {
  // Default: senate-only. Flip to true once JOSTUM's real policy confirms
  // Exam Officer may request meetings during dept/college/registry review.
  examOfficerCanRequestMeeting: false,
};

// action -> array of roles allowed to perform it.
// Ownership/stage checks (does THIS role own or currently hold THIS case)
// happen separately in middleware/ownership.js — this matrix only answers
// "is this role class-level allowed to attempt the action at all".
const PERMISSIONS = {
  CREATE_REPORT: [ROLES.INVIGILATOR],
  VIEW_OWN_REPORT: [ROLES.INVIGILATOR, ROLES.STUDENT],
  VIEW_STAGE_REPORTS: [
    ROLES.EXAM_OFFICER,
    ROLES.COLLEGE_OFFICER,
    ROLES.REGISTRY_OFFICER,
    ROLES.SENATE_BOARD,
    ROLES.SENATE_PRESIDENT,
    ROLES.SUPER_ADMIN,
  ],
  VIEW_ALL_REPORTS: [ROLES.SUPER_ADMIN],
  ANNOTATE_REPORT: [
    ROLES.EXAM_OFFICER,
    ROLES.COLLEGE_OFFICER,
    ROLES.REGISTRY_OFFICER,
    ROLES.SENATE_BOARD,
    ROLES.SENATE_PRESIDENT,
  ],
  // Escalation is class-level "can this role ever push a case forward at
  // all" — WHICH stage a given role may push from is resource-level and
  // enforced separately by workflow.js ESCALATION_ROLE, checked again
  // inside transitionReport(). Listing all three officer roles here is
  // safe; a College Officer still can't escalate a Department-stage case
  // because that check compares against the case's *current* stage.
  ESCALATE_CASE: [ROLES.EXAM_OFFICER, ROLES.COLLEGE_OFFICER, ROLES.REGISTRY_OFFICER],
  // One of the Exam Officer's stage actions (spec: officer must be able to
  // request the student appear before the case can move on) — separate
  // from ANNOTATE_REPORT because it's Exam-Officer-only, not Senate too.
  MANAGE_STUDENT_INTERVIEW: [ROLES.EXAM_OFFICER],
  // College Officer's stage action: endorsing the Department's findings
  // before forwarding to Registry (see reportController.endorseCollegeReview).
  MANAGE_COLLEGE_REVIEW: [ROLES.COLLEGE_OFFICER],
  // Registry Officer's stage actions: record verification + documentation
  // certification before forwarding to Senate. Also reused (2026-08-28)
  // for the Registry "request/complete student interview" endpoints —
  // same role, same stage, no need for a separate permission constant.
  MANAGE_REGISTRY_REVIEW: [ROLES.REGISTRY_OFFICER],
  // A Senate Board member's stage action once a case reaches Senate:
  // submit their own review note (NOT a verdict — spec revision
  // 2026-08-28: members no longer record individual verdicts, only the
  // Senate President does, see PASS_VERDICT). Gates the President's
  // ability to pass a verdict (reportController.passVerdict requires
  // every active Senate Board member to have submitted one of these
  // first).
  SUBMIT_SENATE_REVIEW: [ROLES.SENATE_BOARD],
  // Directory of Senate Board members + their per-case review notes —
  // Senate President's oversight view (spec: "he can see all the senate
  // board members only").
  VIEW_SENATE_MEMBERS: [ROLES.SENATE_PRESIDENT, ROLES.SUPER_ADMIN],
  // Spec revision (2026-08-28): only the Senate President records the
  // case's final verdict now — ordinary Senate Board members submit a
  // review instead (SUBMIT_SENATE_REVIEW above).
  PASS_VERDICT: [ROLES.SENATE_PRESIDENT],
  // Closing a case after its verdict was recorded is left open to both
  // — an ordinary Senate Board member or the President can close it out;
  // unlike PASS_VERDICT this was never meant to require the President
  // specifically, so it gets its own permission rather than sharing
  // PASS_VERDICT's now-narrower role list.
  CLOSE_CASE: [ROLES.SENATE_BOARD, ROLES.SENATE_PRESIDENT],
  APPROVE_REGISTRATION: [ROLES.SUPER_ADMIN],
  MANAGE_USERS: [ROLES.SUPER_ADMIN],
  // Delete/edit evidence: intentionally has NO role listed — nobody gets it,
  // ever (spec §4 + §10). This is enforced twice: no route exists for it,
  // AND even if one were added by mistake, this permission would deny it.
  DELETE_EDIT_EVIDENCE: [],
};

/**
 * @param {string} role
 * @param {string} action - one of the PERMISSIONS keys above
 * @returns {boolean}
 */
function hasPermission(role, action) {
  const allowed = PERMISSIONS[action];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Meeting-request permission is special-cased because it's policy-flag
 * gated rather than a flat role list (spec §4 RESOLVED #2).
 */
function canRequestMeeting(role) {
  if (role === ROLES.SENATE_BOARD) return true;
  if (role === ROLES.EXAM_OFFICER) return POLICY_FLAGS.examOfficerCanRequestMeeting;
  return false;
}

module.exports = { ROLES, PERMISSIONS, POLICY_FLAGS, hasPermission, canRequestMeeting };
