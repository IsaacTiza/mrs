import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import ReportListTable from '../../components/ReportListTable';

export default function MySubmissions() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/my-submissions').then(setReports).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-title">
        <h1>My Submissions</h1>
        <Link className="btn" to="/reports/new">File a Report</Link>
      </div>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        {reports ? (
          <ReportListTable reports={reports} emptyMessage="You haven't filed any reports yet." />
        ) : (
          <p className="empty-state">Loading…</p>
        )}
      </div>
    </div>
  );
}
