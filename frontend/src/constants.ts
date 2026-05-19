import type { Difficulty } from './types';

// Shared by the Add form and the Edit modal so the two option lists can never
// drift apart. (Categories are free-ish text in the DB; this is just the UI
// pick-list — the Edit modal also keeps a room's existing, unlisted category.)
export const CATEGORIES = [
  'Fundamentals', 'Web', 'Network', 'Crypto', 'Forensics',
  'Malware', 'Red Team', 'Blue Team', 'CTF', 'Other',
];

export const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];
