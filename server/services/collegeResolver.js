const { facultyForDepartment } = require('../config/academicMap');

/**
 * Resolves the college a case should be routed to when it escalates from
 * Department review to College review.
 *
 * Priority order:
 *   1. The ACTING Exam Officer's own assigned department, mapped to its
 *      parent college — this is the actual reporting line ("the exam
 *      officer is under a department which is under a college", per the
 *      2026-08-25 spec clarification), so it wins whenever the officer
 *      has a department set.
 *   2. If the acting officer has no department assigned (an unscoped
 *      officer who can see every department's queue), fall back to the
 *      REPORT's own examDetails.faculty — the incident's own college —
 *      since there's no officer-specific department to resolve from.
 *   3. If neither resolves to a known college (e.g. a legacy/free-typed
 *      department string that predates academicMap.js), return null and
 *      leave assignedCollege unset — the College Officer queue falls back
 *      to "unscoped, sees everything" in that case, same as it does today
 *      for an Exam Officer with no department.
 *
 * @param {{ department?: string }} actingOfficer
 * @param {{ examDetails?: { faculty?: string } }} report
 * @returns {string|null}
 */
function resolveCollegeForEscalation(actingOfficer, report) {
  if (actingOfficer?.department) {
    const fromOfficer = facultyForDepartment(actingOfficer.department);
    if (fromOfficer) return fromOfficer;
  }
  return report?.examDetails?.faculty || null;
}

module.exports = { resolveCollegeForEscalation };
