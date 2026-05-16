'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, type SyncQueueItem } from '@/lib/sync/db';
import { drainQueue } from '@/lib/sync/syncWorker';

const STUCK_THRESHOLD_MS = 30_000;
const RETRY_MIN_FEEDBACK_MS = 500;

/**
 * Map raw Supabase / fetch error strings to a short Norwegian explanation
 * a player can act on. The raw error is still kept in Dexie's queue.lastError
 * for diagnostics — only the banner copy is friendlied up.
 *
 * Common cases observed during pilot testing:
 *   - Safari offline: "TypeError: Load failed"
 *   - Chrome offline: "TypeError: Failed to fetch"
 *   - Firefox offline: "NetworkError when attempting to fetch resource."
 *   - Supabase session expired: includes "JWT" / "expired" / "401"
 *   - RLS denied: includes "permission" / "forbidden" / "row-level"
 */
function friendlySyncError(rawError: string | null): string {
  if (!rawError) return 'Lagring mislyktes';
  const lower = rawError.toLowerCase();
  if (
    lower.includes('load failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return 'Mistet nett-tilkoblingen';
  }
  if (
    lower.includes('jwt') ||
    lower.includes('expired') ||
    lower.includes('session') ||
    lower.includes('401') ||
    lower.includes('unauthorized')
  ) {
    return 'Innloggingen er utløpt — logg inn på nytt';
  }
  if (
    lower.includes('permission') ||
    lower.includes('forbidden') ||
    lower.includes('row-level') ||
    lower.includes('403')
  ) {
    return 'Tillatelse manglet';
  }
  if (
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('too many')
  ) {
    return 'For mange forespørsler — vent litt';
  }
  return 'Lagring mislyktes';
}

export function SyncBanner() {
  const queue = useLiveQuery<SyncQueueItem[] | undefined>(
    () => localDb.syncQueue.toArray(),
    [],
  );
  // Tick `now` once per second so the "is older than 30s" check re-evaluates
  // without depending on Dexie writes (queue can sit unchanged for minutes).
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!queue || queue.length === 0) return null;
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

  const rawError = queue.find((i) => i.lastError)?.lastError ?? null;

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
    ? `${friendlySyncError(rawError)}. ${queue.length} slag venter.`
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
        // Raw error stays accessible to admin via hover/long-press tooltip
        // (and via Dexie's queue.lastError) without being shoved in the
        // player's face on every load.
        title={rawError ?? undefined}
      >
        <div className="min-w-0 text-sm font-medium leading-tight">
          <div className="truncate">{message}</div>
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
