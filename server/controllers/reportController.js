const Report = require('../models/Report');
const Exhibit = require('../models/Exhibit');
const Witness = require('../models/Witness');
const StatusHistory = require('../models/StatusHistory');
const Notification = require('../models/Notification');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { transitionReport } = require('../services/stateMachineService');
const { uploadBuffer } = require('../services/uploadService');
const { resolveCollegeForEscalation } = require('../services/collegeResolver');
const { notifyCaseParticipants } = require('../services/notificationService');
const { ROLES, canRequestMeeting } = require('../config/roles');
const { STATES, ESCALATION_ROLE, VERDICT_ENUM } = require('../config/workflow');
const {
  EXAM_OFFICER_ACTIVE_STAGES,
  COLLEGE_OFFICER_ACTIVE_STAGES,
  REGISTRY_OFFICER_ACTIVE_STAGES,
  EXAM_OFFICER_READ_STAGES,
  COLLEGE_OFFICER_READ_STAGES,
  REGISTRY_OFFICER_READ_STAGES,
  SENATE_STAGES,
  SENATE_PASSED_STAGES,
} = require('../middleware/ownership');

/**
 * POST /api/reports — Tabs 1-9 submitted together as one payload from the
 * client wizard (client validates step-by-step; server validates the
 * whole thing atomically on final submit — this is standard practice:
 * never trust client-side "step confirmed" state as a security boundary).
 *
 * Tab 2 requirement: student account created atomically here, default
 * password = matric number (spec §7). "Atomically" means if the student
 * User.create succeeds but the Report.create fails, we must not leave an
 * orphan student account behind — handled with a manual compensating
 * delete rather than a Mongo multi-doc transaction, since this deployment
 * targets a single MongoDB Atlas replica set on the free/shared tier where
 * transactions add latency without a matching integrity payoff at this
 * project's scale. Documented tradeoff, not an oversight.
 */
const createReport = asyncHandler(async (req, res) => {
  const {
    examDetails,
    candidate, // { fullName, matricNumber, programme, level, phone, email } — Tab 2
    offenceTypes,
    offenceOther,
    narrative,
    candidateStatement,
    candidateDeclined,
    immediateActions,
    chiefInvigilatorName,
    assistantInvigilatorName,
    assistantInvigilatorUserId,
    candidateSignature, // { imageUrl, imageHash, signedAt } — already uploaded via /reports/upload-signature
    exhibits, // [{ description, tagNumber, photoUrl, photoHash, custodyLocation }]
    witnesses, // [{ fullName, designation, staffOrRegNo }]
  } = req.body;

  if (!candidate?.matricNumber || !candidate?.email) {
    throw new AppError('Candidate matric number and email are required', 400);
  }
  if (!candidateSignature?.imageUrl) {
    throw new AppError('Candidate signature is required before submission', 400);
  }

  let studentUser = await User.findOne({ matricNumber: candidate.matricNumber });
  let createdStudentThisRequest = false;

  if (!studentUser) {
    const passwordHash = await User.hashPassword(candidate.matricNumber); // default password = matric number
    studentUser = await User.create({
      name: candidate.fullName,
      email: candidate.email,
      passwordHash,
      role: ROLES.STUDENT,
      status: 'active', // students don't go through approval — created via a witnessed incident, not self-service
      matricNumber: candidate.matricNumber,
    });
    createdStudentThisRequest = true;
  }

  // Everything from here down is one logical unit: Report + Exhibits +
  // Witnesses + StatusHistory either all exist or none of them do. Without
  // a Mongo transaction (documented tradeoff above), that means every step
  // after Report.create() must run inside the SAME try/catch as the report
  // itself, and the catch must undo whatever already landed — not just the
  // student User from the block above. A partial write (report saved, then
  // an exhibit fails validation) must never survive an error response to
  // the client — "the request failed" has to mean "nothing happened."
  let report;
  try {
    report = await Report.create({
      examDetails,
      studentRef: studentUser._id,
      offenceTypes,
      offenceOther,
      narrative,
      candidateStatement,
      candidateDeclined,
      immediateActions,
      chiefInvigilator: { name: chiefInvigilatorName, userRef: req.user.id },
      assistantInvigilator: assistantInvigilatorName
        ? { name: assistantInvigilatorName, userRef: assistantInvigilatorUserId }
        : undefined,
      candidateSignature,
      status: STATES.SUBMITTED,
    });

    if (Array.isArray(exhibits) && exhibits.length > 0) {
      await Exhibit.insertMany(
        exhibits.map((e) => ({ ...e, reportId: report._id, uploadedAt: new Date() })),
        { ordered: true }
      );
    }
    if (Array.isArray(witnesses) && witnesses.length > 0) {
      await Witness.insertMany(witnesses.map((w) => ({ ...w, reportId: report._id })));
    }

    await StatusHistory.create({
      reportId: report._id,
      fromStatus: 'none',
      toStatus: STATES.SUBMITTED,
      actorId: req.user.id,
      actorRole: req.user.role,
      note: 'Report submitted by invigilator',
    });
  } catch (err) {
    // Compensate everything that made it into the DB before the failure,
    // in reverse order, best-effort. If the report itself never saved,
    // report is undefined and there's nothing under it to clean up.
    if (report?._id) {
      await Promise.all([
        Exhibit.deleteMany({ reportId: report._id }),
        Witness.deleteMany({ reportId: report._id }),
        StatusHistory.deleteMany({ reportId: report._id }),
      ]).catch((cleanupErr) =>
        console.error('Compensation cleanup failed for report', report._id, cleanupErr)
      );
      await Report.findByIdAndDelete(report._id).catch((cleanupErr) =>
        console.error('Failed to delete orphaned report', report._id, cleanupErr)
      );
    }
    // Don't leave a dangling student account behind if it was created
    // moments ago in this same request and the report failed. If the
    // student account already existed (repeat offender), never touch it.
    if (createdStudentThisRequest) {
      await User.findByIdAndDelete(studentUser._id);
    }
    throw err;
  }

  res.status(201).json({ success: true, data: report });
});

