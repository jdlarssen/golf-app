'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, type SyncQueueItem } from '@/lib/sync/db';
import { drainQueue } from '@/lib/sync/syncWorker';

const STUCK_THRESHOLD_MS = 30_000;
const RETRY_MIN_FEEDBACK_MS = 500;

export function SyncBanner() {
  const queue = useLiveQuery<SyncQueueItem[] | undefined>(
    () => localDb.syncQueue.toArray(),
    [],
  );
  // Tick once per second so the "is older than 30s" check re-evaluates
  // without depending on Dexie writes (queue can sit unchanged for minutes).
  const [, setTick] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!queue || queue.length === 0) return null;

  const now = Date.now();
  const oldestCreatedAt = queue.reduce((acc, i) => {
    const t = new Date(i.createdAt).getTime();
    return t < acc ? t : acc;
  }, Number.POSITIVE_INFINITY);
  const oldestAgeMs = now - oldestCreatedAt;
  const hasErrors = queue.some(
    (i) => i.attemptCount > 0 || i.lastError != null,
  );
  const isStuck = oldestAgeMs > STUCK_THRESHOLD_MS;

  if (!hasErrors && !isStuck) return null;

  const errorReason = queue.find((i) => i.lastError)?.lastError ?? null;

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await Promise.all([
      drainQueue(),
      new Promise((r) => setTimeout(r, RETRY_MIN_FEEDBACK_MS)),
    ]);
    setRetrying(false);
  };

  const message = hasErrors
    ? `Lagring mislyktes (${queue.length} slag).`
    : `${queue.length} slag venter på lagring.`;

  const toneClasses = hasErrors
    ? 'bg-danger/[0.08] border-danger/30 text-danger'
    : 'bg-warning/[0.10] border-warning/40 text-warning';

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 px-3 pt-2 pointer-events-none"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
    >
      <div
        className={`pointer-events-auto flex items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-sm ${toneClasses}`}
      >
        <div className="min-w-0 text-sm font-medium leading-tight">
          <div className="truncate">{message}</div>
          {errorReason && (
            <div className="mt-0.5 truncate text-[11px] font-normal opacity-80">
              {errorReason}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="shrink-0 rounded-md border border-current px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition-opacity disabled:opacity-50"
        >
          {retrying ? 'Sender…' : 'Prøv igjen'}
        </button>
      </div>
    </div>
  );
}
