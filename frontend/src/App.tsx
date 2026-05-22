import { useMemo, useState } from 'react';
import type { DatePeriod, Filter, Room, SortDir, Status } from './types';
import {
  effectiveStatus,
  matchesPeriod,
  matchesSearch,
  sortByDeadline,
} from './utils';
import { useRooms } from './hooks/useRooms';
import Header from './components/Header';
import Metrics from './components/Metrics';
import CompletionChart from './components/CompletionChart';
import AddForm from './components/AddForm';
import Toolbar from './components/Toolbar';
import RoomTable from './components/RoomTable';
import EditModal from './components/EditModal';

const CYCLE: Status[] = ['To Do', 'In Progress', 'Done'];

export default function App() {
  const { rooms, addRoom, patchRoom, editRoom, deleteRoom, importRooms } =
    useRooms();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<DatePeriod>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [deadlineSort, setDeadlineSort] = useState<SortDir | null>(null);
  const [editing, setEditing] = useState<Room | null>(null);

  const visible = useMemo(() => {
    const filtered = rooms.filter(
      (r) =>
        (filter === 'all' || effectiveStatus(r) === filter) &&
        matchesPeriod(r, period, from, to) &&
        matchesSearch(r, search),
    );
    return deadlineSort ? sortByDeadline(filtered, deadlineSort) : filtered;
  }, [rooms, filter, period, from, to, search, deadlineSort]);

  // Cycle the deadline sort: unsorted → ascending → descending → unsorted.
  const cycleDeadlineSort = () =>
    setDeadlineSort((d) => (d === null ? 'asc' : d === 'asc' ? 'desc' : null));

  const toggleDone = (r: Room) =>
    void patchRoom(r.id, { status: r.status === 'Done' ? 'To Do' : 'Done' });

  const cycleStatus = (r: Room) =>
    void patchRoom(r.id, {
      status: CYCLE[(CYCLE.indexOf(r.status) + 1) % CYCLE.length],
    });

  const removeRoom = (r: Room) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    void deleteRoom(r.id);
  };

  return (
    <div className="wrap">
      <Header onImport={importRooms} />

      <Metrics rooms={rooms} />
      <CompletionChart rooms={rooms} />

      <AddForm onAdd={addRoom} />

      <div className="section-header">
        <span className="section-title">Rooms</span>
        <span className="muted-sm">
          {visible.length} room{visible.length !== 1 ? 's' : ''}
        </span>
      </div>
      <Toolbar
        filter={filter}
        search={search}
        period={period}
        from={from}
        to={to}
        onFilter={setFilter}
        onSearch={setSearch}
        onPeriod={setPeriod}
        onFrom={setFrom}
        onTo={setTo}
      />
      <RoomTable
        rooms={visible}
        deadlineSort={deadlineSort}
        onSortDeadline={cycleDeadlineSort}
        onToggleDone={toggleDone}
        onCycleStatus={cycleStatus}
        onEdit={setEditing}
        onDelete={removeRoom}
      />

      {editing && (
        <EditModal
          room={editing}
          onSave={editRoom}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
