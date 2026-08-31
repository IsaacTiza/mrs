import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import SignaturePad from "../../components/SignaturePad";
import { OFFENCE_TYPES, IMMEDIATE_ACTIONS } from "./formOptions";
import {
  FACULTY_OPTIONS,
  departmentsFor,
  SEMESTERS,
  LEVELS,
  DEGREES,
  currentSession,
  sessionOptions,
} from "./academicOptions";

const STEP_LABELS = [
  "Exam Details",
  "Candidate",
  "Offence",
  "Narrative",
  "Exhibits",
  "Witnesses",
  "Response",
  "Actions",
  "Certification",
];

const emptyExamDetails = {
  faculty: "",
  department: "",
  programme: "",
  level: "",
  session: currentSession(),
  semester: "",
  courseCode: "",
  courseTitle: "",
  examDate: new Date().toISOString().slice(0, 10), // defaults to today, adjustable
  timeStart: "",
  timeEnd: "",
  venue: "",
  seatNumber: "",
};
const emptyCandidate = {
  fullName: "",
  matricNumber: "",
  programme: "",
  level: "",
  phone: "",
  email: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{7,15}$/;

const EXAM_DETAIL_LABELS = {
  faculty: "Faculty",
  department: "Department",
  programme: "Degree",
  level: "Level",
  session: "Session",
  semester: "Semester",
  courseCode: "Course code",
  courseTitle: "Course title",
  examDate: "Exam date",
  timeStart: "Start time",
  timeEnd: "End time",
  venue: "Venue",
};

// Inline error text shown directly under a field — this is what makes
// validation "immediate": the user sees exactly which field is wrong and
// why, at the moment they leave it, instead of a single banner discovered
// only after clicking Next/Submit (or worse, only after the backend
// rejects it).
function FieldError({ message }) {
  if (!message) return null;
  return (
    <span
      style={{
        display: "block",
        fontSize: "0.78rem",
        color: "var(--status-rejected-fg, #c0392b)",
        marginTop: 4,
      }}
    >
      {message}
    </span>
  );
}

export default function NewReportWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [examDetails, setExamDetails] = useState(emptyExamDetails);
  const [candidate, setCandidate] = useState(emptyCandidate);
  const [offenceTypes, setOffenceTypes] = useState([]);
  const [offenceOther, setOffenceOther] = useState("");
  const [narrative, setNarrative] = useState("");
  const [exhibits, setExhibits] = useState([]); // { description, tagNumber, custodyLocation, photoUrl, photoHash, uploading }
  const [witnesses, setWitnesses] = useState([]); // { fullName, designation, staffOrRegNo }
  const [candidateStatement, setCandidateStatement] = useState("");
  const [candidateDeclined, setCandidateDeclined] = useState(false);
  const [immediateActions, setImmediateActions] = useState([]);
  const [chiefInvigilatorName, setChiefInvigilatorName] = useState("");
  const [assistantInvigilatorName, setAssistantInvigilatorName] = useState("");
  const [signature, setSignature] = useState(null); // { imageUrl, imageHash, signedAt }
  const [signatureUploading, setSignatureUploading] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});

  function setFieldError(key, message) {
    setFieldErrors((prev) => {
      if (!message) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: message };
    });
  }

  function validateExamDetailField(key, value) {
    if (key === "seatNumber") return ""; // only optional field on this step
    if (!String(value || "").trim()) return `${EXAM_DETAIL_LABELS[key]} is required.`;
    return "";
  }

  function validateCandidateField(key, value) {
    const v = String(value || "").trim();
    if (key === "fullName" && !v) return "Full name is required.";
    if (key === "matricNumber" && !v) return "Matric number is required.";
    if (key === "email") {
      if (!v) return "Email is required.";
      if (!EMAIL_RE.test(v)) return "Enter a valid email address.";
    }
    if (key === "phone" && v && !PHONE_RE.test(v)) {
      return "Enter a valid phone number.";
    }
    return "";
  }

  function validateExhibitField(key, value, exhibit) {
    // Only enforce once a photo has actually been attached to this row —
    // an untouched blank row shouldn't nag the user, but a row that's
    // partway filled in with a photo already uploaded must be complete
    // before submit (this is exactly the gap that let an incomplete
    // exhibit reach the backend and fail validation after the report was
    // already saved).
    if (!exhibit.photoUrl) return "";
    if (!String(value || "").trim()) {
      const labels = { description: "Description", tagNumber: "Tag number", custodyLocation: "Custody location" };
      return `${labels[key]} is required once a photo is attached.`;
    }
    return "";
  }

  function validateWitnessField(key, value) {
    if (!String(value || "").trim()) {
      const labels = { fullName: "Full name", designation: "Designation", staffOrRegNo: "Staff/reg no." };
      return `${labels[key]} is required.`;
    }
    return "";
  }

  function examField(key) {
    return (e) => {
      const value = e.target.value;
      setExamDetails((prev) => ({ ...prev, [key]: value }));
      if (fieldErrors[`exam.${key}`]) {
        setFieldError(`exam.${key}`, validateExamDetailField(key, value));
      }
    };
  }
  function examBlur(key) {
    return (e) => setFieldError(`exam.${key}`, validateExamDetailField(key, e.target.value));
  }

  function candidateField(key) {
    return (e) => {
      const value = e.target.value;
      setCandidate((prev) => ({ ...prev, [key]: value }));
      if (fieldErrors[`candidate.${key}`]) {
        setFieldError(`candidate.${key}`, validateCandidateField(key, value));
      }
    };
  }
  function candidateBlur(key) {
    return (e) => setFieldError(`candidate.${key}`, validateCandidateField(key, e.target.value));
  }

  function exhibitBlur(idx, key) {
    return (e) => {
      const exhibit = { ...exhibits[idx], [key]: e.target.value };
      setFieldError(`exhibit.${idx}.${key}`, validateExhibitField(key, e.target.value, exhibit));
    };
  }
  function witnessBlur(idx, key) {
    return (e) => setFieldError(`witness.${idx}.${key}`, validateWitnessField(key, e.target.value));
  }

  function handleFacultyChange(e) {
    const faculty = e.target.value;
    // Department is dependent on faculty — clear it whenever faculty
    // changes so a stale department from a different faculty can't survive.
    setExamDetails((prev) => ({ ...prev, faculty, department: "" }));
  }

  function toggleOffence(type) {
    setOffenceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }
  function toggleAction(action) {
    setImmediateActions((prev) =>
      prev.includes(action)
        ? prev.filter((a) => a !== action)
        : [...prev, action],
    );
  }

  function addExhibitRow() {
    setExhibits((prev) => [
      ...prev,
      {
        description: "",
        tagNumber: "",
        custodyLocation: "",
        photoUrl: "",
        photoHash: "",
      },
    ]);
  }
  function updateExhibit(idx, key, value) {
    setExhibits((prev) =>
      prev.map((ex, i) => (i === idx ? { ...ex, [key]: value } : ex)),
    );
    if (fieldErrors[`exhibit.${idx}.${key}`]) {
      const exhibit = { ...exhibits[idx], [key]: value };
      setFieldError(`exhibit.${idx}.${key}`, validateExhibitField(key, value, exhibit));
    }
  }
  function removeExhibit(idx) {
    setExhibits((prev) => prev.filter((_, i) => i !== idx));
    setFieldErrors((prev) => {
      const next = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`exhibit.${idx}.`)) next[k] = v;
      }
      return next;
    });
  }
  async function uploadExhibitPhoto(idx, file) {
    updateExhibit(idx, "uploading", true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const { photoUrl, photoHash } = await api.post(
        "/reports/upload-exhibit",
        fd,
        { isFormData: true },
      );
      setExhibits((prev) =>
        prev.map((ex, i) =>
          i === idx ? { ...ex, photoUrl, photoHash, uploading: false } : ex,
        ),
      );
      // A photo just landed on this row, which makes description/tag
      // number/custody location required (see validateExhibitField) —
      // check them now instead of waiting for the user to blur each one,
      // so the requirement is visible immediately.
      const updated = { ...exhibits[idx], photoUrl };
      for (const key of ["description", "tagNumber", "custodyLocation"]) {
        setFieldError(`exhibit.${idx}.${key}`, validateExhibitField(key, updated[key], updated));
      }
    } catch (err) {
      setError(err.message);
      updateExhibit(idx, "uploading", false);
    }
  }

  function addWitnessRow() {
    setWitnesses((prev) => [
      ...prev,
      { fullName: "", designation: "", staffOrRegNo: "" },
    ]);
  }
  function updateWitness(idx, key, value) {
    setWitnesses((prev) =>
      prev.map((w, i) => (i === idx ? { ...w, [key]: value } : w)),
    );
    if (fieldErrors[`witness.${idx}.${key}`]) {
      setFieldError(`witness.${idx}.${key}`, validateWitnessField(key, value));
    }
  }
  function removeWitness(idx) {
    setWitnesses((prev) => prev.filter((_, i) => i !== idx));
    setFieldErrors((prev) => {
      const next = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`witness.${idx}.`)) next[k] = v;
      }
      return next;
    });
  }

  async function captureSignature(blob) {
    if (!blob) {
      setSignature(null);
      return;
    }
    setSignatureUploading(true);
    try {
      const fd = new FormData();
      fd.append("signature", blob, "signature.png");
      const result = await api.post("/reports/upload-signature", fd, {
        isFormData: true,
      });
      setSignature(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSignatureUploading(false);
    }
  }

  // Runs the same per-field validators used for inline/on-blur checks
  // against every field in the current step, so clicking Next/Submit
  // immediately without touching anything still surfaces every specific
  // inline error at once — not just the first generic problem found.
  function validateStep() {
    setError("");
    let firstIssue = "";

    if (step === 0) {
      for (const key of Object.keys(EXAM_DETAIL_LABELS)) {
        const msg = validateExamDetailField(key, examDetails[key]);
        setFieldError(`exam.${key}`, msg);
        if (msg && !firstIssue) firstIssue = "Please complete all examination details.";
      }
    }
    if (step === 1) {
      for (const key of ["fullName", "matricNumber", "email", "phone"]) {
        const msg = validateCandidateField(key, candidate[key]);
        setFieldError(`candidate.${key}`, msg);
        if (msg && !firstIssue) firstIssue = "Please fix the highlighted candidate details.";
      }
    }
    if (step === 2) {
      if (offenceTypes.length === 0) firstIssue = "Select at least one offence type.";
    }
    if (step === 3) {
      if (!narrative.trim()) firstIssue = "Narrative is required.";
    }
    if (step === 4) {
      exhibits.forEach((ex, idx) => {
        for (const key of ["description", "tagNumber", "custodyLocation"]) {
          const msg = validateExhibitField(key, ex[key], ex);
          setFieldError(`exhibit.${idx}.${key}`, msg);
          if (msg && !firstIssue) firstIssue = "Complete the required fields on each exhibit with a photo attached.";
        }
      });
    }
    if (step === 5) {
      witnesses.forEach((w, idx) => {
        for (const key of ["fullName", "designation", "staffOrRegNo"]) {
          const msg = validateWitnessField(key, w[key]);
          setFieldError(`witness.${idx}.${key}`, msg);
          if (msg && !firstIssue) firstIssue = "Complete the required fields on each witness row.";
        }
      });
    }
    if (step === 6) {
      if (!candidateStatement.trim() && !candidateDeclined)
        firstIssue = "Enter the candidate's statement or check that they declined.";
    }
    if (step === 8) {
      if (!chiefInvigilatorName) firstIssue = "Chief invigilator name is required.";
      else if (!signature)
        firstIssue = "Candidate's drawn signature is required before submission.";
    }
    return firstIssue;
  }

  function next() {
    const err = validateStep();
    if (err) return setError(err);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }
  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    const err = validateStep();
    if (err) return setError(err);
    setSubmitting(true);
    setError("");
    try {
      await api.post("/reports", {
        examDetails,
        candidate,
        offenceTypes,
        offenceOther,
        narrative,
        candidateStatement,
        candidateDeclined,
        immediateActions,
        chiefInvigilatorName,
        assistantInvigilatorName: assistantInvigilatorName || undefined,
        candidateSignature: signature,
        exhibits: exhibits
          .filter((e) => e.photoUrl)
          .map(({ uploading, ...e }) => e),
        witnesses,
      });
      navigate("/reports/mine");
    } catch (err2) {
      setError(err2.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-title">
        <h1>File an Incident Report</h1>
      </div>
      <div className="wizard-steps">
        {STEP_LABELS.map((label, i) => (
          <span
            key={label}
            className={i === step ? "current" : i < step ? "done" : ""}
          >
            {String(i + 1).padStart(2, "0")} {label}
          </span>
        ))}
      </div>

      <div className="card">
        {error && <div className="error-banner">{error}</div>}

        {step === 0 && (
          <div className="field-grid">
            <div className="form-row">
              <label>Faculty</label>
              <select
                value={examDetails.faculty}
                onChange={handleFacultyChange}
                onBlur={examBlur("faculty")}
              >
                <option value="">Select faculty…</option>
                {FACULTY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors["exam.faculty"]} />
            </div>
            <div className="form-row">
              <label>Department</label>
              <select
                value={examDetails.department}
                onChange={examField("department")}
                onBlur={examBlur("department")}
                disabled={!examDetails.faculty}
              >
                <option value="">
                  {examDetails.faculty
                    ? "Select department…"
                    : "Select a faculty first"}
                </option>
                {departmentsFor(examDetails.faculty).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors["exam.department"]} />
            </div>
            <div className="form-row">
              {/* Stored under examDetails.programme to match the existing
                  backend schema field — displayed as "Degree" since a
                  dropdown of degree types is what's actually being captured. */}
              <label>Degree</label>
              <select
                value={examDetails.programme}
                onChange={examField("programme")}
                onBlur={examBlur("programme")}
              >
                <option value="">Select degree…</option>
                {DEGREES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors["exam.programme"]} />
            </div>
            <div className="form-row">
              <label>Level</label>
              <select value={examDetails.level} onChange={examField("level")} onBlur={examBlur("level")}>
                <option value="">Select level…</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l} Level
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors["exam.level"]} />
            </div>
            <div className="form-row">
              <label>Session</label>
              <select value={examDetails.session} onChange={examField("session")} onBlur={examBlur("session")}>
                {sessionOptions(10).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors["exam.session"]} />
            </div>
            <div className="form-row">
              <label>Semester</label>
              <select
                value={examDetails.semester}
                onChange={examField("semester")}
                onBlur={examBlur("semester")}
              >
                <option value="">Select semester…</option>
                {SEMESTERS.map((s) => (
                  <option key={s} value={s}>
                    {s} Semester
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors["exam.semester"]} />
            </div>
            <div className="form-row">
              <label>Course code</label>
              <input
                value={examDetails.courseCode}
                onChange={examField("courseCode")}
                onBlur={examBlur("courseCode")}
              />
              <FieldError message={fieldErrors["exam.courseCode"]} />
            </div>
            <div className="form-row">
              <label>Course title</label>
              <input
                value={examDetails.courseTitle}
                onChange={examField("courseTitle")}
                onBlur={examBlur("courseTitle")}
              />
              <FieldError message={fieldErrors["exam.courseTitle"]} />
            </div>
            <div className="form-row">
              <label>Exam date</label>
              <input
                type="date"
                value={examDetails.examDate}
                onChange={examField("examDate")}
                onBlur={examBlur("examDate")}
              />
              <FieldError message={fieldErrors["exam.examDate"]} />
            </div>
            <div className="form-row">
              <label>Venue / hall</label>
              <input value={examDetails.venue} onChange={examField("venue")} onBlur={examBlur("venue")} />
              <FieldError message={fieldErrors["exam.venue"]} />
            </div>
            <div className="form-row">
              <label>Time start</label>
              <input
                type="time"
                value={examDetails.timeStart}
                onChange={examField("timeStart")}
                onBlur={examBlur("timeStart")}
              />
              <FieldError message={fieldErrors["exam.timeStart"]} />
            </div>
            <div className="form-row">
              <label>Time end</label>
              <input
                type="time"
                value={examDetails.timeEnd}
                onChange={examField("timeEnd")}
                onBlur={examBlur("timeEnd")}
              />
              <FieldError message={fieldErrors["exam.timeEnd"]} />
            </div>
            <div className="form-row">
              <label>Seat number</label>
              <input
                value={examDetails.seatNumber}
                onChange={examField("seatNumber")}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <p
              style={{
                color: "var(--ink-soft)",
                fontSize: "0.85rem",
                marginTop: 0,
              }}
            >
              A student account is created automatically from these details,
              with the matric number as the default password.
            </p>
            <div className="field-grid">
              <div className="form-row">
                <label>Full name</label>
                <input
                  value={candidate.fullName}
                  onChange={candidateField("fullName")}
                  onBlur={candidateBlur("fullName")}
                />
                <FieldError message={fieldErrors["candidate.fullName"]} />
              </div>
              <div className="form-row">
                <label>Matric number</label>
                <input
                  value={candidate.matricNumber}
                  onChange={candidateField("matricNumber")}
                  onBlur={candidateBlur("matricNumber")}
                />
                <FieldError message={fieldErrors["candidate.matricNumber"]} />
              </div>
              <div className="form-row">
                <label>Degree</label>
                <select
                  value={candidate.programme}
                  onChange={candidateField("programme")}
                >
                  <option value="">Select degree…</option>
                  {DEGREES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Level</label>
                <select
                  value={candidate.level}
                  onChange={candidateField("level")}
                >
                  <option value="">Select level…</option>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l} Level
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Phone</label>
                <input
                  value={candidate.phone}
                  onChange={candidateField("phone")}
                  onBlur={candidateBlur("phone")}
                />
                <FieldError message={fieldErrors["candidate.phone"]} />
              </div>
              <div className="form-row">
                <label>Email</label>
                <input
                  type="email"
                  value={candidate.email}
                  onChange={candidateField("email")}
                  onBlur={candidateBlur("email")}
                />
                <FieldError message={fieldErrors["candidate.email"]} />
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field-label" style={{ marginBottom: 10 }}>
              Nature of offence (select all that apply)
            </div>
            <div className="checkbox-grid">
              {OFFENCE_TYPES.map((type) => (
                <label className="checkbox-row" key={type}>
                  <input
                    type="checkbox"
                    checked={offenceTypes.includes(type)}
                    onChange={() => toggleOffence(type)}
                  />
                  {type}
                </label>
              ))}
            </div>
            {offenceTypes.includes("Other") && (
              <div className="form-row" style={{ marginTop: 14 }}>
                <label>Please specify</label>
                <input
                  value={offenceOther}
                  onChange={(e) => setOffenceOther(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <div className="form-row">
            <label>Narrative — describe the incident in your own words</label>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              style={{ minHeight: 220 }}
            />
          </div>
        )}

        {step === 4 && (
          <>
            {exhibits.map((ex, idx) => (
              <div className="repeatable-row" key={idx}>
                <div className="field-grid">
                  <div className="form-row">
                    <label>Description</label>
                    <input
                      value={ex.description}
                      onChange={(e) =>
                        updateExhibit(idx, "description", e.target.value)
                      }
                      onBlur={exhibitBlur(idx, "description")}
                    />
                    <FieldError message={fieldErrors[`exhibit.${idx}.description`]} />
                  </div>
                  <div className="form-row">
                    <label>Tag number</label>
                    <input
                      value={ex.tagNumber}
                      onChange={(e) =>
                        updateExhibit(idx, "tagNumber", e.target.value)
                      }
                      onBlur={exhibitBlur(idx, "tagNumber")}
                    />
                    <FieldError message={fieldErrors[`exhibit.${idx}.tagNumber`]} />
                  </div>
                  <div className="form-row">
                    <label>Custody location</label>
                    <input
                      value={ex.custodyLocation}
                      onChange={(e) =>
                        updateExhibit(idx, "custodyLocation", e.target.value)
                      }
                      onBlur={exhibitBlur(idx, "custodyLocation")}
                    />
                    <FieldError message={fieldErrors[`exhibit.${idx}.custodyLocation`]} />
                  </div>
                  <div className="form-row">
                    <label>Photo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        e.target.files[0] &&
                        uploadExhibitPhoto(idx, e.target.files[0])
                      }
                    />
                    {ex.uploading && (
                      <span
                        style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}
                      >
                        Uploading…
                      </span>
                    )}
                    {ex.photoUrl && (
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--status-verdict-fg)",
                        }}
                      >
                        Uploaded ✓
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => removeExhibit(idx)}
                >
                  Remove exhibit
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={addExhibitRow}
            >
              + Add exhibit
            </button>
          </>
        )}

        {step === 5 && (
          <>
            {witnesses.map((w, idx) => (
              <div className="repeatable-row" key={idx}>
                <div className="field-grid">
                  <div className="form-row">
                    <label>Full name</label>
                    <input
                      value={w.fullName}
                      onChange={(e) =>
                        updateWitness(idx, "fullName", e.target.value)
                      }
                      onBlur={witnessBlur(idx, "fullName")}
                    />
                    <FieldError message={fieldErrors[`witness.${idx}.fullName`]} />
                  </div>
                  <div className="form-row">
                    <label>Designation</label>
                    <input
                      value={w.designation}
                      onChange={(e) =>
                        updateWitness(idx, "designation", e.target.value)
                      }
                      onBlur={witnessBlur(idx, "designation")}
                    />
                    <FieldError message={fieldErrors[`witness.${idx}.designation`]} />
                  </div>
                  <div className="form-row">
                    <label>Staff / reg no.</label>
                    <input
                      value={w.staffOrRegNo}
                      onChange={(e) =>
                        updateWitness(idx, "staffOrRegNo", e.target.value)
                      }
                      onBlur={witnessBlur(idx, "staffOrRegNo")}
                    />
                    <FieldError message={fieldErrors[`witness.${idx}.staffOrRegNo`]} />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => removeWitness(idx)}
                >
                  Remove witness
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={addWitnessRow}
            >
              + Add witness
            </button>
          </>
        )}

        {step === 6 && (
          <>
            <div className="form-row">
              <label>Candidate's statement</label>
              <textarea
                value={candidateStatement}
                onChange={(e) => setCandidateStatement(e.target.value)}
                disabled={candidateDeclined}
              />
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={candidateDeclined}
                onChange={(e) => {
                  setCandidateDeclined(e.target.checked);
                  if (e.target.checked) setCandidateStatement("");
                }}
              />
              Candidate declined to make a statement (witnessed)
            </label>
          </>
        )}

        {step === 7 && (
          <div className="checkbox-grid">
            {IMMEDIATE_ACTIONS.map((action) => (
              <label className="checkbox-row" key={action}>
                <input
                  type="checkbox"
                  checked={immediateActions.includes(action)}
                  onChange={() => toggleAction(action)}
                />
                {action}
              </label>
            ))}
          </div>
        )}

        {step === 8 && (
          <>
            <div className="field-grid">
              <div className="form-row">
                <label>Chief invigilator name</label>
                <input
                  value={chiefInvigilatorName}
                  onChange={(e) => setChiefInvigilatorName(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label>Assistant invigilator (optional)</label>
                <input
                  value={assistantInvigilatorName}
                  onChange={(e) => setAssistantInvigilatorName(e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <label>Candidate's signature — drawn on this device</label>
              <SignaturePad onCapture={captureSignature} />
              {signatureUploading && (
                <p style={{ fontSize: "0.82rem", color: "var(--ink-soft)" }}>
                  Uploading signature…
                </p>
              )}
              {signature && (
                <p
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--status-verdict-fg)",
                  }}
                >
                  Signature captured ✓
                </p>
              )}
            </div>
          </>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 28,
          }}
        >
          <button
            type="button"
            className="btn secondary"
            onClick={back}
            disabled={step === 0}
          >
            Back
          </button>
          {step < STEP_LABELS.length - 1 ? (
            <button type="button" className="btn" onClick={next}>
              Next
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
