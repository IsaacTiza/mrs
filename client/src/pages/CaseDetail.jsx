import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusStamp from '../components/StatusStamp';
import Modal from '../components/Modal';
import { subscribeSSE } from '../api/sseClient';

const TABS = [
  'Exam Details', 'Candidate', 'Offence', 'Narrative',
  'Exhibits', 'Witnesses', 'Response', 'Actions', 'Certification', 'History',
];

const VERDICTS = [
  'dismissed_no_case', 'warning', 'result_withheld', 'result_cancelled', 'suspension', 'expulsion_recommended',
];

// Confirmation list for "Add review note" (submitAnnotation). An
// annotation is a StatusHistory row where fromStatus === toStatus — the
// exact same marker reportController.annotateReport uses to distinguish
// a note from a real stage transition, so this can't drift out of sync
// with what actually got saved. Shown right under each officer's note
// box (spec ask: "the notes there have added should show down for them
// to confirm... so they won't be quoted wrong later") instead of only
// being reachable via the separate History tab.
function AnnotationNotesList({ history }) {
  const notes = (history || [])
    .filter((h) => h.fromStatus === h.toStatus)
    .slice()
    .reverse(); // history arrives oldest-first; newest note on top here

  return (
    <div style={{ marginTop: 4 }}>
      <h3 style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: '0 0 6px' }}>
        Review notes recorded on this case
      </h3>
      {notes.length === 0 ? (
        <p className="empty-state" style={{ margin: 0, padding: '10px 0' }}>No review notes yet.</p>
      ) : (
        notes.map((n) => (
          <div key={n._id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: '0.85rem' }}>
            <strong>{n.actorRole?.replace(/_/g, ' ')}</strong>{' '}
            <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: '0.76rem' }}>
              {new Date(n.timestamp).toLocaleString()}
            </span>
            <div style={{ color: 'var(--ink-soft)' }}>{n.note}</div>
          </div>
        ))
      )}
    </div>
  );
}

// Exam Officer's only active stage now (spec revision 2026-08-28 removed
// the separate department-review stage entirely — SUBMITTED now goes
// straight to College, one action, one button, instead of the Exam
// Officer clicking through two stages of their own first).
const OFFICER_STAGES = ['submitted'];
const COLLEGE_STAGES = ['under_review_college'];
const REGISTRY_STAGES = ['under_review_registry'];
// Stages where the Senate Board review UI (and the President's progress/
// verdict UI) should render at all — includes meeting_requested so a
// member's already-submitted note stays visible (read-only, submit
// disabled) while a meeting is pending, instead of disappearing.
const SENATE_ACTIVE_STAGES = ['under_review_senate', 'meeting_requested'];

// What the escalate button should say at each stage — the last one is the
// one that actually pushes the case to the Senate Board, so it gets its
// own unmistakable label instead of a generic "next stage".
const ESCALATE_LABEL = {
  submitted: 'Send to College Review',
  under_review_college: 'Send to Registry Review',
  under_review_registry: 'Push to Senate Board',
};

