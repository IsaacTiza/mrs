import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import ReportListTable from '../../components/ReportListTable';

// Spec addition (2026-08-25): every internal review role should be able to
// look back at cases that already moved past their own stage — the case
// concerned them while it was in their hands, so they should be able to
// see how it turned out, not just the cases still sitting with them.
// Backed by GET /reports/passed-cases, which reuses the exact same
// READ_STAGES lists middleware/ownership.js grants 'read' access from.
export default function PassedCases() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/passed-cases').then(setReports).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-title"><h1>Passed Cases</h1></div>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: -8 }}>
        Cases that already moved past your stage — read-only, for reference.
      </p>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        {reports ? (
          <ReportListTable reports={reports} emptyMessage="No cases have passed through your stage yet." />
        ) : (
          <p className="empty-state">Loading…</p>
        )}
      </div>
    </div>
  );
}
