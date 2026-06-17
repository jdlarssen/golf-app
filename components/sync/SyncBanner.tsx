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
  if (!rawError) return 'Klarte ikke å lagre';
  const lower = rawError.toLowerCase();
  if (
    lower.includes('load failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return 'Mistet nettforbindelsen';
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
    return 'Du mangler tilgang';
  }
  if (
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('too many')
  ) {
    return 'For mange forespørsler, vent litt';
  }
  return 'Klarte ikke å lagre';
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

  // Quarantined items (#668): drainQueue gave up after a permanently-failing
  // sync. They never retry, so they're surfaced separately from the still-
  // retrying "active" items — a lost stroke must never be silent.
  const abandoned = queue.filter((i) => i.abandonedAt != null);
  const active = queue.filter((i) => i.abandonedAt == null);
  const abandonedCount = abandoned.length;

  const oldestCreatedAt = active.reduce((acc, i) => {
    const t = new Date(i.createdAt).getTime();
    return t < acc ? t : acc;
  }, Number.POSITIVE_INFINITY);
  const oldestAgeMs = now - oldestCreatedAt;
  const hasErrors = active.some(
    (i) => i.attemptCount > 0 || i.lastError != null,
  );
  const isStuck = active.length > 0 && oldestAgeMs > STUCK_THRESHOLD_MS;

  if (abandonedCount === 0 && !hasErrors && !isStuck) return null;

  const rawError = active.find((i) => i.lastError)?.lastError ?? null;
  // Retry only does something for active items; quarantined items are skipped
  // by drainQueue, so hide the button when there's nothing left to retry.
  const showRetry = active.length > 0;

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await Promise.all([
      drainQueue(),
      new Promise((r) => setTimeout(r, RETRY_MIN_FEEDBACK_MS)),
    ]);
    setRetrying(false);
  };

  // Abandoned takes priority — it's the most severe (genuine data loss).
  const message =
    abandonedCount > 0
      ? `Kunne ikke lagre ${abandonedCount} slag. Kontakt arrangøren.`
      : hasErrors
        ? `${friendlySyncError(rawError)}. ${active.length} slag venter.`
        : `${active.length} slag venter på lagring.`;

  const toneClasses =
    abandonedCount > 0 || hasErrors
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
        {showRetry && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="shrink-0 rounded-md border border-current px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition-opacity disabled:opacity-50"
          >
            {retrying ? 'Sender…' : 'Prøv igjen'}
          </button>
        )}
      </div>
    </div>
  );
}
