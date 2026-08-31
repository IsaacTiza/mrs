const COLORS = {
  submitted: ['var(--status-submitted-bg)', 'var(--status-submitted-fg)'],
  under_review_college: ['var(--status-review-bg)', 'var(--status-review-fg)'],
  under_review_registry: ['var(--status-review-bg)', 'var(--status-review-fg)'],
  under_review_senate: ['var(--status-senate-bg)', 'var(--status-senate-fg)'],
  meeting_requested: ['var(--status-senate-bg)', 'var(--status-senate-fg)'],
  verdict_passed: ['var(--status-verdict-bg)', 'var(--status-verdict-fg)'],
  closed: ['var(--status-closed-bg)', 'var(--status-closed-fg)'],
};

const LABEL = {
  submitted: 'Submitted',
  under_review_college: 'College Review',
  under_review_registry: 'Registry Review',
  under_review_senate: 'Senate Review',
  meeting_requested: 'Meeting Requested',
  verdict_passed: 'Verdict Passed',
  closed: 'Closed',
};

export default function StatusStamp({ status }) {
  const [bg, fg] = COLORS[status] || ['var(--status-submitted-bg)', 'var(--status-submitted-fg)'];
  return (
    <span className="stamp" style={{ background: bg, color: fg }}>
      {LABEL[status] || status}
    </span>
  );
}