export default function CaseDetail() {
  const { reportId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  const [note, setNote] = useState('');
  const [interviewNote, setInterviewNote] = useState('');
  const [collegeNote, setCollegeNote] = useState('');
  // College/Registry "request to see student" forms (spec addition
  // 2026-08-28) — separate note/date/time/venue state per stage, mirrors
  // the Exam Officer's interviewNote above plus the new preferred
  // date/time/venue fields the spec asked for on these two.
  const [collegeInterviewForm, setCollegeInterviewForm] = useState({ note: '', preferredDate: '', preferredTime: '', venue: '' });
  const [registryInterviewForm, setRegistryInterviewForm] = useState({ note: '', preferredDate: '', preferredTime: '', venue: '' });
  // A Senate Board member's own review note (spec revision 2026-08-28) —
  // pre-filled from their existing entry in report.senateReviews if
  // they've already submitted one, so re-opening the case shows what
  // they said rather than a blank box.
  const [senateReviewNote, setSenateReviewNote] = useState('');
  const [verdictForm, setVerdictForm] = useState({ verdict: '', suspensionDuration: '', verdictNotes: '' });
  const [showVerdictConfirm, setShowVerdictConfirm] = useState(false);
  // Critical/blocking outcomes (an action rejected by the server, or the
  // page discovering its own view is stale) go through this modal instead
  // of the small inline banner — easy to miss a banner, hard to miss a
  // modal, and these are exactly the moments where missing it is costly.
  const [errorModalMsg, setErrorModalMsg] = useState('');
  // Live-update banner (spec: "so if a user is on something and an
  // update comes he can see it and react accordingly without needing to
  // destroy everything he is doing at the moment"). Deliberately does
  // NOT auto-reload on push — an in-progress verdict form or a half-
  // typed note shouldn't be yanked out from under someone just because
  // another officer touched the case; instead this flips a banner and
  // the person chooses when to pull in the update.
  const [updateAvailable, setUpdateAvailable] = useState(false);

  function load() {
    setError('');
    setUpdateAvailable(false);
    api
      .get(`/reports/${reportId}`)
      .then((d) => { setData(d); setError(''); })
      .catch((e) => {
        // Deliberately clear `data` here too, not just `error`. Leaving the
        // previous successful load's `data` in place while showing an
        // error UNDER it meant a case that just became inaccessible (e.g.
        // Senate passing a verdict used to make the case briefly show as
        // "Forbidden" — see middleware/ownership.js SENATE_STAGES fix)
        // still rendered its OLD header, status badge, and Actions card
        // using the stale accessLevel — buttons looked clickable but every
        // click failed. Clearing data falls through to the plain error
        // view below instead of a half-stale, half-broken page.
        setData(null);
        setError(e.message);
      });
  }
  useEffect(load, [reportId]);
  // Live path: any notification concerning THIS case (any push whose
  // reportId matches — status changes, new senate reviews, verdicts,
  // meeting requests all route through notifyStatusChange/
  // notifyCaseParticipants, so this catches all of them) flips the
  // banner instead of silently reloading underneath the person.
  useEffect(() => {
    return subscribeSSE('notification', (n) => {
      if (String(n.reportId) === String(reportId)) setUpdateAvailable(true);
    });
  }, [reportId]);
  // Pre-fills the Senate Board review textarea with this member's own
  // existing note (if any) the FIRST time the case data arrives, so
  // reopening a case they've already reviewed shows what they said
  // instead of a blank box. Guarded to run once (per reportId) rather
  // than on every reload/poll, so it doesn't clobber whatever they're
  // actively typing after their own submit-triggered reload.
  const senateNotePrefilled = useRef(false);
  useEffect(() => { senateNotePrefilled.current = false; }, [reportId]);
  useEffect(() => {
    if (!data || senateNotePrefilled.current) return;
    const mine = data.report.senateReviews?.find(
      (r) => (r.memberId?._id || r.memberId) === user.id
    );
    if (mine) setSenateReviewNote(mine.note);
    senateNotePrefilled.current = true;
  }, [data, user.id]);

  // Renders a value from examDetails in a human-readable way. Dates were
  // previously dumped through a generic String(v), which for examDate (an
  // ISO date string once it comes back through JSON) printed the raw
  // "2026-08-24T00:00:00.000Z" instead of a readable date.
  function formatExamDetailValue(key, value) {
    if (key === 'examDate' && value) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      }
    }
    return String(value);
  }

  // "courseCode" -> "Course Code" — same readability goal as the date fix,
  // for the raw camelCase field labels on the same tab.
  function formatExamDetailLabel(key) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase());
  }

  async function runAction(path, body = {}) {
    setActionBusy(true);
    setError('');
    try {
      await api.patch(`/reports/${reportId}${path}`, body);
      setNote('');
      load();
    } catch (e) {
      setErrorModalMsg(e.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function submitInterviewRequest() {
    setActionBusy(true);
    setError('');
    try {
      await api.post(`/reports/${reportId}/request-student-interview`, { note: interviewNote });
      setInterviewNote('');
      load();
    } catch (e) {
      setErrorModalMsg(e.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function submitCollegeEndorsement() {
    setActionBusy(true);
    setError('');
    try {
      await api.post(`/reports/${reportId}/endorse-college-review`, { note: collegeNote });
      setCollegeNote('');
      load();
    } catch (e) {
      setErrorModalMsg(e.message);
    } finally {
      setActionBusy(false);
    }
  }

  // College/Registry "request to see student" (spec addition
  // 2026-08-28) — mirrors submitInterviewRequest above, plus the
  // preferred date/time/venue fields, and blocks escalate at that stage
  // (enforced server-side in reportController.escalateCase) until marked
  // complete.
  async function submitCollegeInterviewRequest() {
    setActionBusy(true);
    setError('');
    try {
      await api.post(`/reports/${reportId}/request-college-student-interview`, collegeInterviewForm);
      setCollegeInterviewForm({ note: '', preferredDate: '', preferredTime: '', venue: '' });
      load();
    } catch (e) {
      setErrorModalMsg(e.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function submitRegistryInterviewRequest() {
    setActionBusy(true);
    setError('');
    try {
      await api.post(`/reports/${reportId}/request-registry-student-interview`, registryInterviewForm);
      setRegistryInterviewForm({ note: '', preferredDate: '', preferredTime: '', venue: '' });
      load();
    } catch (e) {
      setErrorModalMsg(e.message);
    } finally {
      setActionBusy(false);
    }
  }

  // Senate Board member's own review note (spec revision 2026-08-28) —
  // NOT a verdict; gates whether the Senate President can pass the final
  // one (server requires every active Senate Board member to have
  // submitted one of these first — see reportController.passVerdict).
  // Idempotent: submitting again before the President acts updates this
  // member's existing note instead of adding a second one.
  async function submitSenateReview() {
    if (!senateReviewNote.trim()) return;
    setActionBusy(true);
    setError('');
    try {
      await api.post(`/reports/${reportId}/senate-review`, { note: senateReviewNote });
      setSenateReviewNote('');
      load();
    } catch (e) {
      setErrorModalMsg(e.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function submitAnnotation() {
    if (!note.trim()) return;
    setActionBusy(true);
    setError('');
    try {
      await api.post(`/reports/${reportId}/annotate`, { note });
      setNote('');
      load();
    } catch (e) {
      setErrorModalMsg(e.message);
    } finally {
      setActionBusy(false);
    }
  }

  // Re-checks the case's live status right before opening the verdict
  // confirmation, instead of trusting whatever the page loaded last. If
  // this page has been sitting open and someone (or a slow background
  // reload) moved the case since, submitting against a stale view used to
  // fail with a confusing 403 "forbidden" after the confirm step. This
  // catches that up front and explains what actually happened instead.
  async function openVerdictConfirm(e) {
    e.preventDefault();
    setActionBusy(true);
    try {
      const fresh = await api.get(`/reports/${reportId}`);
      setData(fresh);
      if (fresh.report.status !== 'under_review_senate') {
        setErrorModalMsg(
          `This case has moved on since the page loaded — it's now "${fresh.report.status.replace(/_/g, ' ')}", so a verdict can't be passed from here anymore. The page has been refreshed to the current state.`
        );
      } else {
        setShowVerdictConfirm(true);
      }
    } catch (err) {
      setErrorModalMsg(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmVerdict() {
    setActionBusy(true);
    setError('');
    try {
      await api.patch(`/reports/${reportId}/verdict`, verdictForm);
      setShowVerdictConfirm(false);
      load();
    } catch (err) {
      setShowVerdictConfirm(false);
      setErrorModalMsg(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div>
        <div className="page-title"><h1>Case File</h1></div>
        <div className="error-banner">{error}</div>
      </div>
    );
  }
  if (!data) return <p className="empty-state">Loading…</p>;

  const { report, exhibits, witnesses, history, accessLevel, senateReviewProgress } = data;
  const canAct = accessLevel === 'full';
  const interview = report.studentInterview;
  const myExistingSenateReview = report.senateReviews?.find(
    (r) => (r.memberId?._id || r.memberId) === user.id
  );

  return (
    <div>
      <div className="case-header">
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>{report.examDetails?.courseCode} — Case File</h1>
        <StatusStamp status={report.status} />
      </div>
      <div className="case-ref">Ref {report._id.toUpperCase()}</div>
      {report.assignedCollege && (
        <div className="case-ref" style={{ marginTop: -8 }}>Assigned college: {report.assignedCollege}</div>
      )}

      {updateAvailable && (
        <div
          className="notice-banner"
          style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
        >
          <span>This case has been updated by someone else.</span>
          <button className="btn secondary" onClick={load}>Refresh</button>
        </div>
      )}

      {interview?.requested && (
        <div className={interview.completed ? 'notice-banner' : 'error-banner'} style={{ marginTop: 16 }}>
          {interview.completed ? (
            <>The Exam Officer has seen the student for this case (interview completed{interview.completedAt ? ` on ${new Date(interview.completedAt).toLocaleDateString()}` : ''}).</>
          ) : user?.role === 'student' ? (
            <>The Exam Officer handling this case has requested to see you in person. Please visit their office as soon as possible.{interview.note && <> Note: {interview.note}</>}</>
          ) : (
            <>Student has been asked to appear — awaiting the meeting{interview.note && <>. Note: {interview.note}</>}</>
          )}
        </div>
      )}

      {report.collegeReview?.interview?.requested && (
        <div className={report.collegeReview.interview.completed ? 'notice-banner' : 'error-banner'} style={{ marginTop: 16 }}>
          {report.collegeReview.interview.completed ? (
            <>The College has seen the student for this case (interview completed{report.collegeReview.interview.completedAt ? ` on ${new Date(report.collegeReview.interview.completedAt).toLocaleDateString()}` : ''}).</>
          ) : user?.role === 'student' ? (
            <>The College reviewing this case has requested to see you. {[report.collegeReview.interview.preferredDate, report.collegeReview.interview.preferredTime, report.collegeReview.interview.venue].filter(Boolean).length > 0 && (
              <>Preferred {report.collegeReview.interview.preferredDate && <>date: {report.collegeReview.interview.preferredDate} </>}
              {report.collegeReview.interview.preferredTime && <>time: {report.collegeReview.interview.preferredTime} </>}
              {report.collegeReview.interview.venue && <>venue: {report.collegeReview.interview.venue}</>}. </>
            )}
            {report.collegeReview.interview.note && <>Note: {report.collegeReview.interview.note}</>}</>
          ) : (
            <>Student has been asked to appear before College — awaiting the meeting.
              {report.collegeReview.interview.preferredDate && <> Preferred date: {report.collegeReview.interview.preferredDate}.</>}
              {report.collegeReview.interview.preferredTime && <> Time: {report.collegeReview.interview.preferredTime}.</>}
              {report.collegeReview.interview.venue && <> Venue: {report.collegeReview.interview.venue}.</>}
              {report.collegeReview.interview.note && <> Note: {report.collegeReview.interview.note}</>}
            </>
          )}
        </div>
      )}

      {report.registryReview?.interview?.requested && (
        <div className={report.registryReview.interview.completed ? 'notice-banner' : 'error-banner'} style={{ marginTop: 16 }}>
          {report.registryReview.interview.completed ? (
            <>The Registry has seen the student for this case (interview completed{report.registryReview.interview.completedAt ? ` on ${new Date(report.registryReview.interview.completedAt).toLocaleDateString()}` : ''}).</>
          ) : user?.role === 'student' ? (
            <>The Registry reviewing this case has requested to see you.
              {report.registryReview.interview.preferredDate && <> Preferred date: {report.registryReview.interview.preferredDate}.</>}
              {report.registryReview.interview.preferredTime && <> Time: {report.registryReview.interview.preferredTime}.</>}
              {report.registryReview.interview.venue && <> Venue: {report.registryReview.interview.venue}.</>}
              {report.registryReview.interview.note && <> Note: {report.registryReview.interview.note}</>}
            </>
          ) : (
            <>Student has been asked to appear before Registry — awaiting the meeting.
              {report.registryReview.interview.preferredDate && <> Preferred date: {report.registryReview.interview.preferredDate}.</>}
              {report.registryReview.interview.preferredTime && <> Time: {report.registryReview.interview.preferredTime}.</>}
              {report.registryReview.interview.venue && <> Venue: {report.registryReview.interview.venue}.</>}
              {report.registryReview.interview.note && <> Note: {report.registryReview.interview.note}</>}
            </>
          )}
        </div>
      )}

      <div className="case-tabs">
        {TABS.map((label, i) => (
          <button key={label} className={i === tab ? 'active' : ''} onClick={() => setTab(i)}>
            <span className="tab-no">{String(i + 1).padStart(2, '0')}</span>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        {tab === 0 && (
          <div className="field-grid">
            {Object.entries(report.examDetails || {}).map(([k, v]) => (
              <div key={k}>
                <div className="field-label">{formatExamDetailLabel(k)}</div>
                <div className="field-value">{formatExamDetailValue(k, v)}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 1 && (
          <div className="field-grid">
            <div><div className="field-label">Student ref</div><div className="field-value mono">{report.studentRef?._id || report.studentRef}</div></div>
            {report.studentRef?.name && (
              <div><div className="field-label">Name</div><div className="field-value">{report.studentRef.name}</div></div>
            )}
            {report.studentRef?.matricNumber && (
              <div>
                <div className="field-label">Matric number (also their login password)</div>
                <div className="field-value mono">{report.studentRef.matricNumber}</div>
              </div>
            )}
            {report.studentRef?.email && (
              <div><div className="field-label">Login email</div><div className="field-value">{report.studentRef.email}</div></div>
            )}
            <div><div className="field-label">Chief invigilator</div><div className="field-value">{report.chiefInvigilator?.name}</div></div>
            {report.assistantInvigilator?.name && (
              <div><div className="field-label">Assistant invigilator</div><div className="field-value">{report.assistantInvigilator.name}</div></div>
            )}
          </div>
        )}

        {tab === 2 && (
          <div>
            <div className="field-label">Offence types</div>
            <div className="field-value">{(report.offenceTypes || []).join(', ')}</div>
            {report.offenceOther && (
              <>
                <div className="field-label" style={{ marginTop: 12 }}>Other</div>
                <div className="field-value">{report.offenceOther}</div>
              </>
            )}
          </div>
        )}

        {tab === 3 && <div className="field-value" style={{ whiteSpace: 'pre-wrap' }}>{report.narrative}</div>}

        {tab === 4 && (
          exhibits.length === 0 ? <p className="empty-state">No exhibits recorded.</p> :
          exhibits.map((ex) => (
            <div className="repeatable-row" key={ex._id}>
              <div className="field-grid">
                <div><div className="field-label">Description</div><div className="field-value">{ex.description}</div></div>
                <div><div className="field-label">Tag number</div><div className="field-value">{ex.tagNumber}</div></div>
                <div><div className="field-label">Custody location</div><div className="field-value">{ex.custodyLocation}</div></div>
                <div><div className="field-label">Photo hash (SHA-256)</div><div className="field-value mono" style={{ fontSize: '0.75rem' }}>{ex.photoHash}</div></div>
              </div>
              {ex.photoUrl && <img src={ex.photoUrl} alt={ex.description} style={{ maxWidth: 220, marginTop: 10, borderRadius: 'var(--radius)' }} />}
            </div>
          ))
        )}

        {tab === 5 && (
          witnesses.length === 0 ? <p className="empty-state">No witnesses recorded.</p> :
          witnesses.map((w) => (
            <div className="repeatable-row" key={w._id}>
              <div className="field-grid">
                <div><div className="field-label">Name</div><div className="field-value">{w.fullName}</div></div>
                <div><div className="field-label">Designation</div><div className="field-value">{w.designation}</div></div>
                <div><div className="field-label">Staff/reg no.</div><div className="field-value">{w.staffOrRegNo}</div></div>
              </div>
            </div>
          ))
        )}

        {tab === 6 && (
          <div>
            <div className="field-label">Candidate's response</div>
            <div className="field-value">{report.candidateDeclined ? 'Declined to make a statement (witnessed).' : report.candidateStatement}</div>
          </div>
        )}

        {tab === 7 && (
          <div className="field-value">{(report.immediateActions || []).join(', ') || '—'}</div>
        )}

        {tab === 8 && (
          <div className="field-grid">
            <div>
              <div className="field-label">Candidate's signature</div>
              {report.candidateSignature?.imageUrl && (
                <img src={report.candidateSignature.imageUrl} alt="Candidate signature" style={{ maxWidth: 220, background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }} />
              )}
            </div>
            {report.examOfficerReceived?.signedAt && (
              <div>
                <div className="field-label">Exam Officer received</div>
                <div className="field-value">{new Date(report.examOfficerReceived.signedAt).toLocaleString()}</div>
              </div>
            )}
            {report.verdict && (
              <>
                <div><div className="field-label">Verdict</div><div className="field-value">{report.verdict}</div></div>
                {report.suspensionDuration && <div><div className="field-label">Suspension duration</div><div className="field-value">{report.suspensionDuration}</div></div>}
                <div style={{ gridColumn: '1 / -1' }}><div className="field-label">Verdict notes</div><div className="field-value">{report.verdictNotes}</div></div>
              </>
            )}
          </div>
        )}

        {tab === 9 && (
          history.length === 0 ? <p className="empty-state">No history yet.</p> :
          history.map((h) => (
            <div key={h._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: '0.88rem' }}>
              <span className="mono" style={{ color: 'var(--ink-soft)' }}>{new Date(h.timestamp).toLocaleString()}</span>{' '}
              — <strong>{h.actorRole}</strong>: {h.fromStatus} &rarr; {h.toStatus}
              {h.note && <div style={{ color: 'var(--ink-soft)' }}>{h.note}</div>}
            </div>
          ))
        )}
      </div>

      {canAct && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: '0.95rem', marginTop: 0 }}>Actions</h2>

          {user.role === 'exam_officer' && OFFICER_STAGES.includes(report.status) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0 }}>
                These actions are independent — you can push the case forward whether or not a
                student meeting has happened, if the case doesn't need one.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {!report.examOfficerReceived?.signedAt && (
                  <button className="btn secondary" disabled={actionBusy} onClick={() => runAction('/received')}>
                    Mark received
                  </button>
                )}
                {!interview?.requested && (
                  <button className="btn secondary" disabled={actionBusy} onClick={submitInterviewRequest}>
                    Request to see student
                  </button>
                )}
                {interview?.requested && !interview.completed && (
                  <button className="btn secondary" disabled={actionBusy} onClick={() => runAction('/complete-student-interview')}>
                    Mark student interview completed
                  </button>
                )}
                <button className="btn" disabled={actionBusy} onClick={() => runAction('/escalate', { note })}>
                  {ESCALATE_LABEL[report.status]}
                </button>
              </div>

              {!interview?.requested && (
                <div className="form-row">
                  <label>Note for the student meeting (optional)</label>
                  <textarea
                    placeholder="e.g. reason for the meeting, where/when to come in"
                    value={interviewNote}
                    onChange={(e) => setInterviewNote(e.target.value)}
                  />
                </div>
              )}

              <div className="form-row">
                <label>Add review note</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="btn secondary" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={submitAnnotation} disabled={actionBusy || !note.trim()}>
                  Add note
                </button>
              </div>
              <AnnotationNotesList history={history} />
            </div>
          )}

          {user.role === 'college_officer' && COLLEGE_STAGES.includes(report.status) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0 }}>
                Endorsing, requesting to see the student, and forwarding to Registry are
                independent actions — all buttons below stay visible together the whole time,
                nothing is hidden behind another step. Forwarding is blocked only while a
                requested student interview is still pending.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {!report.collegeReview?.endorsed && (
                  <button className="btn secondary" disabled={actionBusy} onClick={submitCollegeEndorsement}>
                    Endorse Department's findings
                  </button>
                )}
                {!report.collegeReview?.interview?.requested && (
                  <button className="btn secondary" disabled={actionBusy} onClick={submitCollegeInterviewRequest}>
                    Request to see student
                  </button>
                )}
                {report.collegeReview?.interview?.requested && !report.collegeReview.interview.completed && (
                  <button className="btn secondary" disabled={actionBusy} onClick={() => runAction('/complete-college-student-interview')}>
                    Mark student interview completed
                  </button>
                )}
                <button className="btn" disabled={actionBusy} onClick={() => runAction('/escalate', { note })}>
                  {ESCALATE_LABEL[report.status]}
                </button>
              </div>

              {!report.collegeReview?.endorsed && (
                <div className="form-row">
                  <label>Endorsement note (optional)</label>
                  <textarea
                    placeholder="e.g. anything confirmed or flagged during College review"
                    value={collegeNote}
                    onChange={(e) => setCollegeNote(e.target.value)}
                  />
                </div>
              )}

              {!report.collegeReview?.interview?.requested && (
                <div className="form-row">
                  <label>Student meeting details (optional, used only if you request to see the student)</label>
                  <textarea
                    placeholder="Note — reason for the meeting"
                    value={collegeInterviewForm.note}
                    onChange={(e) => setCollegeInterviewForm((f) => ({ ...f, note: e.target.value }))}
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                    <input
                      type="date"
                      value={collegeInterviewForm.preferredDate}
                      onChange={(e) => setCollegeInterviewForm((f) => ({ ...f, preferredDate: e.target.value }))}
                    />
                    <input
                      type="time"
                      value={collegeInterviewForm.preferredTime}
                      onChange={(e) => setCollegeInterviewForm((f) => ({ ...f, preferredTime: e.target.value }))}
                    />
                    <input
                      placeholder="Venue"
                      value={collegeInterviewForm.venue}
                      onChange={(e) => setCollegeInterviewForm((f) => ({ ...f, venue: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="form-row">
                <label>Add review note</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="btn secondary" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={submitAnnotation} disabled={actionBusy || !note.trim()}>
                  Add note
                </button>
              </div>
              <AnnotationNotesList history={history} />
            </div>
          )}

          {user.role === 'registry_officer' && REGISTRY_STAGES.includes(report.status) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0 }}>
                Verifying the record, certifying documentation, and requesting to see the student
                are independent checks — all buttons below stay visible together. Forwarding to
                Senate is blocked only while a requested student interview is still pending.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {!report.registryReview?.recordVerified && (
                  <button className="btn secondary" disabled={actionBusy} onClick={() => runAction('/verify-registry-record')}>
                    Verify student record
                  </button>
                )}
                {!report.registryReview?.documentationCertified && (
                  <button className="btn secondary" disabled={actionBusy} onClick={() => runAction('/certify-registry-documentation')}>
                    Certify documentation complete
                  </button>
                )}
                {!report.registryReview?.interview?.requested && (
                  <button className="btn secondary" disabled={actionBusy} onClick={submitRegistryInterviewRequest}>
                    Request to see student
                  </button>
                )}
                {report.registryReview?.interview?.requested && !report.registryReview.interview.completed && (
                  <button className="btn secondary" disabled={actionBusy} onClick={() => runAction('/complete-registry-student-interview')}>
                    Mark student interview completed
                  </button>
                )}
                <button className="btn" disabled={actionBusy} onClick={() => runAction('/escalate', { note })}>
                  {ESCALATE_LABEL[report.status]}
                </button>
              </div>

              {!report.registryReview?.interview?.requested && (
                <div className="form-row">
                  <label>Student meeting details (optional, used only if you request to see the student)</label>
                  <textarea
                    placeholder="Note — reason for the meeting"
                    value={registryInterviewForm.note}
                    onChange={(e) => setRegistryInterviewForm((f) => ({ ...f, note: e.target.value }))}
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                    <input
                      type="date"
                      value={registryInterviewForm.preferredDate}
                      onChange={(e) => setRegistryInterviewForm((f) => ({ ...f, preferredDate: e.target.value }))}
                    />
                    <input
                      type="time"
                      value={registryInterviewForm.preferredTime}
                      onChange={(e) => setRegistryInterviewForm((f) => ({ ...f, preferredTime: e.target.value }))}
                    />
                    <input
                      placeholder="Venue"
                      value={registryInterviewForm.venue}
                      onChange={(e) => setRegistryInterviewForm((f) => ({ ...f, venue: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="form-row">
                <label>Add review note</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="btn secondary" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={submitAnnotation} disabled={actionBusy || !note.trim()}>
                  Add note
                </button>
              </div>
              <AnnotationNotesList history={history} />
            </div>
          )}

          {user.role === 'senate_board' && SENATE_ACTIVE_STAGES.includes(report.status) && (
            <div className="form-row">
              <label>
                {myExistingSenateReview ? 'Update my review' : 'Submit my review'} (required before the
                Senate President can pass a final verdict)
              </label>
              <textarea value={senateReviewNote} onChange={(e) => setSenateReviewNote(e.target.value)} />
              <button
                className="btn secondary"
                style={{ marginTop: 8, alignSelf: 'flex-start' }}
                onClick={submitSenateReview}
                disabled={actionBusy || !senateReviewNote.trim() || report.status !== 'under_review_senate'}
              >
                {myExistingSenateReview ? 'Update my review' : 'Submit my review'}
              </button>
              {myExistingSenateReview && (
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: 6, marginBottom: 0 }}>
                  You submitted this on {new Date(myExistingSenateReview.reviewedAt).toLocaleString()}.
                </p>
              )}
            </div>
          )}

          {(user.role === 'senate_board' || user.role === 'senate_president') && SENATE_ACTIVE_STAGES.includes(report.status) && senateReviewProgress && (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: 10 }}>
              {senateReviewProgress.submitted} of {senateReviewProgress.total} active Senate Board members
              have submitted their review
              {senateReviewProgress.submitted >= senateReviewProgress.total
                ? ' — awaiting the Senate President to pass the final verdict.'
                : '.'}
            </p>
          )}

          {user.role === 'senate_president' && SENATE_ACTIVE_STAGES.includes(report.status) && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: '0.9rem' }}>Senate Board review notes</h3>
              {(!report.senateReviews || report.senateReviews.length === 0) ? (
                <p className="empty-state" style={{ margin: 0 }}>No Senate Board member has submitted a review yet.</p>
              ) : (
                report.senateReviews.map((r, i) => (
                  <div key={r.memberId?._id || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: '0.88rem' }}>
                    <strong>{r.memberId?.name || 'Senate Board member'}</strong>{' '}
                    <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: '0.76rem' }}>
                      {new Date(r.reviewedAt).toLocaleString()}
                    </span>
                    <div style={{ color: 'var(--ink-soft)' }}>{r.note}</div>
                  </div>
                ))
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            {user.role === 'senate_board' && report.status === 'under_review_senate' && (
              <button className="btn secondary" disabled={actionBusy} onClick={() => runAction('/request-meeting', { note })}>
                Request meeting
              </button>
            )}
            {user.role === 'senate_board' && report.status === 'meeting_requested' && (
              <button className="btn secondary" disabled={actionBusy} onClick={() => runAction('/resume-review', { note })}>
                Resume review
              </button>
            )}
            {(user.role === 'senate_board' || user.role === 'senate_president') && report.status === 'verdict_passed' && (
              <button className="btn" disabled={actionBusy} onClick={() => runAction('/close', { note })}>
                Close case
              </button>
            )}
          </div>

          {user.role === 'senate_president' && report.status === 'under_review_senate' && (
            <form onSubmit={openVerdictConfirm} style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
              <h3 style={{ fontSize: '0.9rem', marginTop: 0 }}>Pass Final Verdict</h3>
              {senateReviewProgress && senateReviewProgress.submitted < senateReviewProgress.total && (
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                  Waiting on {senateReviewProgress.total - senateReviewProgress.submitted} more Senate Board
                  member(s) to submit their review before a final verdict can be passed.
                </p>
              )}
              <div className="form-row">
                <label>Verdict</label>
                <select value={verdictForm.verdict} onChange={(e) => setVerdictForm((f) => ({ ...f, verdict: e.target.value }))} required>
                  <option value="">Select…</option>
                  {VERDICTS.map((v) => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              {verdictForm.verdict === 'suspension' && (
                <div className="form-row">
                  <label>Suspension duration</label>
                  <input value={verdictForm.suspensionDuration} onChange={(e) => setVerdictForm((f) => ({ ...f, suspensionDuration: e.target.value }))} required />
                </div>
              )}
              <div className="form-row">
                <label>Verdict notes (required)</label>
                <textarea value={verdictForm.verdictNotes} onChange={(e) => setVerdictForm((f) => ({ ...f, verdictNotes: e.target.value }))} required />
              </div>
              <button
                className="btn"
                disabled={actionBusy || (senateReviewProgress && senateReviewProgress.submitted < senateReviewProgress.total)}
              >
                Pass final verdict
              </button>
            </form>
          )}
          {user.role === 'senate_board' && report.status === 'meeting_requested' && (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: 20 }}>
              A student meeting is pending on this case. Resume review above once it's done.
            </p>
          )}
        </div>
      )}

      {showVerdictConfirm && (
        <Modal
          title="Confirm verdict"
          confirmLabel="Yes, pass verdict"
          busy={actionBusy}
          onCancel={() => setShowVerdictConfirm(false)}
          onConfirm={confirmVerdict}
        >
          You're about to record <strong>{verdictForm.verdict.replace(/_/g, ' ')}</strong> as the final
          verdict for this case{verdictForm.suspensionDuration ? ` (${verdictForm.suspensionDuration})` : ''}.
          This closes out the review stage and cannot be changed from this page afterward. Continue?
        </Modal>
      )}

      {errorModalMsg && (
        <Modal
          title="Action couldn't be completed"
          confirmLabel="OK"
          onCancel={() => setErrorModalMsg('')}
          onConfirm={() => setErrorModalMsg('')}
        >
          {errorModalMsg}
        </Modal>
      )}
    </div>
  );
}
