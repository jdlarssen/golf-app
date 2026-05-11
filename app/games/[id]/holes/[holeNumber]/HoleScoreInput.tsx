'use client';

import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, scoreKey } from '@/lib/sync/db';
import { writeScore } from '@/lib/sync/writeScore';
import { startSyncListener, drainQueue } from '@/lib/sync/syncWorker';

type Status = 'unsynced' | 'synced' | 'idle' | 'error';

export function HoleScoreInput({
  gameId,
  userId,
  holeNumber,
  initialStrokes,
  initialClientUpdatedAt,
  initialServerUpdatedAt,
  myUserId,
  disabled,
}: {
  gameId: string;
  userId: string;
  holeNumber: number;
  initialStrokes: number | null;
  initialClientUpdatedAt: string | null; // from DB
  initialServerUpdatedAt: string | null; // from DB
  myUserId: string;
  disabled?: boolean;
}) {
  const id = scoreKey(gameId, userId, holeNumber);

  // Local subscription to Dexie row. If there's no Dexie row yet, fall back to server-provided initial values.
  const localRow = useLiveQuery(() => localDb.scores.get(id), [id]);
  const queueItem = useLiveQuery(() => localDb.syncQueue.get(id), [id]);

  // On mount, seed Dexie with the server's value if Dexie has nothing or older.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await localDb.scores.get(id);
      const seedClientUpdatedAt =
        initialClientUpdatedAt ?? '1970-01-01T00:00:00.000Z';
      if (!existing || existing.clientUpdatedAt < seedClientUpdatedAt) {
        if (cancelled) return;
        await localDb.scores.put({
          id,
          gameId,
          userId,
          holeNumber,
          strokes: initialStrokes,
          enteredBy: '',
          clientUpdatedAt: seedClientUpdatedAt,
          serverUpdatedAt: initialServerUpdatedAt,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    id,
    gameId,
    userId,
    holeNumber,
    initialStrokes,
    initialClientUpdatedAt,
    initialServerUpdatedAt,
  ]);

  // Boot the sync listener once.
  useEffect(() => {
    startSyncListener();
  }, []);

  // Derive displayed string from the local row.
  const displayed: string =
    localRow?.strokes != null
      ? String(localRow.strokes)
      : localRow
        ? ''
        : initialStrokes != null
          ? String(initialStrokes)
          : '';

  const [value, setValue] = useState<string>(displayed);
  // Sync the controlled value when local source updates externally (e.g. realtime in Phase 9).
  useEffect(() => {
    setValue(displayed);
  }, [displayed]);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => save(next), 500);
  }

  async function save(rawValue: string) {
    const trimmed = rawValue.trim();
    if (trimmed === '') {
      // Empty input: treat as null (clears the hole)
      await writeScore({
        gameId,
        userId,
        holeNumber,
        strokes: null,
        enteredBy: myUserId,
      });
      void drainQueue();
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      // Invalid — don't write
      return;
    }
    await writeScore({
      gameId,
      userId,
      holeNumber,
      strokes: n,
      enteredBy: myUserId,
    });
    void drainQueue();
  }

  // Status indicator state:
  // - queueItem present → unsynced (yellow dot)
  // - no queue, localRow has serverUpdatedAt → synced (green dot, transient)
  // - else → idle (no dot)
  let status: Status;
  if (queueItem) {
    status = 'unsynced';
  } else if (
    localRow?.serverUpdatedAt &&
    localRow.clientUpdatedAt <= localRow.serverUpdatedAt
  ) {
    status = 'synced';
  } else {
    status = 'idle';
  }

  // Auto-fade 'synced' after a few seconds for clean UX.
  const [showSyncedDot, setShowSyncedDot] = useState(false);
  useEffect(() => {
    if (status === 'synced') {
      setShowSyncedDot(true);
      const t = setTimeout(() => setShowSyncedDot(false), 2000);
      return () => clearTimeout(t);
    } else {
      setShowSyncedDot(false);
    }
  }, [status]);

  const dotColor: string =
    status === 'unsynced'
      ? '#f59e0b' // yellow
      : (status as Status) === 'error'
        ? '#dc2626' // red
        : status === 'synced' && showSyncedDot
          ? '#16a34a' // green
          : 'transparent';

  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={20}
        step={1}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-20 min-h-[44px] rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-center text-lg font-medium bg-white dark:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-600"
        placeholder="—"
        aria-label="Brutto slag"
      />
      <span
        className="w-3 h-3 rounded-full inline-block"
        aria-label={status}
        style={{ backgroundColor: dotColor }}
      />
    </div>
  );
}
