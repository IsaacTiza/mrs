import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { subscribeSSE } from '../../api/sseClient';

const PAGE_SIZE = 50;

function actorLabel(actor) {
  if (!actor) return 'Unknown';
  return actor.name || actor.email || 'Unknown';
}

function StatusChangeRow({ l }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: '0.88rem' }}>
      <span className="mono" style={{ color: 'var(--ink-soft)' }}>
        {new Date(l.timestamp).toLocaleString()}
      </span>{' '}
      — <strong>{actorLabel(l.actor)}</strong>
      {l.actor?.role && ` (${l.actor.role})`}: {l.fromStatus} &rarr; {l.toStatus}
      {l.note && <div style={{ color: 'var(--ink-soft)' }}>{l.note}</div>}
    </div>
  );
}

function LoginRow({ l }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: '0.88rem' }}>
      <span className="mono" style={{ color: 'var(--ink-soft)' }}>
        {new Date(l.timestamp).toLocaleString()}
      </span>{' '}
      —{' '}
      <span style={{ color: l.success ? 'var(--status-approved-fg, #2e7d32)' : 'var(--status-rejected-fg, #c0392b)' }}>
        {l.success ? 'Login succeeded' : 'Login FAILED'}
      </span>{' '}
      — <strong>{actorLabel(l.actor)}</strong>
      {l.actor?.role && ` (${l.actor.role})`}
      {!l.success && l.reason && <span style={{ color: 'var(--ink-soft)' }}> — {l.reason}</span>}
      {l.ip && <div style={{ color: 'var(--ink-soft)' }}>IP: {l.ip}</div>}
    </div>
  );
}

// Pagination added (spec fix: an unpaginated feed meant years of use
// would eventually pour every login/status-change event onto the admin
// at once). page is 1-indexed to match the server's ?page= param.
export default function AuditLog() {
  const [logs, setLogs] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .getFull(`/admin/audit-logs?page=${page}&limit=${PAGE_SIZE}`)
      .then((res) => {
        setLogs(res.data);
        setPagination(res.pagination);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = pagination?.pages || 1;

  // Live path: a new StatusHistory/LoginEvent row pushed the instant it's
  // created (see the post-save hooks on those two models), instead of
  // the admin only finding out on next page load. Only page 1 gets the
  // row prepended directly — doing that on page 3, say, would silently
  // shift every row the admin is currently looking at and desync
  // `page`/`pagination.pages` against what the server would now return
  // for that same page number. Other pages just get the total count
  // bumped so the admin can see something new arrived and page back to
  // it if they want to.
  useEffect(() => {
    return subscribeSSE('audit', (entry) => {
      setPagination((prev) => {
        if (!prev) return prev;
        const total = prev.total + 1;
        return { ...prev, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
      });
      if (page !== 1) return;
      setLogs((prev) => {
        if (!prev || prev.some((l) => l.id === entry.id)) return prev;
        return [entry, ...prev].slice(0, PAGE_SIZE);
      });
    });
  }, [page]);

  return (
    <div>
      <div className="page-title">
        <h1>Audit Trail</h1>
        {pagination && (
          <span style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
            {pagination.total} events total
          </span>
        )}
      </div>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        {!logs ? (
          <p className="empty-state">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="empty-state">No activity logged yet.</p>
        ) : (
          logs.map((l) =>
            l.type === 'login' ? <LoginRow key={l.id} l={l} /> : <StatusChangeRow key={l.id} l={l} />
          )
        )}

        {pagination && pagination.total > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <button
              className="btn secondary"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              className="btn secondary"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
