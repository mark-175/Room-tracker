import { useRef, useState } from 'react';
import type { Difficulty, NewRoom } from '../types';
import { getRoomInfo } from '../api';
import { CATEGORIES, DIFFICULTIES } from '../constants';
import { PlusIcon } from '../icons';

const THM_ROOM_RE = /tryhackme\.com\/(?:room|r)\/[A-Za-z0-9_-]+/i;

interface Props {
  onAdd: (room: NewRoom) => Promise<void>;
}

// Add-room form + the pasted-URL auto-fill. We ask the server for the room's
// public metadata and fill ONLY untouched fields (name if blank, difficulty
// unless the user picked one). Sequence guard ignores a superseded response;
// lastLookupUrl dedupes repeated blurs. Same rules as the old app.js.
export default function AddForm({ onAdd }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>('Easy');
  const [deadline, setDeadline] = useState('');
  const [tags, setTags] = useState('');
  const [hint, setHint] = useState<{ msg: string; kind: '' | 'ok' | 'err' }>({
    msg: '',
    kind: '',
  });

  const nameRef = useRef('');
  nameRef.current = name; // always-fresh read inside the async lookup
  const diffTouched = useRef(false);
  const lastLookupUrl = useRef('');
  const lookupSeq = useRef(0);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function resetUrlLookup() {
    lastLookupUrl.current = '';
    diffTouched.current = false;
    setHint({ msg: '', kind: '' });
  }

  async function lookupRoomFromUrl(value: string) {
    const u = value.trim();
    if (!u || !THM_ROOM_RE.test(u)) {
      setHint({ msg: '', kind: '' });
      return;
    }
    if (u === lastLookupUrl.current) return;
    lastLookupUrl.current = u;
    const seq = ++lookupSeq.current;
    setHint({ msg: 'Looking up room…', kind: '' });
    try {
      const info = await getRoomInfo(u);
      if (seq !== lookupSeq.current) return; // a newer lookup won
      const filled: string[] = [];
      if (info.name && !nameRef.current.trim()) {
        setName(info.name);
        filled.push('name');
      }
      if (
        info.difficulty &&
        !diffTouched.current &&
        (DIFFICULTIES as string[]).includes(info.difficulty)
      ) {
        setDifficulty(info.difficulty as Difficulty);
        filled.push('difficulty');
      }
      setHint({
        msg: filled.length
          ? 'Filled ' + filled.join(' & ') + ' from TryHackMe'
          : 'Found on TryHackMe',
        kind: 'ok',
      });
    } catch (e) {
      if (seq !== lookupSeq.current) return;
      lastLookupUrl.current = ''; // allow a retry after a failure
      setHint({ msg: (e as Error).message, kind: 'err' });
    }
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      nameInputRef.current?.focus();
      return;
    }
    try {
      await onAdd({
        name: trimmed,
        url: url.trim(),
        category,
        difficulty,
        deadline,
        tags,
      });
      // Keep category & difficulty (likely reused); clear the rest.
      setName('');
      setUrl('');
      setDeadline('');
      setTags('');
      resetUrlLookup();
      nameInputRef.current?.focus();
    } catch (e) {
      alert('Could not add room: ' + (e as Error).message);
    }
  }

  return (
    <>
      <div className="section-header" style={{ marginTop: '1.5rem' }}>
        <span className="section-title">Add a room</span>
      </div>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label>Room name</label>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="e.g. Linux Fundamentals"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label>Room URL</label>
          <input
            type="text"
            placeholder="https://tryhackme.com/room/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={(e) => void lookupRoomFromUrl(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text');
              setTimeout(() => void lookupRoomFromUrl(pasted), 0);
            }}
          />
          <span
            className={'url-hint' + (hint.kind ? ' ' + hint.kind : '')}
            aria-live="polite"
          >
            {hint.msg}
          </span>
        </div>
        <div>
          <label>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => {
              diffTouched.current = true;
              setDifficulty(e.target.value as Difficulty);
            }}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d}>{d}</option>
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
        <div>
          <label>Tags (comma-separated)</label>
          <input
            type="text"
            placeholder="privesc, OSCP-prep"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <div>
          <button className="btn btn-primary" type="submit">
            <PlusIcon /> Add
          </button>
        </div>
      </form>
    </>
  );
}
