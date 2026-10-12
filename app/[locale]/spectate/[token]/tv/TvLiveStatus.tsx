'use client';

import { useTranslations } from 'next-intl';
import { pillText } from '@/app/[locale]/games/[id]/leaderboard/boardText';
import { useSpectatePolling } from '../useSpectatePolling';

/**
 * The big screen's pill (#2275) — and the page's single polling owner, as on
 * the spectate banner: `router.refresh()` every 20 s while the game is live,
 * paused without network and once more when it is back. It also stands on the
 * explanation screens of a live game, so the TV turns to the finished screen
 * by itself. `holesPlayed` is `null` where there is no board (hidden net, a
 * format the TV does not show): the pill then says only «Live».
 */
export function TvLiveStatus({ live, holesPlayed }: { live: boolean; holesPlayed: number | null }) {
  const t = useTranslations('leaderboard.board');
  const ts = useTranslations('spectate');
  const { isOnline } = useSpectatePolling(live);

  return (
    <p
      data-testid="tv-pill"
      className="flex h-11 shrink-0 items-center gap-2.5 rounded-full bg-tv-text/12 px-[18px] text-[16px] font-semibold tracking-[0.14em] uppercase"
    >
      {live && (
        <span
          aria-hidden
          data-live={isOnline ? 'online' : 'offline'}
          className={`size-2.5 rounded-full bg-tv-dot-under ${isOnline ? '' : 'opacity-50'}`}
        />
      )}
      {!live ? ts('tv.finished') : isOnline ? pillText(t, holesPlayed) : ts('offlineStatus')}
    </p>
  );
}
