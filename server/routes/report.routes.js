const express = require('express');
const {
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
} = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireReportAccess } = require('../middleware/ownership');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect); // every route below requires a valid, active-status JWT

// --- Creation (Invigilator only) ---
router.post('/', requirePermission('CREATE_REPORT'), createReport);
router.post(
  '/upload-exhibit',
  requirePermission('CREATE_REPORT'),
  upload.single('photo'),
  uploadExhibitPhoto
);
router.post(
  '/upload-signature',
  requirePermission('CREATE_REPORT'),
  upload.single('signature'),
  uploadSignatureImage
);

// --- List views, scoped per role (class-level checks only; each returns
// only that role's own data by query, not by a single shared endpoint) ---
router.get('/my-submissions', requirePermission('VIEW_OWN_REPORT'), getMySubmissions);
router.get('/my-case', requirePermission('VIEW_OWN_REPORT'), getMyCase);
router.get('/stage-queue', requirePermission('VIEW_STAGE_REPORTS'), getStageQueue);
router.get('/passed-cases', requirePermission('VIEW_STAGE_REPORTS'), getPassedCases);
router.get('/all', requirePermission('VIEW_ALL_REPORTS'), getAllReports);

// --- Single-report routes: role check AND resource ownership together
// (spec §10) — requireReportAccess loads the report and enforces the
// stage/ownership rule from middleware/ownership.js before the handler runs.
router.get('/:reportId', requireReportAccess('read'), getReportById);

router.patch(
  '/:reportId/received',
  requirePermission('VIEW_STAGE_REPORTS'),
  requireReportAccess('full'),
  markExamOfficerReceived
);
router.post(
  '/:reportId/request-student-interview',
  requirePermission('MANAGE_STUDENT_INTERVIEW'),
  requireReportAccess('full'),
  requestStudentInterview
);
router.patch(
  '/:reportId/complete-student-interview',
  requirePermission('MANAGE_STUDENT_INTERVIEW'),
  // 'read' here (not 'full') is deliberate: an Exam Officer's access to a
  // case degrades from 'full' to 'read' once it moves past their own
  // stage (see middleware/ownership.js EXAM_OFFICER_READ_STAGES, which
  // covers every stage from College Review onward). If this required
  // 'full', an officer could never complete an interview they requested
  // before the case escalated — the exact "no way to complete the
  // meeting" bug. completeStudentInterview() itself still only mutates
  // studentInterview and never touches report.status, so allowing it at
  // 'read' access does not let a read-only officer act on anything else.
  requireReportAccess('read'),
  completeStudentInterview
);
router.post(
  '/:reportId/endorse-college-review',
  requirePermission('MANAGE_COLLEGE_REVIEW'),
  requireReportAccess('full'),
  endorseCollegeReview
);
router.post(
  '/:reportId/request-college-student-interview',
  requirePermission('MANAGE_COLLEGE_REVIEW'),
  requireReportAccess('full'),
  requestCollegeStudentInterview
);
router.patch(
  '/:reportId/complete-college-student-interview',
  requirePermission('MANAGE_COLLEGE_REVIEW'),
  // 'read' (not 'full') for the same reason completeStudentInterview
  // below uses 'read' — a College Officer's access degrades to 'read'
  // once the case escalates past College, but they must still be able
  // to close out an interview they requested before it escalated (it
  // can't have escalated with the interview still pending anyway, since
  // escalateCase blocks that — but this keeps the route consistent and
  // safe even if that invariant is ever relaxed later).
  requireReportAccess('read'),
  completeCollegeStudentInterview
);
router.patch(
  '/:reportId/verify-registry-record',
  requirePermission('MANAGE_REGISTRY_REVIEW'),
  requireReportAccess('full'),
  verifyRegistryRecord
);
router.patch(
  '/:reportId/certify-registry-documentation',
  requirePermission('MANAGE_REGISTRY_REVIEW'),
  requireReportAccess('full'),
  certifyRegistryDocumentation
);
router.post(
  '/:reportId/request-registry-student-interview',
  requirePermission('MANAGE_REGISTRY_REVIEW'),
  requireReportAccess('full'),
  requestRegistryStudentInterview
);
router.patch(
  '/:reportId/complete-registry-student-interview',
  requirePermission('MANAGE_REGISTRY_REVIEW'),
  requireReportAccess('read'),
  completeRegistryStudentInterview
);
router.post(
  '/:reportId/annotate',
  requirePermission('ANNOTATE_REPORT'),
  requireReportAccess('full'),
  annotateReport
);
router.patch(
  '/:reportId/escalate',
  requirePermission('ESCALATE_CASE'),
  requireReportAccess('full'),
  escalateCase
);
router.patch(
  '/:reportId/request-meeting',
  requireReportAccess('full'),
  requestMeeting
);
router.patch(
  '/:reportId/resume-review',
  requirePermission('ANNOTATE_REPORT'),
  requireReportAccess('full'),
  resumeAfterMeeting
);
router.post(
  '/:reportId/senate-review',
  requirePermission('SUBMIT_SENATE_REVIEW'),
  requireReportAccess('full'),
  submitSenateReview
);
router.patch(
  '/:reportId/verdict',
  // Spec revision 2026-08-28: PASS_VERDICT is now Senate-President-only
  // (see config/roles.js) — ordinary Senate Board members use
  // POST /:reportId/senate-review above instead.
  requirePermission('PASS_VERDICT'),
  requireReportAccess('full'),
  passVerdict
);
router.patch(
  '/:reportId/close',
  // Split from PASS_VERDICT (spec revision 2026-08-28): closing a case
  // was never meant to require the President specifically, so it gets
  // its own, slightly broader permission (Senate Board OR President).
  requirePermission('CLOSE_CASE'),
  requireReportAccess('full'),
  closeCase
);

// NOTE: intentionally NO routes exist here for updating or deleting
// Exhibit or Witness records once created — spec §4 + §10 require this be
// absent at the route layer, not merely hidden in the UI.

module.exports = router;