// POST /api/reports/upload-exhibit — multipart, one photo per call (spec
// §7 Tab 5: "a separate photo upload per row, not one combined upload")
const uploadExhibitPhoto = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);
  const { url, hash } = await uploadBuffer(req.file.buffer, 'malpractice-system/exhibits');
  res.json({ success: true, data: { photoUrl: url, photoHash: hash } });
});

// POST /api/reports/upload-signature — candidate's drawn signature, Tab 9
const uploadSignatureImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded', 400);
  const { url, hash } = await uploadBuffer(req.file.buffer, 'malpractice-system/signatures');
  res.json({ success: true, data: { imageUrl: url, imageHash: hash, signedAt: new Date() } });
});

// GET /api/reports/my-submissions — Invigilator's own reports, read-only view
const getMySubmissions = asyncHandler(async (req, res) => {
  const reports = await Report.find({ 'chiefInvigilator.userRef': req.user.id }).sort({
    createdAt: -1,
  });
  res.json({ success: true, data: reports });
});

// GET /api/reports/my-case — Student's own case status only
const getMyCase = asyncHandler(async (req, res) => {
  const reports = await Report.find({ studentRef: req.user.id }).sort({ createdAt: -1 });
  res.json({ success: true, data: reports });
});

// GET /api/reports/stage-queue — Exam Officer / College Officer / Registry
// Officer / Senate Board queue, scoped to whichever stage(s) belong to
// the caller's role.
const getStageQueue = asyncHandler(async (req, res) => {
  let statuses;
  if (req.user.role === ROLES.EXAM_OFFICER) statuses = EXAM_OFFICER_ACTIVE_STAGES;
  else if (req.user.role === ROLES.COLLEGE_OFFICER) statuses = COLLEGE_OFFICER_ACTIVE_STAGES;
  else if (req.user.role === ROLES.REGISTRY_OFFICER) statuses = REGISTRY_OFFICER_ACTIVE_STAGES;
  // Reuses the same SENATE_STAGES list ownership.js grants 'full' access
  // from — now includes verdict_passed, so a case Senate just ruled on
  // stays in their active queue until they call /close on it, instead of
  // vanishing from the queue the moment a verdict is recorded. Senate
  // President shares this exact queue (same stage window, see
  // middleware/ownership.js accessLevel).
  else if (req.user.role === ROLES.SENATE_BOARD || req.user.role === ROLES.SENATE_PRESIDENT)
    statuses = SENATE_STAGES;
  else throw new AppError('This endpoint is for stage-review or Senate Board queues', 403);

  const filter = { status: { $in: statuses } };
  // Scope Exam Officers to their assigned department, if they have one set
  // — an officer with no department assigned still sees the full queue,
  // so this can be rolled out per-officer without breaking anyone.
  if (req.user.role === ROLES.EXAM_OFFICER && req.user.department) {
    filter['examDetails.department'] = req.user.department;
  }
  // Scope College Officers to their assigned college the same way, using
  // the college resolved onto the report at escalation time (see
  // services/collegeResolver.js). A College Officer with no college
  // assigned still sees every case that reaches College Review — same
  // unscoped fallback as Exam Officer/department above. Registry is a
  // single centralized body (spec: not split per-college/department), so
  // it always sees every case that reaches its stage.
  if (req.user.role === ROLES.COLLEGE_OFFICER && req.user.college) {
    filter.assignedCollege = req.user.college;
  }

  const reports = await Report.find(filter).sort({ createdAt: 1 });
  res.json({ success: true, data: reports });
});

