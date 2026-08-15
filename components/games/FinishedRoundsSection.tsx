import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getServerClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { GameHistoryRow } from '@/components/stats/GameHistoryRow';
import { FinishedCupDayCard } from '@/components/games/FinishedCupDayCard';
import { formatShortDayMonthLocale } from '@/lib/i18n/format';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { finishedResultBadge } from '@/lib/games/finishedResultBadge';
import { computeRoundScore } from '@/lib/games/roundScore';
import { getRoundScoresForGames } from '@/lib/games/getRoundScoresForGames';
import type { FinishedGame } from '@/lib/games/getFinishedGamesForUser';
import type { FinishedEntry } from '@/lib/games/finishedEntries';

/**
 * Hjem-seksjonen «Avsluttede spill» (#986): de 3 nyeste avsluttede oppføringene.
 * Vanlige runder rendres som tette «Runder»-rader med brutto (hero) + netto —
 * samme rad-mønster som Profil → Historikk, via den delte `computeRoundScore`-
 * helperen så tallene ikke driver fra hverandre. En splittet cup-dag (#1449)
 * folder de to host-halvdelene til ETT cup-merket kort som lenker til cup-siden.
 * «Se alle» → /spill-arkiv når det finnes flere enn 3.
 *
 * Ren server-trygg modul (ingen 'use client'); i18n via next-intl-server på
 * kallstedet (`GameHistoryRow` er rent presentasjonelt).
 */

// A run of consecutive plain-game entries renders as one divided Card; each cup
// day renders as its own card. This grouping keeps a no-cup list byte-identical
// to before (one Card of rows), while a cup day breaks out cleanly.
type Block =
  | { kind: 'games'; games: FinishedGame[] }
  | { kind: 'cupDay'; entry: Extract<FinishedEntry, { kind: 'cupDay' }> };

function toBlocks(entries: FinishedEntry[]): Block[] {
  const blocks: Block[] = [];
  for (const entry of entries) {
    if (entry.kind === 'cupDay') {
      blocks.push({ kind: 'cupDay', entry });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === 'games') last.games.push(entry.game);
    else blocks.push({ kind: 'games', games: [entry.game] });
  }
  return blocks;
}

export async function FinishedRoundsSection({
  entries,
  userId,
  locale,
}: {
  entries: FinishedEntry[];
  userId: string;
  locale: AppLocale;
}) {
  const recent = entries.slice(0, 3);
  const blocks = toBlocks(recent);
  const gameIds = recent.flatMap((e) => (e.kind === 'game' ? [e.game.id] : []));

  const supabase = await getServerClient();
  const roundScores = await getRoundScoresForGames(supabase, userId, gameIds);
  const t = await getTranslations('home');
  const tModes = await getTranslations('modes');
  const tFinished = await getTranslations('finishedCard');

  // data-focus-inset: radene er full-bleed i et `p-0`-kort, så
  // `overflow-hidden` klipper en outline med positiv offset helt bort (#1402).
  const renderGamesBlock = (games: FinishedGame[]) => (
    <Card data-focus-inset className="p-0 overflow-hidden">
      <div className="divide-y divide-border">
        {games.map((g) => {
          const { strokes, courseHandicap } = roundScores.get(g.id) ?? {
            strokes: [],
            courseHandicap: null,
          };
          const { brutto, netto } = computeRoundScore(strokes, courseHandicap);
          const badge = g.result_summary
            ? finishedResultBadge(g.result_summary)
            : null;
          return (
            <GameHistoryRow
              key={g.id}
              href={`/games/${g.id}/leaderboard?from=/`}
              dateLabel={
                g.ended_at
                  ? formatShortDayMonthLocale(new Date(g.ended_at), locale)
                  : null
              }
              courseName={g.courses?.name ?? null}
              formatLabel={tModes(
                formatDisplayLabelKey(
                  g.game_mode,
                  g.mode_config,
                ) as Parameters<typeof tModes>[0],
              )}
              resultText={
                badge
                  ? tFinished(
                      badge.key as Parameters<typeof tFinished>[0],
                      badge.values as Parameters<typeof tFinished>[1],
                    )
                  : null
              }
              resultIsWin={badge?.isWin ?? false}
              brutto={brutto}
              nettoLabel={netto != null ? t('roundNetto', { netto }) : null}
            />
          );
        })}
      </div>
    </Card>
  );

  // No cup day among the recent 3 → exactly one games-block → render the bare
  // Card (byte-identical to before #1449). Otherwise stack the blocks.
  const body =
    blocks.length === 1 && blocks[0].kind === 'games' ? (
      renderGamesBlock(blocks[0].games)
    ) : (
      <div className="space-y-3">
        {blocks.map((block, i) =>
          block.kind === 'games' ? (
            <div key={`games-${i}`}>{renderGamesBlock(block.games)}</div>
          ) : (
            <FinishedCupDayCard key={block.entry.front9.id} entry={block.entry} />
          ),
        )}
      </div>
    );

  return (
    <>
      {body}
      {entries.length > 3 && (
        <SmartLink
          href="/spill-arkiv"
          className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Card className="min-h-[44px] flex items-center justify-between hover:bg-primary-soft transition-colors p-5">
            <span className="text-base font-medium text-text">
              {t('sectionFinishedShowAll')}
            </span>
            <span aria-hidden className="text-muted">
              →
            </span>
          </Card>
        </SmartLink>
      )}
    </>
  );
}
