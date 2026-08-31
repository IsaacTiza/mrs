import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { FACULTIES, FACULTY_OPTIONS } from '../invigilator/academicOptions';

const ROLES = [
  { value: 'exam_officer', label: 'Exam Officer' },
  { value: 'college_officer', label: 'College Officer' },
  { value: 'registry_officer', label: 'Registry Officer' },
  { value: 'senate_board', label: 'Senate Board' },
  { value: 'senate_president', label: 'Senate President' },
  { value: 'super_admin', label: 'Super Admin' },
];

// Flattened, de-duplicated, alphabetical list of every department across
// all faculties (client/src/pages/invigilator/academicOptions.js) — same
// source of truth the invigilator's report wizard uses for
// examDetails.department, so an Exam Officer's assigned department always
// matches a value a report can actually carry (spec: the department on the
// report is what routes it to the right Exam Officer's queue).
const ALL_DEPARTMENTS = Array.from(
  new Set(Object.values(FACULTIES).flatMap((f) => f.departments))
).sort();

export default function AdminPanel() {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '', role: 'exam_officer', department: '', college: '' });
  const [busy, setBusy] = useState(false);

  function updateRole(role) {
    // Department only means anything for an Exam Officer, college only for
    // a College Officer — clear whichever doesn't apply when switching
    // away so a stale value can't get sent for the wrong role.
    setStaffForm((f) => ({
      ...f,
      role,
      department: role === 'exam_officer' ? f.department : '',
      college: role === 'college_officer' ? f.college : '',
    }));
  }

  function loadPending() {
    api.get('/admin/users/pending').then(setPending).catch((e) => setError(e.message));
  }
  useEffect(loadPending, []);

  async function approve(userId) {
    setError('');
    try {
      await api.patch(`/admin/users/${userId}/approve`, {});
      loadPending();
    } catch (e) {
      setError(e.message);
    }
  }

  async function createStaff(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (staffForm.role === 'exam_officer' && !staffForm.department) {
      setError('Select the department this Exam Officer will handle reports for');
      return;
    }
    setBusy(true);
    try {
      await api.post('/admin/users', staffForm);
      setNotice(`${staffForm.name} created and active.`);
      setStaffForm({ name: '', email: '', password: '', role: 'exam_officer', department: '', college: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-title"><h1>User Management</h1></div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Pending Invigilator Registrations</h2>
        {error && <div className="error-banner">{error}</div>}
        {!pending ? (
          <p className="empty-state">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="empty-state">No registrations awaiting approval.</p>
        ) : (
          pending.map((u) => (
            <div key={u._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                <div>{u.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>{u.email}</div>
              </div>
              <button className="btn" onClick={() => approve(u._id)}>Approve</button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Create Staff Account</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
          Exam Officer, College Officer, Registry Officer, Senate Board, Senate President, and
          Super Admin accounts are created here directly — no self-registration or approval step
          for these roles. An Exam Officer only sees reports filed against students in their
          assigned department. The Senate President oversees all Senate Board members and passes
          each case's final verdict.
        </p>
        {notice && <div className="notice-banner">{notice}</div>}
        <form onSubmit={createStaff}>
          <div className="field-grid">
            <div className="form-row"><label>Name</label><input value={staffForm.name} onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))} required /></div>
            <div className="form-row"><label>Email</label><input type="email" value={staffForm.email} onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))} required /></div>
            <div className="form-row"><label>Temporary password</label><input type="password" value={staffForm.password} onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))} minLength={8} required /></div>
            <div className="form-row">
              <label>Role</label>
              <select value={staffForm.role} onChange={(e) => updateRole(e.target.value)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {staffForm.role === 'exam_officer' && (
              <div className="form-row">
                <label>Department</label>
                <select
                  value={staffForm.department}
                  onChange={(e) => setStaffForm((f) => ({ ...f, department: e.target.value }))}
                  required
                >
                  <option value="">Select…</option>
                  {ALL_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            {staffForm.role === 'college_officer' && (
              <div className="form-row">
                <label>College (optional — leave blank to see every college)</label>
                <select
                  value={staffForm.college}
                  onChange={(e) => setStaffForm((f) => ({ ...f, college: e.target.value }))}
                >
                  <option value="">All colleges (unscoped)</option>
                  {FACULTY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
      </div>
    </div>
  );
}
