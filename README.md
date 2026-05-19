# TryHackMe Room Tracker

A small local web app to track the TryHackMe rooms you want to finish. Data is
stored on your machine in a SQLite file (`rooms.db`) — no account, no cloud,
works offline.

## Requirements

- [Python](https://www.python.org/) 3.10 or newer (tested on Python 3.13).
- [Node.js](https://nodejs.org/) 18 or newer — only to build the React
  frontend; not needed to run the server afterwards.

## Setup & run

```sh
# 1. Build the frontend (one-time, and again after any frontend change)
cd frontend
npm install
npm run build
cd ..

# 2. Install backend deps and run the server
pip install -r requirements.txt
python main.py
```

Then open **http://localhost:3000** in your browser. Run `python main.py` again
any time you want to use it — your rooms are saved in `rooms.db` and will still
be there.

To use a different port: `PORT=8080 python main.py` (PowerShell:
`$env:PORT=8080; python main.py`).

## What you can track

Each room has: **name**, **URL** (clickable link to the room), **category**,
**difficulty**, **deadline**, **tags**, and **status**.

- Tick the checkbox to mark a room **Done** (and untick to undo).
- Click the status badge to cycle **To Do → In Progress → Done**.
- The date a room was completed is **stamped automatically** when you mark it
  Done, and shown in the table.
- A non-done room past its deadline is shown as **Overdue** (this is computed
  live — it is not a status you set).
- Filter by status, or search by name / tag / category.
- The dashboard shows totals, a completion progress bar, and a monthly chart.

## Backup & restore

- **Export** downloads a `thm-rooms-YYYY-MM-DD.json` backup of every room.
- **Import** restores from such a file. Importing **replaces all current
  rooms** (it is a full restore, confirmed before it runs) — use it to move
  your data to another machine or recover after clearing data.

Keep an exported JSON file somewhere safe; `rooms.db` is the only copy of your
data otherwise.

## Notes

- On first run the app is pre-filled with 10 example rooms so the dashboard
  isn't empty. Delete them and add your own — the examples won't come back.
- `thm_room_tracker.html` is the original single-file prototype, kept for
  reference only. The app you run is the FastAPI server (`main.py` + `db.py` +
  `thm.py`) serving the built React app from `frontend/dist/`.
