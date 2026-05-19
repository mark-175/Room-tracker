import type { NewRoom, Room, RoomInfo } from './types';

// Thin fetch wrapper. The FastAPI layer returns non-2xx as {"error": "..."}
// (db.HttpError); surface that message, mirroring the old app.js api() helper.
// 204 (DELETE) has no body.
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      msg = ((await res.json()) as { error?: string }).error || msg;
    } catch {
      /* non-JSON body — keep the generic message */
    }
    throw new Error(msg);
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

export const getRooms = () => api<Room[]>('GET', '/api/rooms');

export const createRoom = (room: NewRoom) =>
  api<Room>('POST', '/api/rooms', room);

export const patchRoom = (id: number, patch: Record<string, unknown>) =>
  api<Room>('PATCH', `/api/rooms/${id}`, patch);

export const deleteRoom = (id: number) =>
  api<null>('DELETE', `/api/rooms/${id}`);

// Full restore (replaces all rows server-side). Accepts the raw parsed list.
export const importRooms = (rooms: unknown[]) =>
  api<Room[]>('POST', '/api/import', { rooms });

export const getRoomInfo = (url: string) =>
  api<RoomInfo>('GET', `/api/room-info?url=${encodeURIComponent(url)}`);

// Plain navigation triggers the file download (Content-Disposition header).
export const EXPORT_URL = '/api/export';
