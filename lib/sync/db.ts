import Dexie, { type Table } from 'dexie';

export interface LocalScore {
  id: string; // ${gameId}:${userId}:${holeNumber}
  gameId: string;
  userId: string;
  holeNumber: number;
  strokes: number | null;
  enteredBy: string;
  clientUpdatedAt: string;
  serverUpdatedAt: string | null; // null until first successful sync of this client_updated_at
}

export interface SyncQueueItem {
  id: string; // matches scoreId
  scoreId: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
}

class GolfDb extends Dexie {
  scores!: Table<LocalScore, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('golf-app');
    this.version(1).stores({
      scores: 'id, gameId, [gameId+userId], [gameId+holeNumber]',
      syncQueue: 'id, createdAt',
    });
  }
}

export const localDb = new GolfDb();

export function scoreKey(
  gameId: string,
  userId: string,
  holeNumber: number,
): string {
  return `${gameId}:${userId}:${holeNumber}`;
}
