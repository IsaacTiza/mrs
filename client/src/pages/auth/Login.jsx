import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      const dest = {
        invigilator: '/reports/mine',
        exam_officer: '/queue',
        college_officer: '/queue',
        registry_officer: '/queue',
        senate_board: '/queue',
        super_admin: '/admin',
        student: '/my-case',
      }[user.role];
      navigate(dest || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--brand-dark)',
      }}
    >
      <div className="card" style={{ width: 380 }}>
        <h1 className="display" style={{ fontSize: '1.3rem', marginBottom: 4 }}>
          JOSTUM
        </h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', marginTop: 0, marginBottom: 24 }}>
          Examination Malpractice Reporting System
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Email (or Matric Number for students)</label>
            <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ fontSize: '0.82rem', marginTop: 18, color: 'var(--ink-soft)' }}>
          Invigilator? <Link to="/register">Register here</Link> — subject to Super Admin approval.
        </p>
        <p style={{ fontSize: '0.82rem', marginTop: 10, color: 'var(--ink-soft)' }}>
          Students don't register — an account is created automatically the moment a report is
          filed against you. Sign in with your matric number as <em>both</em> the username and the
          password (the exam officer on your case can also look up the email that was filed with
          your report, if one was used instead).
        </p>
      </div>
    </div>
  );
}
