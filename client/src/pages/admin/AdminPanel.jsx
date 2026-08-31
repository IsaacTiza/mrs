import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { FACULTIES, FACULTY_OPTIONS } from '../invigilator/academicOptions';
import RoleTag from '../../components/RoleTag';
import Modal from '../../components/Modal';

// Display order for the user-directory groups below — same role set the
// Create Staff form uses, plus invigilator/student who aren't admin-created
// but still show up in the directory once they exist.
const ROLE_ORDER = [
  'super_admin',
  'senate_president',
  'senate_board',
  'registry_officer',
  'college_officer',
  'exam_officer',
  'invigilator',
  'student',
];

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
  const [allUsers, setAllUsers] = useState(null);
  const [rowError, setRowError] = useState('');
  const [rowNotice, setRowNotice] = useState('');
  const [rowBusy, setRowBusy] = useState(false);

  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [resettingUser, setResettingUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  function loadAllUsers() {
    api.get('/admin/users').then(setAllUsers).catch((e) => setError(e.message));
  }
  useEffect(loadAllUsers, []);

  // Role can only be reassigned between the admin-creatable staff roles
  // (the ROLES list above) — an invigilator or student account was never
  // created here, so its edit form doesn't offer a role change at all,
  // matching the server-side guard in updateUser.
  function isStaffRole(role) {
    return ROLES.some((r) => r.value === role);
  }

  function openEdit(user) {
    setRowError('');
    setRowNotice('');
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department || '',
      college: user.college || '',
    });
  }

  async function saveEdit() {
    setRowError('');
    setRowBusy(true);
    try {
      await api.patch(`/admin/users/${editingUser._id}`, editForm);
      setEditingUser(null);
      setRowNotice(`${editForm.name} updated.`);
      loadAllUsers();
    } catch (e) {
      setRowError(e.message);
    } finally {
      setRowBusy(false);
    }
  }

  function openReset(user) {
    setRowError('');
    setRowNotice('');
    setNewPassword('');
    setResettingUser(user);
  }

  // Convenience for the "forgot their password" case — generates a
  // random 10-character temp password the admin can hand to the user,
  // instead of the admin having to invent one on the spot.
  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setNewPassword(out);
  }

  async function submitReset() {
    if (newPassword.length < 8) {
      setRowError('Password must be at least 8 characters');
      return;
    }
    setRowError('');
    setRowBusy(true);
    try {
      await api.patch(`/admin/users/${resettingUser._id}/reset-password`, { newPassword });
      setRowNotice(`Password reset for ${resettingUser.name}. Share the new password with them securely: ${newPassword}`);
      setResettingUser(null);
    } catch (e) {
      setRowError(e.message);
    } finally {
      setRowBusy(false);
    }
  }

  async function toggleStatus(user) {
    setRowError('');
    setRowNotice('');
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      await api.patch(`/admin/users/${user._id}/status`, { status: nextStatus });
      loadAllUsers();
    } catch (e) {
      setRowError(e.message);
    }
  }

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
      loadAllUsers();
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
      loadAllUsers();
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

      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>All Users by Role</h2>
        {rowError && <div className="error-banner">{rowError}</div>}
        {rowNotice && <div className="notice-banner">{rowNotice}</div>}
        {!allUsers ? (
          <p className="empty-state">Loading…</p>
        ) : Object.keys(allUsers).length === 0 ? (
          <p className="empty-state">No users found.</p>
        ) : (
          ROLE_ORDER.filter((role) => allUsers[role]?.length).map((role) => (
            <div key={role} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <RoleTag role={role} />
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                  {allUsers[role].length} {allUsers[role].length === 1 ? 'user' : 'users'}
                </span>
              </div>
              {allUsers[role].map((u) => (
                <div
                  key={u._id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--line)',
                    gap: 12,
                  }}
                >
                  <div>
                    <div>{u.name}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                      {u.email}
                      {u.department ? ` · ${u.department}` : ''}
                      {u.college ? ` · ${u.college}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span
                      className="stamp"
                      style={
                        u.status === 'active'
                          ? { background: 'var(--status-verdict-bg)', color: 'var(--status-verdict-fg)' }
                          : u.status === 'disabled'
                          ? { background: 'var(--status-danger-bg)', color: 'var(--status-danger-fg)' }
                          : { background: 'var(--status-review-bg)', color: 'var(--status-review-fg)' }
                      }
                    >
                      {u.status}
                    </span>
                    <button className="btn secondary" style={{ padding: '5px 10px', fontSize: '0.78rem' }} onClick={() => openEdit(u)}>
                      Edit
                    </button>
                    <button className="btn secondary" style={{ padding: '5px 10px', fontSize: '0.78rem' }} onClick={() => openReset(u)}>
                      Reset password
                    </button>
                    {u.status !== 'pending_approval' && (
                      <button
                        className={u.status === 'active' ? 'btn danger' : 'btn secondary'}
                        style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                        onClick={() => toggleStatus(u)}
                      >
                        {u.status === 'active' ? 'Disable' : 'Activate'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {editingUser && editForm && (
        <Modal
          title={`Edit ${editingUser.name}`}
          confirmLabel={rowBusy ? 'Saving…' : 'Save changes'}
          onConfirm={saveEdit}
          onCancel={() => setEditingUser(null)}
          busy={rowBusy}
        >
          {rowError && <div className="error-banner" style={{ marginBottom: 12 }}>{rowError}</div>}
          <div className="form-row">
            <label>Name</label>
            <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="form-row">
            <label>Email</label>
            <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          {isStaffRole(editingUser.role) && (
            <div className="form-row">
              <label>Role</label>
              <select
                value={editForm.role}
                onChange={(e) => {
                  const role = e.target.value;
                  setEditForm((f) => ({
                    ...f,
                    role,
                    department: role === 'exam_officer' ? f.department : '',
                    college: role === 'college_officer' ? f.college : '',
                  }));
                }}
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          )}
          {isStaffRole(editingUser.role) && editForm.role === 'exam_officer' && (
            <div className="form-row">
              <label>Department</label>
              <select value={editForm.department} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}>
                <option value="">Unscoped (all departments)</option>
                {ALL_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {isStaffRole(editingUser.role) && editForm.role === 'college_officer' && (
            <div className="form-row">
              <label>College</label>
              <select value={editForm.college} onChange={(e) => setEditForm((f) => ({ ...f, college: e.target.value }))}>
                <option value="">All colleges (unscoped)</option>
                {FACULTY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}
        </Modal>
      )}

      {resettingUser && (
        <Modal
          title={`Reset password — ${resettingUser.name}`}
          confirmLabel={rowBusy ? 'Resetting…' : 'Set new password'}
          onConfirm={submitReset}
          onCancel={() => setResettingUser(null)}
          busy={rowBusy}
        >
          {rowError && <div className="error-banner" style={{ marginBottom: 12 }}>{rowError}</div>}
          <p style={{ marginTop: 0 }}>
            Set a new password for {resettingUser.email}. Share it with them directly — there's no
            reset-link email flow, so this is the only way they get back in.
          </p>
          <div className="form-row">
            <label>New password</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                style={{ flex: 1 }}
              />
              <button type="button" className="btn secondary" onClick={generatePassword}>
                Generate
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