// GET /api/reports/passed-cases — "spectate" queue (spec addition,
// 2026-08-25): every internal review role should be able to look back at
// cases that already moved past their own stage, since the case concerned
// them when it was in their hands. Reuses the exact READ_STAGES lists
// ownership.js already computes 'read' access from, so this list and what
// a role can actually open are guaranteed to agree — no separate query to
// drift out of sync with the access-control rule.
const getPassedCases = asyncHandler(async (req, res) => {
  let statuses;
  if (req.user.role === ROLES.EXAM_OFFICER) statuses = EXAM_OFFICER_READ_STAGES;
  else if (req.user.role === ROLES.COLLEGE_OFFICER) statuses = COLLEGE_OFFICER_READ_STAGES;
  else if (req.user.role === ROLES.REGISTRY_OFFICER) statuses = REGISTRY_OFFICER_READ_STAGES;
  // SENATE_PASSED_STAGES, not SENATE_READ_STAGES — Senate stays 'full'
  // access (not 'read') through verdict_passed so /close remains
  // callable (see ownership.js SENATE_STAGES), so SENATE_READ_STAGES
  // alone (just [closed]) undercounts what belongs in THIS list: a case
  // whose verdict Senate just passed has had Senate's main action taken
  // on it and should show up here right away, not only once it's later
  // closed too.
  else if (req.user.role === ROLES.SENATE_BOARD || req.user.role === ROLES.SENATE_PRESIDENT)
    statuses = SENATE_PASSED_STAGES;
  else throw new AppError('This endpoint is for stage-review or Senate Board roles', 403);

  const filter = { status: { $in: statuses } };
  if (req.user.role === ROLES.EXAM_OFFICER && req.user.department) {
    filter['examDetails.department'] = req.user.department;
  }
  if (req.user.role === ROLES.COLLEGE_OFFICER && req.user.college) {
    filter.assignedCollege = req.user.college;
  }

  const reports = await Report.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: reports });
});

// GET /api/reports/all — Super Admin only, org-wide
const getAllReports = asyncHandler(async (req, res) => {
  const reports = await Report.find().sort({ createdAt: -1 });
  res.json({ success: true, data: reports });
});

// GET /api/reports/:reportId — gated by requireReportAccess('read') in the route
const getReportById = asyncHandler(async (req, res) => {
  const [exhibits, witnesses, history] = await Promise.all([
    Exhibit.find({ reportId: req.report._id }),
    Witness.find({ reportId: req.report._id }),
    StatusHistory.find({ reportId: req.report._id }).sort({ timestamp: 1 }),
  ]);
  // Populated here (not stored redundantly on Report) so staff reviewing a
  // case — and anyone running a demo — can see how to actually log in as
  // this student (matric number doubles as their password) without
  // digging into the database directly.
  await req.report.populate([
    { path: 'studentRef', select: 'name email matricNumber' },
    // Lets the Senate President's case view show WHO each review note
    // came from, not just a bare ObjectId (spec: President "can see all
    // the senate board members" and their notes on a case).
    { path: 'senateReviews.memberId', select: 'name email' },
  ]);

  // Not persisted on the Report document — computed fresh on every read
  // so it can never drift from the live set of active Senate Board
  // accounts (an account created/disabled after some members already
  // reviewed changes this count immediately, which is deliberate: see
  // reportController.passVerdict for the same live count used to gate
  // the President's action).
  const activeSenateMemberCount = await User.countDocuments({
    role: ROLES.SENATE_BOARD,
    status: 'active',
  });

  res.json({
    success: true,
    data: {
      report: req.report,
      exhibits,
      witnesses,
      history,
      accessLevel: req.accessLevel,
      senateReviewProgress: {
        submitted: req.report.senateReviews.length,
        total: activeSenateMemberCount,
      },
    },
  });
});

