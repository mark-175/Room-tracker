'use strict';

// SQLite data layer. One table, `rooms`, stored in rooms.db next to this file.
// "Overdue" is intentionally NOT stored — it is derived in the frontend from
// `deadline` vs. today (see public/app.js). Only the three real statuses
// ('To Do' | 'In Progress' | 'Done') are ever persisted. `completed_date` is
// auto-stamped/cleared here whenever a room enters/leaves the Done state.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rooms.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    category       TEXT NOT NULL DEFAULT 'Other',
    difficulty     TEXT NOT NULL DEFAULT 'Easy',
    deadline       TEXT,
    status         TEXT NOT NULL DEFAULT 'To Do',
    url            TEXT,
    tags           TEXT,
    completed_date TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const STATUSES = ['To Do', 'In Progress', 'Done'];

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) tags = tags.join(',');
  if (typeof tags !== 'string') return '';
  return tags
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .join(',');
}

// DB row (snake_case) -> API shape (camelCase, tags as array).
function rowToApi(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    difficulty: r.difficulty,
    deadline: r.deadline || '',
    status: r.status,
    url: r.url || '',
    tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    completedDate: r.completed_date || '',
    createdAt: r.created_at,
  };
}

const stmts = {
  all: db.prepare('SELECT * FROM rooms ORDER BY id'),
  get: db.prepare('SELECT * FROM rooms WHERE id = ?'),
  insert: db.prepare(`
    INSERT INTO rooms (name, category, difficulty, deadline, status, url, tags, completed_date)
    VALUES (@name, @category, @difficulty, @deadline, @status, @url, @tags, @completed_date)
  `),
  update: db.prepare(`
    UPDATE rooms SET
      name=@name, category=@category, difficulty=@difficulty, deadline=@deadline,
      status=@status, url=@url, tags=@tags, completed_date=@completed_date
    WHERE id=@id
  `),
  del: db.prepare('DELETE FROM rooms WHERE id = ?'),
  clear: db.prepare('DELETE FROM rooms'),
  count: db.prepare('SELECT COUNT(*) AS n FROM rooms'),
};

function listRooms() {
  return stmts.all.all().map(rowToApi);
}

function createRoom(input) {
  const name = String(input.name || '').trim();
  if (!name) throw httpError(400, 'Room name is required');
  const status = STATUSES.includes(input.status) ? input.status : 'To Do';
  const info = stmts.insert.run({
    name,
    category: input.category || 'Other',
    difficulty: input.difficulty || 'Easy',
    deadline: input.deadline || null,
    status,
    url: String(input.url || '').trim() || null,
    tags: normalizeTags(input.tags) || null,
    completed_date: status === 'Done' ? todayISO() : null,
  });
  return rowToApi(stmts.get.get(info.lastInsertRowid));
}

function updateRoom(id, patch) {
  const existing = stmts.get.get(id);
  if (!existing) throw httpError(404, 'Room not found');

  const next = { ...existing };
  if (patch.name !== undefined) {
    const n = String(patch.name).trim();
    if (!n) throw httpError(400, 'Room name cannot be empty');
    next.name = n;
  }
  if (patch.category !== undefined) next.category = patch.category || 'Other';
  if (patch.difficulty !== undefined) next.difficulty = patch.difficulty || 'Easy';
  if (patch.deadline !== undefined) next.deadline = patch.deadline || null;
  if (patch.url !== undefined) next.url = String(patch.url).trim() || null;
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags) || null;
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status)) throw httpError(400, 'Invalid status');
    next.status = patch.status;
  }

  // Auto-stamp the completion date the first time a room becomes Done;
  // clear it whenever it leaves Done.
  if (next.status === 'Done') {
    if (!next.completed_date) next.completed_date = todayISO();
  } else {
    next.completed_date = null;
  }

  stmts.update.run({ ...next, id });
  return rowToApi(stmts.get.get(id));
}

function deleteRoom(id) {
  const info = stmts.del.run(id);
  if (info.changes === 0) throw httpError(404, 'Room not found');
}

