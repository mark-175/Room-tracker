import type { DatePeriod, EffectiveStatus, Room, SortDir } from './types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Invariant: "Overdue" is derived here, never stored. -------------------
// A non-Done room past its deadline is "Overdue" for display/filtering only;
// the DB still holds its real status. Mirrors the old app.js logic exactly.
function isOverdue(r: Room): boolean {
  if (r.status === 'Done' || !r.deadline) return false;
  return r.deadline < today(); // 'YYYY-MM-DD' strings sort chronologically
}

function effectiveStatus(r: Room): EffectiveStatus {
  return isOverdue(r) ? 'Overdue' : r.status;
}

function badgeStatus(s: EffectiveStatus): string {
  if (s === 'Done') return 'badge-done';
  if (s === 'In Progress') return 'badge-progress';
  if (s === 'Overdue') return 'badge-overdue';
  return 'badge-todo';
}

function badgeDiff(d: string): string {
  if (d === 'Easy') return 'badge-easy';
  if (d === 'Medium') return 'badge-medium';
  return 'badge-hard';
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'; '' -> em dash.
function fmt(d: string): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function matchesSearch(r: Room, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    r.name.toLowerCase().includes(q) ||
    r.category.toLowerCase().includes(q) ||
    r.tags.some((t) => t.toLowerCase().includes(q))
  );
}

// Time-period filter on a room's `deadline` (see DatePeriod). 'YYYY-MM-DD'
// strings sort chronologically, so range checks are plain string compares.
// `from`/`to` are inclusive and each optional; rooms without a deadline drop
// out once a period other than 'all' is active.
function matchesPeriod(
  r: Room,
  period: DatePeriod,
  from: string,
  to: string,
): boolean {
  if (period === 'all') return true;
  if (!r.deadline) return false;
  if (period === 'today') return r.deadline === today();
  if (from && r.deadline < from) return false;
  if (to && r.deadline > to) return false;
  return true;
}

// Return a copy of `rooms` sorted by `deadline` in the given direction.
// Rooms with no deadline always sink to the bottom, regardless of direction.
// 'YYYY-MM-DD' strings compare chronologically as plain strings.
function sortByDeadline(rooms: Room[], dir: SortDir): Room[] {
  return [...rooms].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    if (a.deadline === b.deadline) return 0;
    const cmp = a.deadline < b.deadline ? -1 : 1;
    return dir === 'asc' ? cmp : -cmp;
  });
}

export {
  isOverdue,
  effectiveStatus,
  badgeStatus,
  badgeDiff,
  fmt,
  matchesSearch,
  matchesPeriod,
  sortByDeadline,
};
