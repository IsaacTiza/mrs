import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import ReportListTable from '../../components/ReportListTable';

export default function AllReports() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/all').then(setReports).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-title"><h1>All Cases</h1></div>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        {reports ? (
          <ReportListTable reports={reports} emptyMessage="No cases in the system yet." />
        ) : (
          <p className="empty-state">Loading…</p>
        )}
      </div>
    </div>
  );
}
