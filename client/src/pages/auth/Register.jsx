import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/register', form);
      setDone(true);
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
      <div className="card" style={{ width: 400 }}>
        <h1 className="display" style={{ fontSize: '1.3rem', marginBottom: 4 }}>
          Invigilator Registration
        </h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', marginTop: 0, marginBottom: 24 }}>
          Public self-registration is available for the Invigilator role only. Your account will
          be reviewed by a Super Admin before you can sign in.
        </p>
        {done ? (
          <>
            <div className="notice-banner">
              Registration received — pending Super Admin approval.
            </div>
            <Link to="/login">Back to sign in</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="error-banner">{error}</div>}
            <div className="form-row">
              <label>Full name</label>
              <input value={form.name} onChange={update('name')} required />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input type="email" value={form.email} onChange={update('email')} required />
            </div>
            <div className="form-row">
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={update('password')}
                minLength={8}
                required
              />
            </div>
            <button className="btn" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Submitting…' : 'Request access'}
            </button>
            <p style={{ fontSize: '0.82rem', marginTop: 18, color: 'var(--ink-soft)' }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