// PATCH /api/reports/:reportId/received — Exam Officer marks receipt on
// first review (spec §7: examOfficerReceived filled at Exam Officer stage)
const markExamOfficerReceived = asyncHandler(async (req, res) => {
  req.report.examOfficerReceived = { userRef: req.user.id, signedAt: new Date() };
  await req.report.save();
  res.json({ success: true, data: req.report });
});

// POST /api/reports/:reportId/request-student-interview — Exam Officer
// stage action: flags that the student must be seen before the case moves
// on. No status change (same reasoning as annotateReport below) — this is
// a case-file fact, not a workflow stage. Surfaces on the student's own
// case page as soon as it's set, and in the case History tab for everyone
// with access.
const requestStudentInterview = asyncHandler(async (req, res) => {
  const { note } = req.body;

  req.report.studentInterview = {
    requested: true,
    requestedBy: req.user.id,
    requestedAt: new Date(),
    note: note || '',
    completed: false,
    completedAt: undefined,
  };
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: note ? `Requested to see the student — ${note}` : 'Requested to see the student',
  });

  await Notification.create({
    userId: req.report.studentRef,
    reportId: req.report._id,
    type: 'student_interview_requested',
    message: 'The Exam Officer handling your case has requested to see you. Please check your case page for details.',
  });

  res.json({ success: true, data: req.report });
});

// PATCH /api/reports/:reportId/complete-student-interview — Exam Officer
// marks the requested meeting with the student as done, so the banner on
// the student's page and the officer's own queue clear.
const completeStudentInterview = asyncHandler(async (req, res) => {
  if (!req.report.studentInterview?.requested) {
    throw new AppError('No student interview has been requested on this case yet', 400);
  }
  req.report.studentInterview.completed = true;
  req.report.studentInterview.completedAt = new Date();
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: 'Student interview marked as completed',
  });

  res.json({ success: true, data: req.report });
});

// POST /api/reports/:reportId/endorse-college-review — College Officer's
// stage action: records that the College review body has examined the
// Department's findings and endorses them forward. No status change (same
// pattern as the Exam Officer's studentInterview flag above) — a case-file
// fact, not a workflow step, so it can't interfere with the state machine.
const endorseCollegeReview = asyncHandler(async (req, res) => {
  const { note } = req.body;

  req.report.collegeReview = {
    ...req.report.collegeReview,
    endorsed: true,
    endorsedBy: req.user.id,
    endorsedAt: new Date(),
    note: note || '',
  };
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: note ? `College review endorsed the Department's findings — ${note}` : "College review endorsed the Department's findings",
  });

  res.json({ success: true, data: req.report });
});

// POST /api/reports/:reportId/request-college-student-interview — College
// Officer's stage action (spec addition 2026-08-28, mirrors the Exam
// Officer's requestStudentInterview above, plus preferred date/time/venue).
// A case-file fact, not a status change — but escalateCase blocks
// /escalate from College while this is requested-and-not-completed.
const requestCollegeStudentInterview = asyncHandler(async (req, res) => {
  const { note, preferredDate, preferredTime, venue } = req.body;

  req.report.collegeReview = {
    ...req.report.collegeReview,
    interview: {
      requested: true,
      requestedBy: req.user.id,
      requestedAt: new Date(),
      note: note || '',
      preferredDate: preferredDate || '',
      preferredTime: preferredTime || '',
      venue: venue || '',
      completed: false,
      completedAt: undefined,
    },
  };
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: note ? `College requested to see the student — ${note}` : 'College requested to see the student',
  });

  await Notification.create({
    userId: req.report.studentRef,
    reportId: req.report._id,
    type: 'student_interview_requested',
    message: 'The College reviewing your case has requested to see you. Please check your case page for details.',
  });

  res.json({ success: true, data: req.report });
});

// PATCH /api/reports/:reportId/complete-college-student-interview
const completeCollegeStudentInterview = asyncHandler(async (req, res) => {
  if (!req.report.collegeReview?.interview?.requested) {
    throw new AppError('No student interview has been requested by College on this case yet', 400);
  }
  req.report.collegeReview.interview.completed = true;
  req.report.collegeReview.interview.completedAt = new Date();
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: 'College student interview marked as completed',
  });

  res.json({ success: true, data: req.report });
});

