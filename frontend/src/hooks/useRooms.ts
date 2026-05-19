import { useCallback, useEffect, useState } from 'react';
import type { NewRoom, Room } from '../types';
import * as roomApi from '../api';

// --- Invariant: the DB is the single source of truth. ----------------------
// Every mutation calls the API, then re-fetches the whole list before the UI
// re-renders (the old app.js loadRooms()/render() pattern). State is never
// mutated optimistically. Mutations that drive inline UI feedback (add /
// import) rethrow so the caller can show its own message; the fire-and-forget
// row actions surface errors via alert(), matching the original behaviour.
export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);

  const load = useCallback(async () => {
    try {
      setRooms(await roomApi.getRooms());
    } catch (e) {
      alert('Could not load rooms: ' + (e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addRoom = useCallback(
    async (room: NewRoom) => {
      await roomApi.createRoom(room);
      await load();
    },
    [load],
  );

  const patchRoom = useCallback(
    async (id: number, patch: Record<string, unknown>) => {
      try {
        await roomApi.patchRoom(id, patch);
        await load();
      } catch (e) {
        alert('Could not update room: ' + (e as Error).message);
      }
    },
    [load],
  );

  const deleteRoom = useCallback(
    async (id: number) => {
      try {
        await roomApi.deleteRoom(id);
        await load();
      } catch (e) {
        alert('Could not delete room: ' + (e as Error).message);
      }
    },
    [load],
  );

  const importRooms = useCallback(
    async (list: unknown[]) => {
      await roomApi.importRooms(list);
      await load();
    },
    [load],
  );

  return { rooms, addRoom, patchRoom, deleteRoom, importRooms };
}
