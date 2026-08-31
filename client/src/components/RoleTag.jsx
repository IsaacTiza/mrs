const COLORS = {
  invigilator: ['var(--role-invigilator-bg)', 'var(--role-invigilator-fg)'],
  exam_officer: ['var(--role-exam-officer-bg)', 'var(--role-exam-officer-fg)'],
  college_officer: ['var(--role-college-officer-bg)', 'var(--role-college-officer-fg)'],
  registry_officer: ['var(--role-registry-officer-bg)', 'var(--role-registry-officer-fg)'],
  senate_board: ['var(--role-senate-board-bg)', 'var(--role-senate-board-fg)'],
  senate_president: ['var(--role-senate-president-bg)', 'var(--role-senate-president-fg)'],
  super_admin: ['var(--role-super-admin-bg)', 'var(--role-super-admin-fg)'],
  student: ['var(--role-student-bg)', 'var(--role-student-fg)'],
};

const LABEL = {
  invigilator: 'Invigilator',
  exam_officer: 'Exam Officer',
  college_officer: 'College Officer',
  registry_officer: 'Registry Officer',
  senate_board: 'Senate Board',
  senate_president: 'Senate President',
  super_admin: 'Super Admin',
  student: 'Student',
};

export default function RoleTag({ role }) {
  const [bg, fg] = COLORS[role] || ['var(--role-student-bg)', 'var(--role-student-fg)'];
  return (
    <span className="stamp" style={{ background: bg, color: fg }}>
      {LABEL[role] || role}
    </span>
  );
}
