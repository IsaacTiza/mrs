import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { subscribeSSE } from '../api/sseClient';

// Fallback poll — the live path is now the 'notification' SSE
// subscription below, which delivers new notifications the instant
// they're created (see the post-save hook on models/Notification.js).
// This interval just re-syncs in case the SSE connection is mid-
// reconnect (dropped wifi, server restart, backgrounded tab) — kept
// long since it's a safety net, not the primary delivery path anymore.
const POLL_MS = 60000;

// Rewritten (spec revision 2026-08-28): this used to be a small dropdown
// anchored under the button with `right: -220` — which pushed part of the
// card outside the nav rail and made it easy to miss or misread. Most
// users of this system are older staff, so it's now a centered modal
// (same modal-backdrop/modal-card classes Modal.jsx uses, for a
// consistent look) with a clearly labelled Close button.
export default function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.get('/notifications').then(setNotifications).catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Live path: prepend the instant a push arrives, deduped by _id in
  // case the periodic poll above and a live push race and both deliver
  // the same notification.
  useEffect(() => {
    return subscribeSSE('notification', (n) => {
      setNotifications((prev) => (prev.some((x) => x._id === n._id) ? prev : [n, ...prev]));
    });
  }, []);

  // Close on Escape — a modal that traps someone with no visible way out
  // (other than a button they might have trouble spotting) would be the
  // same "hard to see, hard to escape" problem this rewrite is fixing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function openNotification(n) {
    if (!n.read) {
      try {
        await api.patch(`/notifications/${n._id}/read`, {});
        setNotifications((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      } catch {
        // Non-critical — the notification still opens even if marking it
        // read fails; it'll just show unread again next poll.
      }
    }
    setOpen(false);
    if (n.reportId) navigate(`/reports/${n.reportId}`);
  }

  return (
    <>
      <button
        className="btn secondary"
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setOpen(true)}
      >
        <span>Notifications</span>
        {unreadCount > 0 && (
          <span
            style={{
              background: 'var(--status-senate-fg, #6a4fc7)',
              color: '#fff',
              borderRadius: 999,
              fontSize: '0.72rem',
              padding: '1px 7px',
              marginLeft: 8,
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Notifications</h3>
              {/* Explicit "x" close target in the corner, in addition to
                  the full-width "Close" button at the bottom below — spec
                  asked for "a close button", and having both a familiar
                  corner icon AND a plainly-labelled button covers users
                  unfamiliar with either convention on its own. */}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.4rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: 'var(--ink-soft)',
                  padding: 4,
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ overflowY: 'auto', marginTop: 8, marginBottom: 20 }}>
              {error && <div className="error-banner">{error}</div>}
              {notifications.length === 0 ? (
                <p className="empty-state" style={{ margin: 0 }}>No notifications yet.</p>
              ) : (
                notifications.slice(0, 30).map((n) => (
                  <div
                    key={n._id}
                    onClick={() => openNotification(n)}
                    style={{
                      padding: '14px 6px',
                      borderBottom: '1px solid var(--line)',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      lineHeight: 1.45,
                      opacity: n.read ? 0.65 : 1,
                      fontWeight: n.read ? 400 : 600,
                    }}
                  >
                    <div>{n.message}</div>
                    <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--ink-soft)', marginTop: 4 }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
