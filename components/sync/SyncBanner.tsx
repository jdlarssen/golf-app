'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { localDb, type SyncQueueItem, type ConflictRecord } from '@/lib/sync/db';
import { drainQueue } from '@/lib/sync/syncWorker';
import {
  summarizeQuarantine,
  formatHoleList,
} from '@/lib/sync/quarantineSummary';
import { isActiveForGame } from '@/lib/sync/queueScope';
import { Disclosure } from '@/components/ui/Disclosure';

const STUCK_THRESHOLD_MS = 30_000;
const RETRY_MIN_FEEDBACK_MS = 500;

/**
 * Map raw Supabase / fetch error strings to a `SyncBanner` message key naming a
 * short explanation a player can act on. The caller runs the key through
 * `t()`, so the copy follows the active locale. The raw error is still kept in
 * Dexie's queue.lastError for diagnostics — only the banner copy is friendlied
 * up.
 *
 * The return type is the literal key union rather than `string` because
 * next-intl type-checks `t()` arguments against the no.json catalog
 * (see `i18n/types.d.ts`).
 *
 * Common cases observed during pilot testing:
 *   - Safari offline: "TypeError: Load failed"
 *   - Chrome offline: "TypeError: Failed to fetch"
 *   - Firefox offline: "NetworkError when attempting to fetch resource."
 *   - Supabase session expired: includes "JWT" / "expired" / "401"
 *   - RLS denied: includes "permission" / "forbidden" / "row-level"
 */
