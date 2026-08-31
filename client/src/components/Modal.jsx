// Minimal reusable confirmation modal. Used anywhere an action is
// irreversible enough (e.g. passing a verdict) that it deserves an
// explicit "are you sure" step instead of an inline warning banner that's
// easy to miss or misread as a plain error.
export default function Modal({ title, children, confirmLabel = 'Confirm', onConfirm, onCancel, busy }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginBottom: 20 }}>{children}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
