// API shapes. db.py serves/accepts camelCase with `tags` as a string array;
// the Add form sends `tags` as a raw comma-separated string (db.py normalizes
// both forms), hence the separate NewRoom type.

export type Status = 'To Do' | 'In Progress' | 'Done';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

// "Overdue" is derived for display/filtering only — never persisted. The DB
// only ever holds the three real Status values (see utils.ts / db.py).
export type EffectiveStatus = Status | 'Overdue';
export type Filter = 'all' | EffectiveStatus;

// Time-period filter, applied to a room's `deadline` (local UI state only,
// combined AND with `Filter` and the search box — see App.tsx). 'custom' uses
// the inclusive `from`/`to` range; rooms with no deadline are excluded once a
// period other than 'all' is active.
export type DatePeriod = 'all' | 'today' | 'custom';

export interface Room {
  id: number;
  name: string;
  category: string;
  difficulty: Difficulty;
  deadline: string; // '' or 'YYYY-MM-DD'
  status: Status;
  url: string; // '' or a URL
  tags: string[];
  completedDate: string; // '' or 'YYYY-MM-DD' (managed server-side)
  createdAt: string;
}

export interface NewRoom {
  name: string;
  url: string;
  category: string;
  difficulty: Difficulty;
  deadline: string;
  tags: string; // comma-separated; db.py splits/trims it
}

// GET /api/room-info — the only fields THM exposes without auth.
export interface RoomInfo {
  name: string;
  difficulty: string;
}
