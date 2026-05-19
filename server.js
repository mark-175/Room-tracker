'use strict';

// Tiny Express server: serves the static frontend from public/ and a small
// REST API backed by db.js. Run with `npm start`, open http://localhost:3000.

const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Wrap a handler so thrown errors (incl. db.js httpError objects with a
// .status) become clean JSON responses instead of crashing the process.
const wrap = fn => (req, res) => {
  try {
    fn(req, res);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
};

app.get('/api/rooms', wrap((req, res) => {
  res.json(db.listRooms());
}));

app.post('/api/rooms', wrap((req, res) => {
  res.status(201).json(db.createRoom(req.body || {}));
}));

app.patch('/api/rooms/:id', wrap((req, res) => {
  res.json(db.updateRoom(Number(req.params.id), req.body || {}));
}));

app.delete('/api/rooms/:id', wrap((req, res) => {
  db.deleteRoom(Number(req.params.id));
  res.status(204).end();
}));

// Download a full JSON backup of every room.
app.get('/api/export', wrap((req, res) => {
  const payload = {
    app: 'thm-room-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    rooms: db.listRooms(),
  };
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="thm-rooms-${stamp}.json"`);
  res.send(JSON.stringify(payload, null, 2));
}));

// Restore from a backup file: accepts either {rooms:[...]} or a bare [...].
// This REPLACES all existing rooms (confirmed in the UI before sending).
app.post('/api/import', wrap((req, res) => {
  const body = req.body || {};
  const rooms = Array.isArray(body) ? body : body.rooms;
  res.json(db.importRooms(rooms));
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`THM Room Tracker running at http://localhost:${PORT}`);
  console.log(`Data file: ${db.DB_PATH}`);
});
