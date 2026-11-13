import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SponsorStrip } from '@/components/SponsorStrip';
import type { EmbedBoard as EmbedBoardData, EmbedBoardRow } from '@/lib/embed/embedBoard';
import type { GamePrize } from '@/lib/games/prizes';
import { totalLabel } from '@/lib/leaderboard/boardRules';
import type { LiveBoardUnit } from '@/lib/leaderboard/liveBoard';
import { boardRowSr, placeLabel } from '@/app/[locale]/games/[id]/leaderboard/boardText';
import { EmbedLiveStatus } from './EmbedLiveStatus';

/** PLASS · SPILLER · HULL · TALL, as drawn. */
const COLUMNS = 'grid grid-cols-[28px_minmax(0,1fr)_40px_44px] items-center gap-2';

/**
 * The embed card (#2330): the club website's board for solo strokeplay and
 * solo stableford — «Tavla», the pill, the format line, the top five, «Vis
 * alle N →» and a footer, as drawn («Forslag: tavla på klubbens nettside»).
 * The snippet's frame is as high as the card (`compactEmbedHeight`, owner
 * 13.11: «Ja, etter sponsorene»), so the club page never gets a box that
 * scrolls inside itself. A shorter card ends where its content ends and the
 * rest of the frame is transparent (`[data-embed-compact]` in globals.css).
 * The links open the live link in a new tab: the frame cannot grow.
 *
 * All numbers come ready from `buildEmbedBoard`; this component only lays
 * them out. `board` is `null` while a reveal game hides net results.
 */
export function EmbedBoard({
  live,
  gameName,
  formatLabel,
  board,
  spectateHref,
  prizes,
}: {
  live: boolean;
  /** Read aloud after «Tavla»; the drawing shows no game name. */
  gameName: string;
  /** Server-translated format name («Stableford», «Slagspill»). */
  formatLabel: string;
  board: EmbedBoardData | null;
  spectateHref: string;
  prizes: GamePrize[];
}) {
  const t = useTranslations('embed.board');
  const te = useTranslations('embed');
  const tb = useTranslations('leaderboard.board');
  const tc = useTranslations('leaderboard.common');
  const brand = (chunks: ReactNode) => (
    <span className="font-serif font-semibold text-primary">{chunks}</span>
  );

  return (
    <div
      data-testid="embed-board"
      className="flex flex-col overflow-hidden rounded-[14px] border border-embed-card-border bg-bg leading-[normal] text-text"
    >
      <div className="flex items-center justify-between gap-2 border-b border-row-divider-warm px-3.5 py-3">
        <h1 className="font-serif text-[18px] font-semibold">
          {tb('title')}
          <span className="sr-only">, {gameName}</span>
        </h1>
        <EmbedLiveStatus live={live} holesPlayed={board?.holesPlayed ?? null} />
      </div>

      {board === null ? (
        <p data-testid="embed-hidden" className="px-3.5 py-6 text-center text-[13px] text-muted">
          {t('hidden')}
        </p>
      ) : (
        <>
          <p className="px-3.5 pt-1 text-[11px] text-muted">
            {t('formatLine', {
              format: formatLabel,
              unit: t(`unit.${board.unit}`),
              players: tb('players', { count: board.fieldSize }),
            })}
          </p>
          {board.rows.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[13px] text-muted">{tc('noPlayersToShow')}</p>
          ) : (
            <ol className="flex flex-col py-1.5">
              {board.rows.map((row, i) => (
                <Row
                  key={row.userId}
                  row={row}
                  first={i === 0}
                  unit={board.unit}
                  showPlace={board.showPlace}
                  name={row.name ?? tc('unknownPlayer')}
                />
              ))}
            </ol>
          )}
          {(!live || board.moreCount > 0) && (
            <a
              href={spectateHref}
              target="_blank"
              rel="noopener"
              data-testid="embed-more"
              data-focus-inset
              // box-content as drawn: 44 px to tap plus the 1 px line above.
              className="box-content flex min-h-11 items-center justify-center border-t border-row-divider-warm text-[13px] font-semibold text-primary"
            >
              {live ? t('showAll', { count: board.fieldSize }) : t('fullResult')}
            </a>
          )}
        </>
      )}

      <div>
        <SponsorStrip prizes={prizes} />
        <div className="flex items-center justify-between gap-3 bg-embed-foot px-3.5 py-2.5 text-[11px] text-muted">
          <span>{live ? t('autoUpdates') : te('resultStatus')}</span>
          {/* The footer is drawn 34 px high; the pseudo-element takes the
              link's hit area to 44 px without moving the line. */}
          <a
            href={spectateHref}
            target="_blank"
            rel="noopener"
            data-testid="embed-live-link"
            className="relative after:absolute after:-inset-x-2 after:-top-5 after:-bottom-2.5 after:content-['']"
          >
            {live ? t.rich('liveFrom', { brand }) : t.rich('from', { brand })}
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({
  row,
  first,
  unit,
  showPlace,
  name,
}: {
  row: EmbedBoardRow;
  first: boolean;
  unit: LiveBoardUnit;
  showPlace: boolean;
  name: string;
}) {
  const tb = useTranslations('leaderboard.board');
  const tc = useTranslations('leaderboard.common');
  const place = placeLabel(tb, row, showPlace);
  const sr = boardRowSr(tb, tc, {
    row: { ...row, movement: null, recent: [] },
    unit,
    showRank: showPlace,
    isYou: false,
  });

  return (
    <li
      data-testid="embed-row"
      data-rank={row.rank}
      data-leader={row.isLeader || undefined}
      className={`${COLUMNS} px-3.5 py-2 ${first ? '' : 'border-t border-row-divider-warm'}`}
    >
      {row.isLeader ? (
        <span
          aria-hidden
          data-testid="embed-leader"
          className="score-num grid size-[22px] place-items-center rounded-full bg-accent text-[11px] text-on-accent"
        >
          {place}
        </span>
      ) : (
        <span aria-hidden className="score-num text-center">
          {place}
        </span>
      )}
      <span aria-hidden className="truncate text-[14px] font-semibold">
        {name}
      </span>
      <span aria-hidden className="inline-num text-right text-[11px] text-muted">
        {row.holesPlayed}
      </span>
      <span aria-hidden className="score-num text-right text-[17px]">
        {totalLabel(unit, row.total)}
      </span>
      <span className="sr-only">{`${name}, ${sr}`}</span>
    </li>
  );
}
