import type { EffectiveStatus, Room } from './types';

// --- Invariant: "Overdue" is derived here, never stored. -------------------
// A non-Done room past its deadline is "Overdue" for display/filtering only;
// the DB still holds its real status. Mirrors the old app.js logic exactly.
function isOverdue(r: Room): boolean {
  if (r.status === 'Done' || !r.deadline) return false;
  return new Date(r.deadline) < new Date(new Date().toISOString().slice(0, 10));
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

export {
  isOverdue,
  effectiveStatus,
  badgeStatus,
  badgeDiff,
  fmt,
  matchesSearch,
};
