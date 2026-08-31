const Notification = require('../models/Notification');
const User = require('../models/User');
const { ROLES } = require('../config/roles');
const { STATES, STAGE_ROLE_MAP } = require('../config/workflow');

// Standalone email service — Resend by default. Swappable later (spec §2
// calls this "demo grade, swappable later") by changing only this file;
// nothing else in the app imports Resend directly.
let resendClient = null;
function getResendClient() {
  if (!resendClient) {
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email skipped — no RESEND_API_KEY set] to=${to} subject="${subject}"`);
    return;
  }
  const resend = getResendClient();
  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
}

const STAGE_LABELS = {
  submitted: 'Submitted',
  under_review_college: 'Under College Review',
  under_review_registry: 'Under Registry Review',
  under_review_senate: 'Under Senate Review',
  meeting_requested: 'Meeting Requested',
  verdict_passed: 'Verdict Passed',
  closed: 'Closed',
};

/**
 * Finds the officer(s) who should be told a case just landed on their
 * desk. This was previously missing entirely — notifyStatusChange only
 * ever notified the student and the filing invigilator, so every officer
 * role (Exam Officer, College Officer, Registry Officer, Senate Board)
 * never received a single in-app notification no matter how many cases
 * moved through their queue, which is why the Notification collection
 * looked "empty" from any officer account even though rows existed for
 * students/invigilators.
 *
 * Scoped the same way the queues themselves are scoped (spec: an Exam
 * Officer/College Officer with a department/college assigned only cares
 * about cases in it; unscoped officers get everything, matching
 * getStageQueue's fallback). Registry and Senate are centralized bodies,
 * so every active account in that role is notified.
 */
async function findStageRecipients(toState, report) {
  const role = STAGE_ROLE_MAP[toState];
  if (!role) return [];

  const filter = { role, status: 'active' };
  if (role === ROLES.EXAM_OFFICER && report.examDetails?.department) {
    // Match either an officer scoped to this exact department, or an
    // unscoped officer (department unset) who watches every department.
    filter.$or = [{ department: report.examDetails.department }, { department: { $exists: false } }, { department: '' }];
  }
  if (role === ROLES.COLLEGE_OFFICER && report.assignedCollege) {
    filter.$or = [{ college: report.assignedCollege }, { college: { $exists: false } }, { college: '' }];
  }

  return User.find(filter).select('_id email');
}

/**
 * Fires on every relevant status change (spec §6, Notification entity:
 * "Triggers: email + in-app record, on every relevant status change").
 * Notifies the student the case concerns, the invigilator who filed it,
 * AND the officer(s) who now own the case at its new stage.
 */
async function notifyStatusChange({ report, fromState, toState }) {
  const message = `Case status changed: ${STAGE_LABELS[fromState] || fromState} -> ${
    STAGE_LABELS[toState] || toState
  }`;

  const stageOfficers = await findStageRecipients(toState, report);
  const recipients = [
    ...[report.studentRef, report.chiefInvigilator?.userRef].filter(Boolean).map((id) => ({ _id: id })),
    ...stageOfficers,
  ];

  await Promise.all(
    recipients.map(async (recipient) => {
      await Notification.create({
        userId: recipient._id,
        reportId: report._id,
        type: 'status_change',
        message,
      });

      // recipient may already carry an email (stage officers, fetched
      // with .select('_id email')) — avoids a second lookup for those;
      // student/invigilator entries only have _id, so fetch them.
      const email = recipient.email || (await User.findById(recipient._id).select('email'))?.email;
      if (email) {
        await sendEmail({
          to: email,
          subject: 'Exam Malpractice Case — Status Update',
          html: `<p>${message}</p>`,
        });
      }
    })
  );
}

/**
 * Broad "everyone who ever touched this case" fan-out (spec addition
 * 2026-08-28: "when the president passes the final verdict everyone
 * related to that case will see what the president has passed").
 *
 * notifyStatusChange() above only reaches the student, the filing
 * invigilator, and whichever role CURRENTLY owns the destination stage
 * (via STAGE_ROLE_MAP) — but VERDICT_PASSED has no STAGE_ROLE_MAP entry
 * (nobody "owns" it as a queue), so on a verdict, none of the Exam
 * Officer, College Officer, Registry Officer, or the individual Senate
 * Board members who reviewed the case were ever notified — only the
 * student + invigilator were. This walks every actor reference actually
 * stamped onto the report itself instead of relying on a stage/role
 * lookup, so it reaches everyone who concretely acted on this specific
 * case, not just whoever happens to hold a role today.
 *
 * Called from reportController.passVerdict, in addition to (not instead
 * of) the automatic notifyStatusChange() that transitionReport() already
 * fires for every transition — the student/invigilator get two related
 * notifications for a verdict (one generic status-change, one verdict-
 * specific with detail), which is intentional, not a bug: the verdict is
 * the single most important notification in the whole case lifecycle.
 */
async function notifyCaseParticipants({ report, message, type }) {
  const ids = new Set();
  const add = (v) => v && ids.add(v.toString());

  add(report.studentRef);
  add(report.chiefInvigilator?.userRef);
  add(report.assistantInvigilator?.userRef);
  add(report.examOfficerReceived?.userRef);
  add(report.collegeReview?.endorsedBy);
  add(report.registryReview?.recordVerifiedBy);
  add(report.registryReview?.documentationCertifiedBy);
  (report.senateReviews || []).forEach((r) => add(r.memberId));
  add(report.verdictPassedBy);

  if (ids.size === 0) return;

  const users = await User.find({ _id: { $in: Array.from(ids) } }).select('_id email');

  await Promise.all(
    users.map(async (u) => {
      await Notification.create({ userId: u._id, reportId: report._id, type, message });
      if (u.email) {
        await sendEmail({
          to: u.email,
          subject: 'Exam Malpractice Case — Verdict Recorded',
          html: `<p>${message}</p>`,
        });
      }
    })
  );
}

module.exports = { notifyStatusChange, notifyCaseParticipants, sendEmail };
