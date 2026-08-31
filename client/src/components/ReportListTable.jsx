import { Link } from 'react-router-dom';
import StatusStamp from './StatusStamp';

// Grid columns now live in global.css (.rlt-header/.rlt-row) instead of
// an inline style here — a mobile media query there switches the same
// classes to a stacked layout, which an inline style could never be
// overridden by from an external stylesheet without extra !important
// hacks. The .rlt-label spans are only ever shown by that same media
// query (hidden by default), giving each stacked field its own inline
// label on a narrow screen where the header row is hidden.
export default function ReportListTable({ reports, emptyMessage }) {
  if (!reports.length) return <p className="empty-state">{emptyMessage}</p>;
  return (
    <div>
      <div className="rlt-header">
        <span className="field-label">Case ref</span>
        <span className="field-label">Course</span>
        <span className="field-label">Filed</span>
        <span className="field-label">Status</span>
      </div>
      {reports.map((r) => (
        <Link key={r._id} to={`/reports/${r._id}`} className="rlt-row">
          <span className="mono">
            <span className="rlt-label">Case ref</span>
            {r._id.slice(-8).toUpperCase()}
          </span>
          <span>
            <span className="rlt-label">Course</span>
            {r.examDetails?.courseCode} — {r.examDetails?.courseTitle}
          </span>
          <span>
            <span className="rlt-label">Filed</span>
            {new Date(r.createdAt).toLocaleDateString()}
          </span>
          <span>
            <span className="rlt-label">Status</span>
            <StatusStamp status={r.status} />
          </span>
        </Link>
      ))}
    </div>
  );
}
