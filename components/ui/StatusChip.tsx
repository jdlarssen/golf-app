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
 * Uppercase status pill used on admin "protokoll" surfaces, for a game, cup or
 * league. Shows the four lifecycle states with the text from the i18n
 * `gameStatus` namespace — the one home for status words on the web (#2491);
 * the chip has no text of its own. Tracks tightly (0.16em) at 11px — still a
 * stamp, but one you can read outdoors (#1390; it was 9.5px, which the HCD
 * audit flagged as too small for the core loop). The chip never wraps, so a
 * two-word label ("In progress") stays on one line in narrow columns.
 *
 * Width note for callers with a fixed column: the longest label is English
 * "In progress", 106.6px here (Inter SemiBold, 0.16em tracking, 7px side
 * padding, measured on staging at 360px, #2491); the longest Norwegian one,
 * "Avsluttet", is 95px. `GAMES_LEDGER_GRID` in admin/games is 111px to match;
 * any new fixed-width mount point needs at least that.
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
      className={`inline-block whitespace-nowrap rounded-full px-[7px] py-[3px] font-sans text-[11px] font-semibold uppercase ${className ?? ''}`}
      style={{
        background: style.bg,
        color: style.fg,
        letterSpacing: '0.16em',
      }}
    >
      {t(status)}
    </span>
  );
}