// PATCH /api/reports/:reportId/verify-registry-record — first of the
// Registry Officer's two stage actions: confirms the student's
// registration record matches what's on the case file.
const verifyRegistryRecord = asyncHandler(async (req, res) => {
  req.report.registryReview = {
    ...req.report.registryReview,
    recordVerified: true,
    recordVerifiedBy: req.user.id,
    recordVerifiedAt: new Date(),
  };
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: "Registry verified the student's record",
  });

  res.json({ success: true, data: req.report });
});

// PATCH /api/reports/:reportId/certify-registry-documentation — second of
// the Registry Officer's stage actions: certifies the case file is
// complete before it goes to Senate.
const certifyRegistryDocumentation = asyncHandler(async (req, res) => {
  req.report.registryReview = {
    ...req.report.registryReview,
    documentationCertified: true,
    documentationCertifiedBy: req.user.id,
    documentationCertifiedAt: new Date(),
  };
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: 'Registry certified the case documentation as complete',
  });

  res.json({ success: true, data: req.report });
});

// POST /api/reports/:reportId/request-registry-student-interview —
// Registry Officer's stage action (spec addition 2026-08-28), mirrors
// requestCollegeStudentInterview above. escalateCase blocks /escalate
// from Registry while this is requested-and-not-completed.
const requestRegistryStudentInterview = asyncHandler(async (req, res) => {
  const { note, preferredDate, preferredTime, venue } = req.body;

  req.report.registryReview = {
    ...req.report.registryReview,
    interview: {
      requested: true,
      requestedBy: req.user.id,
      requestedAt: new Date(),
      note: note || '',
      preferredDate: preferredDate || '',
      preferredTime: preferredTime || '',
      venue: venue || '',
      completed: false,
      completedAt: undefined,
    },
  };
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: note ? `Registry requested to see the student — ${note}` : 'Registry requested to see the student',
  });

  await Notification.create({
    userId: req.report.studentRef,
    reportId: req.report._id,
    type: 'student_interview_requested',
    message: 'The Registry reviewing your case has requested to see you. Please check your case page for details.',
  });

  res.json({ success: true, data: req.report });
});

// PATCH /api/reports/:reportId/complete-registry-student-interview
const completeRegistryStudentInterview = asyncHandler(async (req, res) => {
  if (!req.report.registryReview?.interview?.requested) {
    throw new AppError('No student interview has been requested by Registry on this case yet', 400);
  }
  req.report.registryReview.interview.completed = true;
  req.report.registryReview.interview.completedAt = new Date();
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: 'Registry student interview marked as completed',
  });

  res.json({ success: true, data: req.report });
});

// POST /api/reports/:reportId/annotate — review notes, does NOT change
// status (spec §4: "Edit/annotate report (add review notes)" is distinct
// from "Escalate case to next stage"). Logged the same way as a
// transition for a unified audit trail, but fromStatus === toStatus marks
// it as an annotation rather than a stage change.
const annotateReport = asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!note) throw new AppError('note is required', 400);

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note,
  });
  res.json({ success: true, message: 'Annotation added' });
});

