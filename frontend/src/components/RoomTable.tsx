import type { Room } from '../types';
import {
  badgeDiff,
  badgeStatus,
  effectiveStatus,
  fmt,
  isOverdue,
} from '../utils';
import { AlertIcon, LinkIcon, TrashIcon } from '../icons';

interface Props {
  rooms: Room[]; // already filtered/searched
  onToggleDone: (r: Room) => void;
  onCycleStatus: (r: Room) => void;
  onDelete: (r: Room) => void;
}

export default function RoomTable({
  rooms,
  onToggleDone,
  onCycleStatus,
  onDelete,
}: Props) {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th style={{ width: 32 }} />
            <th>Room</th>
            <th>Category</th>
            <th>Difficulty</th>
            <th>Tags</th>
            <th>Deadline</th>
            <th>Completed</th>
            <th>Status</th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => {
            const es = effectiveStatus(r);
            const od = isOverdue(r);
            return (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={r.status === 'Done'}
                    aria-label={`Mark ${r.name} done`}
                    onChange={() => onToggleDone(r)}
                  />
                </td>
                <td>
                  <span className="room-name">
                    {r.url ? (
                      <a
                        className="room-link"
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.name} <LinkIcon />
                      </a>
                    ) : (
                      r.name
                    )}
                    {od && (
                      <span className="overdue-hint" title="Past deadline">
                        <AlertIcon />
                      </span>
                    )}
                  </span>
                </td>
                <td className="muted-sm">{r.category}</td>
                <td>
                  <span className={'badge ' + badgeDiff(r.difficulty)}>
                    {r.difficulty}
                  </span>
                </td>
                <td className="tags-cell">
                  {r.tags.length ? (
                    r.tags.map((t, i) => (
                      <span key={i} className="tag">
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="muted-sm">—</span>
                  )}
                </td>
                <td
                  className="muted-sm"
                  style={{
                    color: od ? '#a32d2d' : 'var(--color-text-secondary)',
                  }}
                >
                  {fmt(r.deadline)}
                </td>
                <td className="muted-sm">{fmt(r.completedDate)}</td>
                <td>
                  <span
                    className={'badge status-badge ' + badgeStatus(es)}
                    title="Click to cycle status"
                    onClick={() => onCycleStatus(r)}
                  >
                    {es}
                  </span>
                </td>
                <td>
                  <button
                    className="delete-btn"
                    title="Remove room"
                    onClick={() => onDelete(r)}
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rooms.length === 0 && (
        <p className="empty-state">
          No rooms match. Add one above or clear the filter/search.
        </p>
      )}
    </>
  );
}
