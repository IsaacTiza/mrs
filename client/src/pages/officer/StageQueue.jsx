import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import ReportListTable from '../../components/ReportListTable';

const TITLE = {
  exam_officer: 'Stage Queue',
  college_officer: 'College Queue',
  registry_officer: 'Registry Queue',
  senate_board: 'Senate Queue',
  senate_president: 'Senate Queue',
};

export default function StageQueue() {
  const { user } = useAuth();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/stage-queue').then(setReports).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-title">
        <h1>{TITLE[user?.role] || 'Queue'}</h1>
      </div>
      <div className="card">
        {error && <div className="error-banner">{error}</div>}
        {reports ? (
          <ReportListTable reports={reports} emptyMessage="No cases currently at your stage." />
        ) : (
          <p className="empty-state">Loading…</p>
        )}
      </div>
    </div>
  );
}