// PATCH /api/reports/:reportId/escalate — Exam Officer moves case to next stage
const escalateCase = asyncHandler(async (req, res) => {
  const currentStage = req.report.status;
  const requiredRole = ESCALATION_ROLE[currentStage];
  if (!requiredRole) throw new AppError(`Case cannot be escalated from ${currentStage}`, 400);
  if (req.user.role !== requiredRole) {
    throw new AppError(`Only ${requiredRole} may escalate this case`, 403);
  }

  // Spec addition (2026-08-25, extended 2026-08-28 to College and
  // Registry): while a stage's officer has an open, unresolved "see the
  // student" request on this case, the case is frozen at THEIR stage —
  // it cannot be pushed forward until they mark that interview complete.
  // Once the case is past a given stage, a pending interview left open
  // there no longer blocks the NEXT stage from acting (there's nothing
  // further that next stage could do to unblock it anyway — only the
  // officer who requested it can complete it, via their own
  // complete-*-student-interview route, which works regardless of the
  // case's current stage — see routes/report.routes.js).
  if (
    currentStage === STATES.SUBMITTED &&
    req.report.studentInterview?.requested &&
    !req.report.studentInterview?.completed
  ) {
    throw new AppError(
      'This case cannot be escalated while a requested student interview is still pending. Mark the interview as completed first.',
      400
    );
  }
  if (
    currentStage === STATES.UNDER_REVIEW_COLLEGE &&
    req.report.collegeReview?.interview?.requested &&
    !req.report.collegeReview?.interview?.completed
  ) {
    throw new AppError(
      'This case cannot be sent to Registry while a requested student interview is still pending. Mark the interview as completed first.',
      400
    );
  }
  if (
    currentStage === STATES.UNDER_REVIEW_REGISTRY &&
    req.report.registryReview?.interview?.requested &&
    !req.report.registryReview?.interview?.completed
  ) {
    throw new AppError(
      'This case cannot be sent to Senate while a requested student interview is still pending. Mark the interview as completed first.',
      400
    );
  }

  // Department stage removed (spec revision 2026-08-28) — the Exam
  // Officer now escalates straight from SUBMITTED to
  // UNDER_REVIEW_COLLEGE, one click, one button ("Send to College
  // Review").
  const nextStageMap = {
    [STATES.SUBMITTED]: STATES.UNDER_REVIEW_COLLEGE,
    [STATES.UNDER_REVIEW_COLLEGE]: STATES.UNDER_REVIEW_REGISTRY,
    [STATES.UNDER_REVIEW_REGISTRY]: STATES.UNDER_REVIEW_SENATE,
  };
  const nextStage = nextStageMap[currentStage];

  // Resolve + stamp the destination college the moment the case leaves
  // Department review, BEFORE the transition is recorded, so the very
  // first StatusHistory entry at College Review already reflects where it
  // landed (see services/collegeResolver.js for the resolution order).
  if (nextStage === STATES.UNDER_REVIEW_COLLEGE) {
    req.report.assignedCollege = resolveCollegeForEscalation(req.user, req.report);
  }

  const updated = await transitionReport({
    report: req.report,
    toState: nextStage,
    actor: req.user,
    note: req.body.note || '',
  });
  res.json({ success: true, data: updated });
});

// PATCH /api/reports/:reportId/request-meeting — policy-flag gated (spec
// §4 RESOLVED #2). Senate always allowed; Exam Officer only if the flag
// in config/roles.js POLICY_FLAGS is later flipped to true.
const requestMeeting = asyncHandler(async (req, res) => {
  if (!canRequestMeeting(req.user.role)) {
    throw new AppError('Your role is not currently permitted to request a meeting', 403);
  }
  const updated = await transitionReport({
    report: req.report,
    toState: STATES.MEETING_REQUESTED,
    actor: req.user,
    note: req.body.note || 'Meeting requested',
  });
  res.json({ success: true, data: updated });
});

// PATCH /api/reports/:reportId/resume-review — closes out a meeting sub-state
const resumeAfterMeeting = asyncHandler(async (req, res) => {
  const updated = await transitionReport({
    report: req.report,
    toState: STATES.UNDER_REVIEW_SENATE,
    actor: req.user,
    note: req.body.note || 'Resumed review after meeting',
  });
  res.json({ success: true, data: updated });
});

// POST /api/reports/:reportId/senate-review — a Senate Board member's
// stage action (spec revision 2026-08-28): submits a review note on the
// case. NOT a verdict, and does NOT change report.status — it's a
// case-file fact, one entry per member, that gates whether the Senate
// President is allowed to pass the final verdict (see passVerdict
// below). Idempotent per member: calling this again before the
// President acts updates that member's existing note/timestamp instead
// of adding a duplicate entry.
const submitSenateReview = asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!note) throw new AppError('note is required', 400);
  if (req.report.status !== STATES.UNDER_REVIEW_SENATE) {
    throw new AppError('Senate review can only be submitted while the case is under Senate review', 400);
  }

  const existing = req.report.senateReviews.find((r) => r.memberId?.toString() === req.user.id);
  if (existing) {
    existing.note = note;
    existing.reviewedAt = new Date();
  } else {
    req.report.senateReviews.push({ memberId: req.user.id, note, reviewedAt: new Date() });
  }
  await req.report.save();

  await StatusHistory.create({
    reportId: req.report._id,
    fromStatus: req.report.status,
    toStatus: req.report.status,
    actorId: req.user.id,
    actorRole: req.user.role,
    note: `Senate Board review submitted — ${note}`,
  });

  // Once every currently-active Senate Board member has reviewed, tell
  // the Senate President(s) it's their turn — this is the only automatic
  // trigger for that notification, so it must fire here, not just rely
  // on the President happening to check back.
  const activeSenateMemberCount = await User.countDocuments({
    role: ROLES.SENATE_BOARD,
    status: 'active',
  });
  if (req.report.senateReviews.length >= activeSenateMemberCount) {
    const presidents = await User.find({ role: ROLES.SENATE_PRESIDENT, status: 'active' }).select('_id email');
    await Promise.all(
      presidents.map(async (p) => {
        await Notification.create({
          userId: p._id,
          reportId: req.report._id,
          type: 'awaiting_president_verdict',
          message: 'All Senate Board members have submitted their review — a case is awaiting your final verdict.',
        });
      })
    ).catch((err) => console.error('President notification dispatch failed (non-blocking):', err.message));
  }

  res.json({ success: true, data: req.report });
});

