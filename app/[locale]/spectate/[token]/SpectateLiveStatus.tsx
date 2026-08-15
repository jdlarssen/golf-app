'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSpectatePolling } from './useSpectatePolling';

/**
 * Status half of the spectate banner (#1376) — and the spectate page's single
 * polling owner.
 *
 * Before this, the banner rendered a server-side `liveStatus` label with a
 * pulsing dot for as long as the game was active, while a separate invisible
 * poller did the refreshing. Lose the network and the dot kept pulsing over frozen
 * numbers. Now the dot, the label and the timestamp all come from the same
 * hook that drives the polling, so what the spectator sees matches what the
 * page is actually doing.
 *
 * The timestamp is formatted with `toLocaleTimeString` against the spectator's
 * own clock. `useFormatter()` would be wrong here: `i18n/request.ts` pins
 * next-intl's formatter to Europe/Oslo, and a spectator following from another
 * time zone would read an hour that isn't on their wall.
 */
export function SpectateLiveStatus({ live }: { live: boolean }) {
  const t = useTranslations('spectate');
  const locale = useLocale();
  const { isOnline, lastUpdatedAt } = useSpectatePolling(live);

  // Finished game: static label, no dot, no timers at all.
  if (!live) {
    return (
      <span className="flex items-center gap-2" data-testid="spectate-status">
        <span data-testid="spectate-status-label">{t('resultStatus')}</span>
      </span>
    );
  }

  const offline = !isOnline;

  return (
    <span className="flex items-center gap-2" data-testid="spectate-status">
      <span
        aria-hidden
        data-testid="spectate-status-dot"
        data-live={offline ? 'offline' : 'online'}
        className={[
          'inline-block size-2 rounded-full bg-white',
          // Offline keeps the dot as a dimmed marker, not a heartbeat.
          offline ? 'opacity-50' : 'animate-pulse',
        ].join(' ')}
      />
      {/* Status stays real text in the DOM — never colour or motion alone. */}
      <span data-testid="spectate-status-label">
        {offline ? t('offlineStatus') : t('liveStatus')}
      </span>
      {!offline && lastUpdatedAt && (
        <span data-testid="spectate-status-updated" className="opacity-75">
          <span aria-hidden>· </span>
          {t('updatedAt', {
            time: lastUpdatedAt.toLocaleTimeString(locale, {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })}
        </span>
      )}
    </span>
  );
}
