import { useId } from 'react';
import { useTranslations } from 'next-intl';
import type { RankedEntry } from '@/lib/stats/aeresbrett';

/** Rows on the board: the first two stand, as drawn; the rest of the top 10 fold. */
const VISIBLE = 2;
const TOP = 10;

const MEDAL: Record<number, string> = {
  1: 'bg-medal-gold',
  2: 'bg-[image:var(--medal-silver)]',
  3: 'bg-[image:var(--medal-bronze)]',
};

/**
 * «Klubbens æresbrett · 2026» on /klubber/[id] (#2326 PR2, artboard
 * «Forslag: klubbens side»): wins in the club's finished rounds this Oslo
 * year, current members only, on a green card. Two rows stand, as drawn; places
 * 1–3 get a gold, silver and bronze medallion, also in the fold, and equal
 * counts share a place (`rankBoard`). Under the rows: «Du: 7. plass» or «Ingen seire ennå i 2026.», and «Se hele brettet»
 * folds out the rest of the top 10 (native `<details>`).
 *
 * Presentation only; the page decides the year, the rows and whether the board
 * shows at all. Expects a full-width parent (AppShell `flush`).
 */
export function ClubBoardSection({
  year,
  rows,
  me,
}: {
  year: number;
  rows: readonly RankedEntry[];
  me: RankedEntry | null;
}) {
  const t = useTranslations('klubb.room');
  const headingId = useId();
  const top = rows.slice(0, TOP);
  const shown = top.slice(0, VISIBLE);
  const rest = top.slice(VISIBLE);
  // The year as text: ICU would group 2026 as «2 026».
  const yearText = String(year);
  const mine = me ? t('boardYou', { place: me.place }) : t('boardNoWins', { year: yearText });
  // In the fold's line the no-wins sentence runs on into «· Se hele brettet».
  const mineInline = me ? mine : t('boardNoWinsInline', { year: yearText });

  return (
    <section aria-labelledby={headingId} data-testid="club-board">
      <h2
        id={headingId}
        className="px-5 pt-[18px] pb-2 text-xs font-semibold leading-[normal] text-muted"
      >
        {t('boardHeading', { year: yearText })}
      </h2>
      <div
        data-focus-surface="strong"
        className="mx-4 flex flex-col gap-2 rounded-2xl bg-surface-strong px-[14px] py-3 leading-[normal] text-on-strong"
      >
        <ol className="flex list-none flex-col gap-2 p-0">
          {shown.map((row) => (
            <BoardRow key={row.userId} row={row} />
          ))}
        </ol>
        {rest.length > 0 ? (
          <details className="group" data-testid="club-board-more">
            {/* The text sits 8 px under the rule, as drawn; the 44 px tap area
                reaches into the card's bottom padding. */}
            <summary className="-mb-3 flex min-h-11 cursor-pointer list-none items-start border-t border-on-strong/20 pt-2 text-[12px] text-on-strong/85 [&::-webkit-details-marker]:hidden">
              <span>
                <span data-testid="club-board-me">{mineInline}</span> · {t('boardSeeAll')}{' '}
                <span aria-hidden className="font-[system-ui]">
                  →
                </span>
              </span>
            </summary>
            <ol className="flex list-none flex-col gap-2 p-0 pt-3">
              {rest.map((row) => (
                <BoardRow key={row.userId} row={row} />
              ))}
            </ol>
          </details>
        ) : (
          <p
            data-testid="club-board-me"
            className="border-t border-on-strong/20 pt-2 text-[12px] text-on-strong/85"
          >
            {mine}
          </p>
        )}
      </div>
    </section>
  );
}

function BoardRow({ row }: { row: RankedEntry }) {
  const t = useTranslations('klubb.room');
  const medal = MEDAL[row.place];
  return (
    <li className="flex items-center gap-2.5" data-place={row.place}>
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-full font-serif text-[12px] font-semibold ${
          medal ? `${medal} text-medal-ink` : 'text-on-strong/85'
        }`}
      >
        {row.place}
      </span>
      <span className="min-w-0 grow truncate font-serif text-[16px] font-medium">{row.name}</span>
      <span className="shrink-0 text-[13px]">{t('boardWins', { count: row.count })}</span>
    </li>
  );
}
