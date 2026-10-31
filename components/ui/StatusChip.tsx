import { useTranslations } from 'next-intl';
import type { GameStatus } from '@/lib/games/status';

const STATUS_STYLES: Record<GameStatus, { bg: string; fg: string }> = {
  draft: {
    bg: 'var(--score-over2-bg)',
    fg: 'var(--score-over2-fg)',
  },
  scheduled: {
    bg: 'var(--score-over1-bg)',
    fg: 'var(--score-over1-fg)',
  },
  active: {
    bg: 'var(--score-under-bg)',
    fg: 'var(--score-under-fg)',
  },
  finished: {
    bg: 'var(--score-par-bg)',
    fg: 'var(--text-muted)',
  },
};

/**
 * Status pill used on admin "protokoll" surfaces, for a game, cup or league.
 * Shows the four lifecycle states with the text from the i18n `gameStatus`
 * namespace — the one home for status words on the web (#2491); the chip has
 * no text of its own. Sentence case, 12px semibold, no letter-spacing (the
 * owner dropped uppercase kickers on 2026-10-31, #2728) — readable outdoors
 * (#1390). The chip never wraps, so a two-word label ("In progress") stays on
 * one line in narrow columns.
 *
 * Width note for callers with a fixed column: the longest label used to be
 * English "In progress" at 106.6px in the old tracked uppercase style (#2491);
 * sentence case at 12px is narrower, so `GAMES_LEDGER_GRID` in admin/games
 * (111px) still holds. Any new fixed-width mount point needs at least that.
 */
export function StatusChip({
  status,
  className,
}: {
  status: GameStatus;
  className?: string;
}) {
  const t = useTranslations('gameStatus');
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-[7px] py-[3px] font-sans text-xs font-semibold ${className ?? ''}`}
      style={{
        background: style.bg,
        color: style.fg,
      }}
    >
      {t(status)}
    </span>
  );
}
