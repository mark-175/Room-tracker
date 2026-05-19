import type { Room } from '../types';
import { isOverdue } from '../utils';

interface Props {
  rooms: Room[];
}

// The four summary cards + the overall-progress bar. Counts are derived from
// the live room list on every render (same numbers as the old render()).
export default function Metrics({ rooms }: Props) {
  const total = rooms.length;
  const done = rooms.filter((r) => r.status === 'Done').length;
  const inprog = rooms.filter((r) => r.status === 'In Progress').length;
  const overdue = rooms.filter(isOverdue).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <div className="metrics">
        <div className="metric">
          <div className="metric-label">Total rooms</div>
          <div className="metric-value">{total}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Completed</div>
          <div className="metric-value green">{done}</div>
        </div>
        <div className="metric">
          <div className="metric-label">In progress</div>
          <div className="metric-value amber">{inprog}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Overdue</div>
          <div className={'metric-value' + (overdue > 0 ? ' red' : '')}>
            {overdue}
          </div>
        </div>
      </div>

      <div className="progress-section">
        <div className="section-header">
          <span className="section-title">Overall progress</span>
          <span className="muted-sm">{pct}% complete</span>
        </div>
        <div className="progress-bar-outer">
          <div className="progress-bar-inner" style={{ width: pct + '%' }} />
        </div>
      </div>
    </>
  );
}
