import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getServerClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { GameHistoryRow } from '@/components/stats/GameHistoryRow';
import { formatShortDayMonthLocale } from '@/lib/i18n/format';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { finishedResultBadge } from '@/lib/games/finishedResultBadge';
import { computeRoundScore } from '@/lib/games/roundScore';
import { getRoundScoresForGames } from '@/lib/games/getRoundScoresForGames';
import type { FinishedGame } from '@/lib/games/getFinishedGamesForUser';

/**
 * Hjem-seksjonen «Avsluttede spill» (#986): de 3 nyeste avsluttede spillene som
 * tette «Runder»-rader med brutto (hero) + netto — samme rad-mønster som
 * Profil → Historikk, via den delte `computeRoundScore`-helperen så tallene
 * ikke driver fra hverandre. Henter spillerens scorer + course_handicap for KUN
 * de 3 viste (`getFinishedGamesForUser` henter dem ikke). «Se alle» →
 * /spill-arkiv når det finnes flere enn 3.
 *
 * Ren server-trygg modul (ingen 'use client'); i18n via next-intl-server på
 * kallstedet (`GameHistoryRow` er rent presentasjonelt).
 */
export async function FinishedRoundsSection({
  finishedGames,
  userId,
  locale,
}: {
  finishedGames: FinishedGame[];
  userId: string;
  locale: AppLocale;
}) {
  const recent = finishedGames.slice(0, 3);
  const supabase = await getServerClient();
  const roundScores = await getRoundScoresForGames(
    supabase,
    userId,
    recent.map((g) => g.id),
  );
  const t = await getTranslations('home');
  const tModes = await getTranslations('modes');
  const tFinished = await getTranslations('finishedCard');

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <div className="divide-y divide-border">
          {recent.map((g) => {
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
      {finishedGames.length > 3 && (
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