// JSON import = full restore. The whole table is replaced atomically so a
// backup file always round-trips to exactly what was exported.
const replaceAll = db.transaction(rooms => {
  stmts.clear.run();
  for (const r of rooms) {
    const status = STATUSES.includes(r.status) ? r.status : 'To Do';
    stmts.insert.run({
      name: String(r.name || '').trim() || 'Untitled',
      category: r.category || 'Other',
      difficulty: r.difficulty || 'Easy',
      deadline: r.deadline || null,
      status,
      url: String(r.url || '').trim() || null,
      tags: normalizeTags(r.tags) || null,
      completed_date: r.completedDate || (status === 'Done' ? todayISO() : null),
    });
  }
});

function importRooms(rooms) {
  if (!Array.isArray(rooms)) {
    throw httpError(400, 'Import file must contain a "rooms" array');
  }
  replaceAll(rooms);
  return listRooms();
}

// First-run demo data so the dashboard/chart are not empty. Once the table
// has any rows (including after the user deletes all of them and adds their
// own) this never runs again.
function seedIfEmpty() {
  if (stmts.count.get().n > 0) return;
  const seed = [
    { name: 'Linux Fundamentals', category: 'Fundamentals', difficulty: 'Easy', deadline: '2026-01-31', status: 'Done', tags: 'linux,basics', url: 'https://tryhackme.com/room/linuxfundamentalspart1' },
    { name: 'Intro to Networking', category: 'Network', difficulty: 'Easy', deadline: '2026-02-28', status: 'Done', tags: 'networking,basics', url: 'https://tryhackme.com/room/introtonetworking' },
    { name: 'OWASP Top 10', category: 'Web', difficulty: 'Medium', deadline: '2026-03-31', status: 'Done', tags: 'web,owasp', url: 'https://tryhackme.com/room/owasptop10' },
    { name: 'Burp Suite Basics', category: 'Web', difficulty: 'Medium', deadline: '2026-04-30', status: 'Done', tags: 'web,burp', url: 'https://tryhackme.com/room/burpsuitebasics' },
    { name: 'Metasploit', category: 'Red Team', difficulty: 'Medium', deadline: '2026-05-31', status: 'In Progress', tags: 'exploitation,msf', url: 'https://tryhackme.com/room/rpmetasploit' },
    { name: 'Nmap', category: 'Network', difficulty: 'Easy', deadline: '2026-05-31', status: 'In Progress', tags: 'recon,scanning', url: 'https://tryhackme.com/room/furthernmap' },
    { name: 'SQL Injection', category: 'Web', difficulty: 'Hard', deadline: '2026-06-30', status: 'To Do', tags: 'web,sqli', url: 'https://tryhackme.com/room/sqlinjectionlm' },
    { name: 'Active Directory Basics', category: 'Red Team', difficulty: 'Hard', deadline: '2026-07-31', status: 'To Do', tags: 'ad,windows', url: 'https://tryhackme.com/room/winadbasics' },
    { name: 'Hydra', category: 'Red Team', difficulty: 'Medium', deadline: '2026-08-31', status: 'To Do', tags: 'bruteforce,passwords', url: 'https://tryhackme.com/room/hydra' },
    { name: 'Wireshark Basics', category: 'Network', difficulty: 'Easy', deadline: '2026-09-30', status: 'To Do', tags: 'forensics,pcap', url: 'https://tryhackme.com/room/wiresharkthebasics' },
  ];
  const insertSeed = db.transaction(rows => {
    for (const r of rows) {
      stmts.insert.run({
        name: r.name,
        category: r.category,
        difficulty: r.difficulty,
        deadline: r.deadline,
        status: r.status,
        url: r.url,
        tags: r.tags,
        completed_date: r.status === 'Done' ? r.deadline : null,
      });
    }
  });
  insertSeed(seed);
}

seedIfEmpty();

module.exports = { listRooms, createRoom, updateRoom, deleteRoom, importRooms, DB_PATH };
