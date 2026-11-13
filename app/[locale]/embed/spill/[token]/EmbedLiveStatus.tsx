'use client';

import { useTranslations } from 'next-intl';
import { pillText } from '@/app/[locale]/games/[id]/leaderboard/boardText';
import { useSpectatePolling } from '@/app/[locale]/spectate/[token]/useSpectatePolling';

/**
 * The embed card's pill (#2330) — and the page's single polling owner, as on
 * the big screen (`tv/TvLiveStatus.tsx`): `router.refresh()` every 20 s while
 * the game is live, paused without network and once more when it is back. It
 * also stands on the reveal card, so a hidden game turns to its finished
 * board by itself. `holesPlayed` is `null` where there is no board: the pill
 * then says only «Live».
 */
export function EmbedLiveStatus({ live, holesPlayed }: { live: boolean; holesPlayed: number | null }) {
  const t = useTranslations('leaderboard.board');
  const ts = useTranslations('spectate');
  const { isOnline } = useSpectatePolling(live);

  return (
    <span
      data-testid="embed-pill"
      className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-2 text-[12px] leading-[normal] font-semibold text-primary"
    >
      {live && (
        <span
          aria-hidden
          data-live={isOnline ? 'online' : 'offline'}
          className={`size-1.5 rounded-full bg-live-dot ${isOnline ? 'motion-safe:animate-pulse' : 'opacity-50'}`}
        />
      )}
      {!live ? ts('tv.finished') : isOnline ? pillText(t, holesPlayed) : ts('offlineStatus')}
    </span>
  );
}
