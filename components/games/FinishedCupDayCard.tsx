import { useTranslations, useLocale } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { GameRowCard, GameRowMetaLine } from '@/components/games/GameRowCard';
import { formatShortDateLocale } from '@/lib/i18n/format';
import { cupDayFinishedBadge, type FinishedEntry } from '@/lib/games/finishedEntries';

type CupDayEntry = Extract<FinishedEntry, { kind: 'cupDay' }>;

/**
 * The finished card for one split cup day (#1449 / #1463 layer 1): the two host
 * halves fold into ONE cup-branded card that is the player's durable door back
 * into the cup. Title is the cup name, meta is «Cup-dag · bane», and the whole
 * card links to `/cup/[id]` (the room where the day lives — NOT a game
 * leaderboard).
 *
 * Badge per owner decision 4: neutral (a plain arrow) while the cup is still
 * running; once finished, «Laget ditt vant/tapte cupen» from the persisted
 * `winner_team` + the viewer's side, or the «Delt»-voice on a tie. The result
 * is read, never recomputed.
 *
 * Server-safe (no 'use client'), like {@link FinishedGameCard}; i18n via
 * next-intl so #60 localizes it.
 */
export function FinishedCupDayCard({ entry }: { entry: CupDayEntry }) {
  const t = useTranslations('finishedCard');
  const locale = useLocale() as AppLocale;
  const badge = cupDayFinishedBadge(entry);

  return (
    <GameRowCard
      href={`/cup/${entry.tournamentId}`}
      title={entry.cupName}
      meta={
        <>
          <GameRowMetaLine>
            {[t('cup.dayMarking'), entry.courseName].filter(Boolean).join(' · ')}
          </GameRowMetaLine>
          {entry.ended_at && (
            <GameRowMetaLine tabular>
              {formatShortDateLocale(entry.ended_at, locale)}
            </GameRowMetaLine>
          )}
        </>
      }
      trailing={
        badge ? (
          <span
            data-testid="finished-cupday-badge"
            data-win={badge.isWin}
            className={`shrink-0 max-w-[45%] text-right text-sm font-medium leading-snug ${
              badge.isWin ? 'text-accent' : 'text-muted'
            }`}
          >
            {t(badge.key as Parameters<typeof t>[0])}
          </span>
        ) : (
          <span aria-hidden data-testid="finished-cupday-arrow" className="shrink-0 text-muted">
            →
          </span>
        )
      }
    />
  );
}