// PATCH /api/reports/:reportId/verdict — Senate President only (spec
// revision 2026-08-28: previously any Senate Board member could pass a
// verdict; now Senate Board members submit a review instead
// (submitSenateReview above) and only the President records the case's
// final, binding verdict — gated on every currently-active Senate Board
// member having submitted one of those reviews first).
const passVerdict = asyncHandler(async (req, res) => {
  const { verdict, suspensionDuration, verdictNotes } = req.body;

  if (!VERDICT_ENUM.includes(verdict)) {
    throw new AppError(`verdict must be one of: ${VERDICT_ENUM.join(', ')}`, 400);
  }
  if (verdict === 'suspension' && !suspensionDuration) {
    throw new AppError('suspensionDuration is required when verdict is "suspension"', 400);
  }
  if (!verdictNotes) {
    throw new AppError('verdictNotes is required regardless of verdict chosen', 400);
  }

  const activeSenateMemberCount = await User.countDocuments({
    role: ROLES.SENATE_BOARD,
    status: 'active',
  });
  const submittedCount = req.report.senateReviews.length;
  if (submittedCount < activeSenateMemberCount) {
    throw new AppError(
      `A final verdict cannot be passed yet — ${submittedCount} of ${activeSenateMemberCount} active Senate Board members have submitted their review.`,
      400
    );
  }

  req.report.verdict = verdict;
  req.report.suspensionDuration = verdict === 'suspension' ? suspensionDuration : undefined;
  req.report.verdictNotes = verdictNotes;
  req.report.verdictPassedBy = req.user.id;
  req.report.verdictPassedAt = new Date();

  const updated = await transitionReport({
    report: req.report,
    toState: STATES.VERDICT_PASSED,
    actor: req.user,
    note: `Final verdict passed by Senate President: ${verdict}`,
  });

  // Non-blocking, same reasoning as transitionReport's own notification
  // dispatch: a failed notification must never undo a verdict that's
  // already committed to the DB and the audit log.
  notifyCaseParticipants({
    report: updated,
    type: 'verdict_passed',
    message: `The Senate President has passed a final verdict on this case: ${verdict.replace(/_/g, ' ')}.`,
  }).catch((err) => console.error('Verdict notification dispatch failed (non-blocking):', err.message));

  res.json({ success: true, data: updated });
});

// PATCH /api/reports/:reportId/close — final closure after verdict
const closeCase = asyncHandler(async (req, res) => {
  const updated = await transitionReport({
    report: req.report,
    toState: STATES.CLOSED,
    actor: req.user,
    note: req.body.note || 'Case closed',
  });
  res.json({ success: true, data: updated });
});

module.exports = {
  createReport,
  uploadExhibitPhoto,
  uploadSignatureImage,
  getMySubmissions,
  getMyCase,
  getStageQueue,
  getPassedCases,
  getAllReports,
  getReportById,
  markExamOfficerReceived,
  requestStudentInterview,
  completeStudentInterview,
  endorseCollegeReview,
  requestCollegeStudentInterview,
  completeCollegeStudentInterview,
  verifyRegistryRecord,
  certifyRegistryDocumentation,
  requestRegistryStudentInterview,
  completeRegistryStudentInterview,
  annotateReport,
  escalateCase,
  requestMeeting,
  resumeAfterMeeting,
  submitSenateReview,
  passVerdict,
  closeCase,
};
