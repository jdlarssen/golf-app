'use client';

import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, scoreKey } from '@/lib/sync/db';
import { writeScore } from '@/lib/sync/writeScore';
import { startSyncListener, drainQueue } from '@/lib/sync/syncWorker';

type Status = 'unsynced' | 'synced' | 'idle' | 'error';

const MIN_STROKES = 1;
const MAX_STROKES = 20;

export function HoleScoreInput({
  gameId,
  userId,
  holeNumber,
  par,
  initialStrokes,
  initialClientUpdatedAt,
  initialServerUpdatedAt,
  myUserId,
  disabled,
}: {
  gameId: string;
  userId: string;
  holeNumber: number;
  par: number;
  initialStrokes: number | null;
  initialClientUpdatedAt: string | null;
  initialServerUpdatedAt: string | null;
  myUserId: string;
  disabled?: boolean;
}) {
  const id = scoreKey(gameId, userId, holeNumber);

  const localRow = useLiveQuery(() => localDb.scores.get(id), [id]);
  const queueItem = useLiveQuery(() => localDb.syncQueue.get(id), [id]);

  // Seed Dexie with the server's value on mount.
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

  useEffect(() => {
    startSyncListener();
  }, []);

  const displayed: string =
    localRow?.strokes != null
      ? String(localRow.strokes)
      : localRow
        ? ''
        : initialStrokes != null
          ? String(initialStrokes)
          : '';

  const [value, setValue] = useState<string>(displayed);
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

  function scheduleSave(raw: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => save(raw), 500);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    scheduleSave(next);
  }

  function step(delta: number) {
    if (disabled) return;
    let next: number;
    if (value.trim() === '') {
      // Empty input: stepping in either direction lands on par as a natural
      // starting point for typical golf scoring.
      next = par;
    } else {
      const cur = Number(value);
      next = Number.isInteger(cur) ? cur + delta : par;
    }
    next = Math.max(MIN_STROKES, Math.min(MAX_STROKES, next));
    const nextStr = String(next);
    setValue(nextStr);
    scheduleSave(nextStr);
  }

  async function save(rawValue: string) {
    const trimmed = rawValue.trim();
    if (trimmed === '') {
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
    if (!Number.isInteger(n) || n < MIN_STROKES || n > MAX_STROKES) {
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
      ? '#f59e0b'
      : (status as Status) === 'error'
        ? '#dc2626'
        : status === 'synced' && showSyncedDot
          ? '#16a34a'
          : 'transparent';

  const buttonClass =
    'w-11 h-11 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:bg-zinc-300 dark:active:bg-zinc-600 text-zinc-700 dark:text-zinc-300 text-xl font-medium leading-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center select-none transition-colors';

  const currentNumber = Number(value);
  const canDecrement =
    !disabled && (value.trim() === '' || (Number.isInteger(currentNumber) && currentNumber > MIN_STROKES));
  const canIncrement =
    !disabled && (value.trim() === '' || (Number.isInteger(currentNumber) && currentNumber < MAX_STROKES));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={!canDecrement}
        className={buttonClass}
        aria-label="Trekk fra ett slag"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={MIN_STROKES}
        max={MAX_STROKES}
        step={1}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={String(par)}
        aria-label="Brutto slag"
        className="w-14 h-11 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 text-center text-lg font-medium bg-white dark:bg-zinc-900 placeholder-zinc-400 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => step(1)}
        disabled={!canIncrement}
        className={buttonClass}
        aria-label="Legg til ett slag"
      >
        +
      </button>
      <span
        className="w-2.5 h-2.5 rounded-full inline-block ml-1"
        aria-label={status}
        style={{ backgroundColor: dotColor }}
      />
    </div>
  );
}
