import { useMemo, useState } from 'react';
import type { Filter, Room, Status } from './types';
import { effectiveStatus, matchesSearch } from './utils';
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
  const [editing, setEditing] = useState<Room | null>(null);

  const visible = useMemo(
    () =>
      rooms.filter(
        (r) =>
          (filter === 'all' || effectiveStatus(r) === filter) &&
          matchesSearch(r, search),
      ),
    [rooms, filter, search],
  );

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
        onFilter={setFilter}
        onSearch={setSearch}
      />
      <RoomTable
        rooms={visible}
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
