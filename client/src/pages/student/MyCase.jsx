import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import ReportListTable from '../../components/ReportListTable';

export default function MyCase() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/my-case').then(setReports).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-title"><h1>My Case Status</h1></div>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        {reports ? (
          <ReportListTable reports={reports} emptyMessage="No cases are associated with your account." />
        ) : (
          <p className="empty-state">Loading…</p>
        )}
      </div>
    </div>
  );
}
