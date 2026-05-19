import { useRef } from 'react';
import { EXPORT_URL } from '../api';
import { ExportIcon, ImportIcon } from '../icons';

interface Props {
  onImport: (rooms: unknown[]) => Promise<void>;
}

// Export = plain navigation (server sends the file). Import = pick a JSON
// backup, validate it client-side, confirm (it REPLACES all rows), then POST.
// Behaviour/copy is unchanged from the old app.js.
export default function Header({ onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      alert('That file is not valid JSON.');
      return;
    }
    const list = Array.isArray(data)
      ? data
      : (data as { rooms?: unknown }).rooms;
    if (!Array.isArray(list)) {
      alert('No "rooms" array found in that file.');
      return;
    }
    if (
      !confirm(`Import ${list.length} room(s)? This REPLACES all current rooms.`)
    )
      return;
    try {
      await onImport(list);
      alert('Import complete.');
    } catch (e) {
      alert('Import failed: ' + (e as Error).message);
    }
  }

  return (
    <header className="app-header">
      <div>
        <h1 className="app-title">TryHackMe Room Tracker</h1>
        <p className="app-sub">
          Track the rooms you want to finish — saved locally to{' '}
          <code>rooms.db</code>.
        </p>
      </div>
      <div className="header-actions">
        <button
          className="btn"
          title="Download a JSON backup of all rooms"
          onClick={() => {
            window.location.href = EXPORT_URL;
          }}
        >
          <ExportIcon /> Export
        </button>
        <button
          className="btn"
          title="Restore rooms from a JSON backup (replaces all data)"
          onClick={() => fileRef.current?.click()}
        >
          <ImportIcon /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
