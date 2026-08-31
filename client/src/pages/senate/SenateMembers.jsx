import { useEffect, useState } from 'react';
import { api } from '../../api/client';

// Senate President's oversight directory (spec: "he can see all the
// senate board members"). Per-case review notes live on the case's own
// page instead (CaseDetail's Senate section) — this page is just the
// member list.
export default function SenateMembers() {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/senate/members').then(setMembers).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-title"><h1>Senate Board Members</h1></div>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        {!members ? (
          <p className="empty-state">Loading…</p>
        ) : members.length === 0 ? (
          <p className="empty-state">No Senate Board members have been created yet.</p>
        ) : (
          members.map((m) => (
            <div
              key={m._id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div>
                <div>{m.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>{m.email}</div>
              </div>
              <span
                className="stamp"
                style={{
                  background: m.status === 'active' ? 'var(--status-submitted-bg)' : 'var(--status-closed-bg)',
                  color: m.status === 'active' ? 'var(--status-submitted-fg)' : 'var(--status-closed-fg)',
                }}
              >
                {m.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