function friendlySyncError(
  rawError: string | null,
):
  | 'errorNetwork'
  | 'errorAuth'
  | 'errorPermission'
  | 'errorRateLimit'
  | 'errorGeneric' {
  if (!rawError) return 'errorGeneric';
  const lower = rawError.toLowerCase();
  if (
    lower.includes('load failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return 'errorNetwork';
  }
  if (
    lower.includes('jwt') ||
    lower.includes('expired') ||
    lower.includes('session') ||
    lower.includes('401') ||
    lower.includes('unauthorized')
  ) {
    return 'errorAuth';
  }
  if (
    lower.includes('permission') ||
    lower.includes('forbidden') ||
    lower.includes('row-level') ||
    lower.includes('403')
  ) {
    return 'errorPermission';
  }
  if (
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('too many')
  ) {
    return 'errorRateLimit';
  }
  return 'errorGeneric';
}

export function SyncBanner({ gameId }: { gameId?: string }) {
  const t = useTranslations('SyncBanner');
  const locale = useLocale();
  const pathname = usePathname();
  const queue = useLiveQuery<SyncQueueItem[] | undefined>(
    () => localDb.syncQueue.toArray(),
    [],
  );
  // Conflicts (#688 Part 2): records written by syncWorker when server silently
  // overwrites a score the current user had entered. One notice per record,
  // dismissed individually. Scoped to the round on screen (#1370) — a conflict
  // from another round can't be acted on from here. `conflicts` is indexed on
  // gameId (db.ts), so the filter runs in Dexie rather than in JS.
  const conflicts = useLiveQuery<ConflictRecord[] | undefined>(
    () =>
      gameId != null
        ? localDb.conflicts.where('gameId').equals(gameId).toArray()
        : localDb.conflicts.toArray(),
    [gameId],
  );
  // Tick `now` once per second so the "is older than 30s" check re-evaluates
  // without depending on Dexie writes (queue can sit unchanged for minutes).
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const hasConflicts = (conflicts?.length ?? 0) > 0;

  const handleDismissConflict = async (conflictId: string) => {
    await localDb.conflicts.delete(conflictId);
  };

  // Render the queue-related banner.
  const queueBanner = (() => {
    if (!queue || queue.length === 0) return null;

    // Quarantined items (#668): drainQueue gave up after a permanently-failing
    // sync. They never retry, so they're surfaced separately from the still-
    // retrying "active" items — a lost stroke must never be silent. Kept
    // UNFILTERED across games on purpose: the quarantine branch below names
    // stranded strokes from other rounds too (#1369).
    const abandoned = queue.filter((i) => i.abandonedAt != null);
    // Active items are scoped to the round on screen (#1370). "N strokes
    // waiting", the error copy and «Prøv igjen» describe THIS round — a stroke
    // still retrying for another round is that round's business, and drainQueue
    // keeps pushing it regardless of which banner is mounted.
    const active = queue.filter((i) =>
      gameId != null ? isActiveForGame(i, gameId) : i.abandonedAt == null,
    );

    const oldestCreatedAt = active.reduce((acc, i) => {
      const t = new Date(i.createdAt).getTime();
      return t < acc ? t : acc;
    }, Number.POSITIVE_INFINITY);
    const oldestAgeMs = now - oldestCreatedAt;
    const hasErrors = active.some(
      (i) => i.attemptCount > 0 || i.lastError != null,
    );
    const isStuck = active.length > 0 && oldestAgeMs > STUCK_THRESHOLD_MS;

    if (abandoned.length === 0 && !hasErrors && !isStuck) return null;

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

    const actionButtonClasses =
      'inline-flex min-h-[44px] items-center rounded-md border border-current px-3 text-xs font-semibold uppercase tracking-wide transition-opacity disabled:opacity-50';

    // Quarantine variant (#1369): name the affected holes, link to them, show
    // the raw error without hover, and offer a confirmed cleanup path.
    if (abandoned.length > 0) {
      const summary = summarizeQuarantine(queue, gameId ?? null);
      const { currentGame, otherGames } = summary;

      // Deleting only the ids that were quarantined at render time guarantees
      // active (still-retrying) items are never swept up.
      const handleDismissQuarantine = async () => {
        if (!window.confirm(t('quarantineDismissConfirm'))) return;
        await localDb.syncQueue.bulkDelete(abandoned.map((i) => i.id));
      };

      return (
        <div
          data-testid="quarantine-banner"
          className="pointer-events-auto rounded-xl border px-3 py-2 shadow-sm bg-danger/[0.08] border-danger/30 text-danger"
        >
          <div className="space-y-1 text-sm font-medium leading-tight">
            {currentGame && (
              <p className="break-words">
                {t('quarantineHoles', {
                  count: currentGame.holes.length,
                  holes: formatHoleList(currentGame.holes, locale),
                })}
              </p>
            )}
            {otherGames.map((game) => (
              <p key={game.gameId} className="break-words">
                {t('quarantineOtherGame', { count: game.count })}{' '}
                <Link
                  data-testid="quarantine-open-game"
                  href={`/games/${game.gameId}`}
                  className="underline underline-offset-2"
                >
                  {t('quarantineOpenGame')}
                </Link>
              </p>
            ))}
            {!currentGame && otherGames.length === 0 && (
              // Every scoreId failed to parse (never expected) — degrade to the
              // pre-#1369 generic message rather than an empty banner.
              <p className="break-words">
                {t('abandonedMessage', { count: summary.totalCount })}
              </p>
            )}
          </div>
          <p className="mt-1 text-xs font-normal opacity-80">
            {t('quarantineRecoveryHint')}
          </p>
          {currentGame && (
            <div className="mt-1 flex flex-wrap gap-x-3">
              {currentGame.holes.map((hole) => (
                <Link
                  key={hole}
                  data-testid="quarantine-open-hole"
                  href={`/games/${currentGame.gameId}/holes/${hole}`}
                  className="inline-flex min-h-[44px] items-center text-sm font-semibold underline underline-offset-2"
                >
                  {t('quarantineOpenHole', { holeNumber: hole })}
                </Link>
              ))}
            </div>
          )}
          {summary.errors.length > 0 && (
            <Disclosure
              id="quarantine-details"
              title={t('quarantineDetailsTitle')}
              className="mt-2"
            >
              <ul className="space-y-1 text-xs text-muted">
                {summary.errors.map((error) => (
                  <li key={error} className="break-words">
                    {error}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="quarantine-dismiss"
              onClick={() => void handleDismissQuarantine()}
              className={actionButtonClasses}
            >
              {t('quarantineDismiss')}
            </button>
            {showRetry && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className={actionButtonClasses}
              >
                {retrying ? t('retrying') : t('retry')}
              </button>
            )}
          </div>
        </div>
      );
    }

    // Active-only variant: still-retrying items (transient errors / stuck
    // queue). Compact one-row banner, unchanged behavior from before #1369.
    const rawError = active.find((i) => i.lastError)?.lastError ?? null;
    const errorKey = friendlySyncError(rawError);
    const message = hasErrors
      ? t('errorWithQueue', {
          error: t(errorKey),
          count: active.length,
        })
      : t('queueWaiting', { count: active.length });

    // #1371: an expired session tells the player to log in again but offered
    // no way there — retry just re-runs the same failing sync. The next-param
    // must carry the locale prefix itself (login's redirect consumes it raw,
    // same contract as proxy.ts' login redirect).
    const showLogin = hasErrors && errorKey === 'errorAuth';
    const loginNext =
      locale === routing.defaultLocale ? pathname : `/${locale}${pathname}`;

    const toneClasses = hasErrors
      ? 'bg-danger/[0.08] border-danger/30 text-danger'
      : 'bg-warning/[0.10] border-warning/40 text-warning-text';

    return (
      <div
        className={`pointer-events-auto flex items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-sm ${toneClasses}`}
      >
        <div className="min-w-0 text-sm font-medium leading-tight">
          <div className="truncate">{message}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showLogin && (
            <Link
              href={`/login?next=${encodeURIComponent(loginNext)}`}
              className="inline-flex min-h-[44px] items-center rounded-md border border-current px-2.5 text-xs font-semibold uppercase tracking-wide"
            >
              {t('loginAction')}
            </Link>
          )}
          {showRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex min-h-[44px] items-center rounded-md border border-current px-2.5 text-xs font-semibold uppercase tracking-wide transition-opacity disabled:opacity-50"
            >
              {retrying ? t('retrying') : t('retry')}
            </button>
          )}
        </div>
      </div>
    );
  })();

  if (!queueBanner && !hasConflicts) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 px-3 pt-2 pointer-events-none flex flex-col gap-1"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
    >
      {queueBanner}
      {conflicts?.map((conflict) => (
        <div
          key={conflict.id}
          data-testid="conflict-notice"
          data-conflict-variant={conflict.forOwnScore === false ? 'marker' : 'own'}
          className="pointer-events-auto flex items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-sm bg-warning/[0.10] border-warning/40 text-warning-text"
        >
          <div className="min-w-0 text-sm font-medium leading-tight">
            <div className="truncate">
              {/* #1368: records written before the field shipped have no
                  forOwnScore — those were always own-score conflicts. */}
              {t(
                conflict.forOwnScore === false
                  ? 'conflictNoticeMarker'
                  : 'conflictNotice',
                { holeNumber: conflict.holeNumber },
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleDismissConflict(conflict.id)}
            className="shrink-0 rounded-md border border-current px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
          >
            {t('conflictDismiss')}
          </button>
        </div>
      ))}
    </div>
  );
}
