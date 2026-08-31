const mongoose = require('mongoose');
const { STATES, VERDICT_ENUM } = require('../config/workflow');

const examDetailsSchema = new mongoose.Schema(
  {
    faculty: { type: String, required: true },
    department: { type: String, required: true },
    programme: { type: String, required: true },
    level: { type: String, required: true },
    session: { type: String, required: true },
    semester: { type: String, required: true },
    courseCode: { type: String, required: true },
    courseTitle: { type: String, required: true },
    examDate: { type: Date, required: true },
    timeStart: { type: String, required: true },
    timeEnd: { type: String, required: true },
    venue: { type: String, required: true },
    seatNumber: { type: String },
  },
  { _id: false }
);

const signatureSchema = new mongoose.Schema(
  {
    // Signature image lives in Cloudinary (like exhibit photos), NOT as a
    // base64 blob on the Report document — keeps case reads fast and the
    // document size bounded. Only the resulting URL + hash live here.
    imageUrl: { type: String, required: true },
    imageHash: { type: String }, // SHA-256, same integrity pattern as Exhibit.photoHash
    signedAt: { type: Date, required: true },
  },
  { _id: false }
);

// Shared shape for College/Registry's "request to see student" action
// (spec addition 2026-08-28) — same idea as the Exam Officer's
// top-level `studentInterview` field below, but scoped per-stage inside
// collegeReview/registryReview since College and Registry are separate
// review bodies that can each independently need to see the student.
// Unlike the Exam Officer's version, this one also captures the
// officer's preferred date/time/venue for the meeting (spec: "with
// their preferred time, date and venue").
const stageInterviewSchema = new mongoose.Schema(
  {
    requested: { type: Boolean, default: false },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date },
    note: { type: String },
    preferredDate: { type: String },
    preferredTime: { type: String },
    venue: { type: String },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { _id: false }
);

// One Senate Board member's review note on a case (spec revision
// 2026-08-28: members no longer pass individual verdicts — only the
// Senate President does, see `verdict`/`verdictPassedBy` below). The
// Senate President's ability to pass a final verdict is gated on every
// currently-active Senate Board member having one of these on file —
// see reportController.passVerdict.
const senateReviewSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, required: true },
    reviewedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    examDetails: { type: examDetailsSchema, required: true },

    studentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    offenceTypes: { type: [String], required: true },
    offenceOther: { type: String },

    narrative: { type: String, required: true },

    candidateStatement: { type: String },
    candidateDeclined: { type: Boolean, default: false },

    immediateActions: { type: [String], default: [] },

    chiefInvigilator: {
      name: { type: String, required: true },
      userRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    assistantInvigilator: {
      name: { type: String },
      userRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    candidateSignature: { type: signatureSchema, required: true },

    // Filled later, at Exam Officer review stage (spec §7, excluded-at-creation list)
    examOfficerReceived: {
      userRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      signedAt: { type: Date },
    },

    // One of the Exam Officer's stage actions: request that the student
    // come in to be seen/interviewed before the case is pushed on. This is
    // a report-level flag, NOT a workflow.js state — it never touches
    // report.status, so it can't interfere with the linear state machine.
    // The student sees this on their case page as soon as it's set.
    studentInterview: {
      requested: { type: Boolean, default: false },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      requestedAt: { type: Date },
      note: { type: String },
      completed: { type: Boolean, default: false },
      completedAt: { type: Date },
    },

    // Set at the moment the case escalates from Department to College
    // review (see services/collegeResolver.js + reportController.escalateCase).
    // Resolved from the acting Exam Officer's own department -> college
    // mapping (falling back to examDetails.faculty if that officer's
    // account has no department assigned). Drives College Officer queue
    // scoping the same way examDetails.department drives Exam Officer
    // queue scoping — a case-file fact, set once and never edited after.
    assignedCollege: { type: String, trim: true },

    // College Officer's stage action (see reportController.endorseCollegeReview):
    // endorses the Department's findings before the case moves to Registry.
    collegeReview: {
      endorsed: { type: Boolean, default: false },
      endorsedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      endorsedAt: { type: Date },
      note: { type: String },
      // College's own "request to see student" action (spec addition
      // 2026-08-28) — blocks escalate-to-Registry while pending, same
      // as the Exam Officer's studentInterview field blocks
      // escalate-to-College (see reportController.escalateCase).
      interview: { type: stageInterviewSchema, default: () => ({}) },
    },

    // Registry Officer's two stage actions (see reportController
    // verifyRegistryRecord / certifyRegistryDocumentation): record check
    // and documentation sign-off before the case moves to Senate.
    registryReview: {
      recordVerified: { type: Boolean, default: false },
      recordVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      recordVerifiedAt: { type: Date },
      documentationCertified: { type: Boolean, default: false },
      documentationCertifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      documentationCertifiedAt: { type: Date },
      // Registry's own "request to see student" action (spec addition
      // 2026-08-28) — blocks escalate-to-Senate while pending, same
      // pattern as collegeReview.interview above.
      interview: { type: stageInterviewSchema, default: () => ({}) },
    },

    // Each Senate Board member's review note on the case (spec revision
    // 2026-08-28) — NOT individual verdicts. One entry per member,
    // upserted by reportController.submitSenateReview. Gates whether the
    // Senate President is allowed to pass a final verdict (every active
    // Senate Board member must have one entry here first).
    senateReviews: { type: [senateReviewSchema], default: [] },

    // Filled later, by the Senate President (spec revision 2026-08-28 —
    // previously any Senate Board member could record this; now only the
    // President does, once every active Senate Board member has
    // submitted a senateReviews entry above).
    verdict: { type: String, enum: VERDICT_ENUM },
    suspensionDuration: { type: String }, // required only if verdict === 'suspension', enforced in controller
    verdictNotes: { type: String },
    verdictPassedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verdictPassedAt: { type: Date },

    status: {
      type: String,
      enum: Object.values(STATES),
      default: STATES.SUBMITTED,
      index: true,
    },
  },
  { timestamps: true }
);

// candidateStatement OR candidateDeclined must be present — enforced at
// the schema layer, not just the controller, so it holds even for
// scripts/migrations that bypass the controller.
reportSchema.pre('validate', function enforceCandidateResponse(next) {
  if (!this.candidateStatement && !this.candidateDeclined) {
    return next(
      new Error('Report requires either candidateStatement or candidateDeclined=true')
    );
  }
  if (this.verdict === 'suspension' && !this.suspensionDuration) {
    return next(new Error('suspensionDuration is required when verdict is "suspension"'));
  }
  next();
});

module.exports = mongoose.model('Report', reportSchema);
