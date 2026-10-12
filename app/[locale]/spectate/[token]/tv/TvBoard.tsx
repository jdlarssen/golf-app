'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { LiveBoard, LiveBoardRow, LiveBoardUnit } from '@/lib/leaderboard/liveBoard';
import { TV_PAGE_MS, tvPageCount, tvPageRows } from '@/lib/leaderboard/tvBoard';
import type { ScoreTone } from '@/lib/scoring/scoreTone';
import {
  boardDisplayName,
  boardRowSr,
  boardShowsRank,
  isBoardLeader,
  placeLabel,
  totalLabel,
} from '@/app/[locale]/games/[id]/leaderboard/boardText';

/** PLASS · SPILLER · SISTE 5 HULL · HULL · POENG, as drawn. */
const COLUMNS = 'grid grid-cols-[80px_minmax(0,1fr)_200px_90px_110px] gap-4';

const DOT: Record<ScoreTone, string> = {
  under: 'bg-tv-dot-under',
  par: 'bg-tv-dot-par',
  over1: 'bg-tv-dot-bogey',
  over2: 'bg-tv-dot-double',
  unset: 'bg-tv-dot-par',
};

/**
 * The big screen's board (#2275): five players a page, turning every ten
 * seconds without animation. All numbers come ready from `computeLiveBoard`,
 * and the board's text rules from `boardText.ts`. The page index is local
 * state with no `key` tied to the data, so it survives the 20-second
 * `router.refresh()`; a refresh that leaves fewer pages wraps it around.
 */
export function TvBoard({ board }: { board: LiveBoard }) {
  const t = useTranslations('leaderboard.board');
  const tc = useTranslations('leaderboard.common');
  const ts = useTranslations('spectate.tv');
  const [page, setPage] = useState(0);
  const { rows, unit } = board;
  const pages = tvPageCount(rows.length);

  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), TV_PAGE_MS);
    return () => clearInterval(id);
  }, [pages]);

  if (rows.length === 0) return <TvMessage>{tc('noPlayersToShow')}</TvMessage>;

  const showRank = boardShowsRank(board.holesPlayed);
  const players = t('players', { count: rows.length });

  return (
    <>
      <div className="flex flex-col rounded-[18px] bg-tv-board px-[18px] py-2.5">
        <div
          aria-hidden
          className={`${COLUMNS} pt-1.5 pb-2 text-[12px] font-semibold tracking-[0.2em] text-tv-text/70 uppercase`}
        >
          <span>{t('colPlace')}</span>
          <span>{t('colPlayer')}</span>
          <span>{t('legendRecent')}</span>
          <span className="text-right">{t('colHoles')}</span>
          <span className="text-right">{unit === 'points' ? t('colPoints') : t('colNet')}</span>
        </div>
        <ol data-testid="tv-board">
          {tvPageRows(rows, page).map((row) => (
            <TvRow
              key={row.userId}
              row={row}
              unit={unit}
              name={boardDisplayName(row, tc)}
              showRank={showRank}
              sr={boardRowSr(t, tc, { row, unit, showRank, isYou: false })}
            />
          ))}
        </ol>
      </div>
      <p data-testid="tv-paging" className="text-[14px] text-tv-text/70">
        {pages > 1
          ? ts('paging', {
              page: (page % pages) + 1,
              pages,
              seconds: TV_PAGE_MS / 1000,
              players,
            })
          : players}
      </p>
    </>
  );
}

function TvRow({
  row,
  unit,
  name,
  showRank,
  sr,
}: {
  row: LiveBoardRow;
  unit: LiveBoardUnit;
  name: string;
  showRank: boolean;
  sr: string;
}) {
  const t = useTranslations('leaderboard.board');
  const leader = isBoardLeader(row) && showRank;
  const arrow =
    row.movement !== null && row.movement > 0
      ? { text: `▲ ${row.movement}`, className: 'text-tv-arrow-up' }
      : row.movement !== null && row.movement < 0
        ? { text: `▼ ${-row.movement}`, className: 'text-tv-arrow-down' }
        : null;

  return (
    <li
      data-testid="tv-row"
      data-user-id={row.userId}
      data-leader={leader || undefined}
      className={`${COLUMNS} box-content h-[62px] items-center border-t ${
        leader ? 'border-tv-gold/50' : 'border-tv-text/15'
      }`}
    >
      {leader ? (
        <span
          aria-hidden
          data-testid="tv-medallion"
          className="flex size-11 items-center justify-center rounded-full bg-tv-gold font-serif text-[22px] font-semibold text-tv-ink"
        >
          {placeLabel(t, row, showRank)}
        </span>
      ) : (
        <span aria-hidden className="pl-3 font-serif text-[24px] font-medium">
          {placeLabel(t, row, showRank)}
        </span>
      )}
      <span className="flex min-w-0 items-baseline font-serif text-[30px] font-medium">
        {/* The space before the arrow is the name's own, in the name's font. */}
        <span className="truncate">{arrow ? `${name} ` : name}</span>
        {arrow && (
          <span
            aria-hidden
            className={`shrink-0 font-sans text-[16px] font-semibold ${arrow.className}`}
          >
            {arrow.text}
          </span>
        )}
      </span>
      <span aria-hidden className="flex gap-2">
        {row.recent.map((tone, i) => (
          <span key={i} data-tone={tone} className={`size-4 rounded-full ${DOT[tone]}`} />
        ))}
      </span>
      <span aria-hidden className="text-right font-serif text-[26px] font-medium">
        {row.holesPlayed}
      </span>
      <span
        aria-hidden
        className={`text-right font-serif text-[36px] font-semibold ${leader ? 'text-tv-lead-total' : ''}`}
      >
        {totalLabel(unit, row.total)}
      </span>
      <span className="sr-only">{sr}</span>
    </li>
  );
}

/** One sentence where the board stands: no players, hidden net, another format, finished. */
export function TvMessage({ children }: { children: string }) {
  return (
    <div className="rounded-[18px] bg-tv-board px-[18px] py-2.5">
      <p data-testid="tv-message" className="font-serif text-[30px] font-medium">
        {children}
      </p>
    </div>
  );
}
