import { useEffect, useRef, useState } from 'react';
import type { Difficulty, Room, Status } from '../types';
import { CATEGORIES, DIFFICULTIES } from '../constants';

const STATUSES: Status[] = ['To Do', 'In Progress', 'Done'];

interface Props {
  room: Room;
  // Mirrors useRooms.editRoom: PATCHes, re-fetches, and rethrows on failure
  // so we can keep the modal open and alert (same UX as AddForm).
  onSave: (id: number, patch: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

// Edit an existing room. Pre-filled from the current row; sends every editable
// field as one PATCH (the server diffs/normalizes and re-stamps completedDate
// as status crosses Done). "Overdue" is never an option here — it is derived,
// so the status picker only offers the three real, stored statuses.
export default function EditModal({ room, onSave, onClose }: Props) {
  const [name, setName] = useState(room.name);
  const [url, setUrl] = useState(room.url);
  const [category, setCategory] = useState(room.category);
  const [difficulty, setDifficulty] = useState<Difficulty>(room.difficulty);
  const [status, setStatus] = useState<Status>(room.status);
  const [deadline, setDeadline] = useState(room.deadline);
  const [tags, setTags] = useState(room.tags.join(', '));

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Esc closes; focus the first field on open.
  useEffect(() => {
    nameInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep an imported/legacy category that isn't in the pick-list selectable.
  const categoryOptions = CATEGORIES.includes(category)
    ? CATEGORIES
    : [category, ...CATEGORIES];

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      nameInputRef.current?.focus();
      return;
    }
    try {
      await onSave(room.id, {
        name: trimmed,
        url: url.trim(),
        category,
        difficulty,
        status,
        deadline,
        tags, // comma-separated; db.py splits/trims it
      });
      onClose();
    } catch (e) {
      alert('Could not save room: ' + (e as Error).message);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${room.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">Edit room</div>
        <form
          className="edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="full">
            <label>Room name</label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="full">
            <label>Room URL</label>
            <input
              type="text"
              placeholder="https://tryhackme.com/room/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div>
            <label>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categoryOptions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div className="full">
            <label>Tags (comma-separated)</label>
            <input
              type="text"
              placeholder="privesc, OSCP-prep"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
