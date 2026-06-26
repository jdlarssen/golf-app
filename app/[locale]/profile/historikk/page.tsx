import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { formatShortDayMonthLocale } from '@/lib/i18n/format';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { finishedResultBadge } from '@/lib/games/finishedResultBadge';
import { GameHistoryRow } from '@/components/stats/GameHistoryRow';
import {
  buildScoringTrend,
  summarizeTrendRounds,
  type TrendRound,
} from '@/lib/stats/scoringTrend';
import { ScoringTrendChart } from '@/components/stats/ScoringTrendChart';
import { CoursePerformancePanel } from '@/components/stats/CoursePerformancePanel';
import { HistorikkTabs } from '@/components/stats/HistorikkTabs';
import {
  computeCourseStats,
  type CourseRoundInput,
} from '@/lib/stats/courseStats';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { AppLocale } from '@/i18n/routing';

/** En komplett 18-hulls-runde (alle 18 hull registrert). */
const COMPLETE_ROUND_HOLES = 18;

/** Formkurve-vinduet: de siste N rundene, som WHS/Golfbox (#949). */
const MAX_TREND_ROUNDS = 20;

type GameRow = {
  id: string;
  name: string;
  scheduled_tee_off_at: string | null;
  ended_at: string | null;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  // #940 — grupperingsnøkkel for per-bane-statistikk (banenavn kan kollidere).
  course_id: string | null;
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn.
  courses: { name: string } | null;
};

type ScoreRow = {
  game_id: string;
  strokes: number | null;
};

/** Et avsluttet spill beriket med spillerens egne tall (#866). */
type GameWithMeta = GameRow & {
  /** Strokes received — netto = brutto − dette (#866). */
  course_handicap: number | null;
  /** Format-riktig utfall (#572) → resultat-badge. */
  result_summary: ResultSummary | null;
};

type GameWithStats = GameWithMeta & {
  bruttoSum: number | null;
  nettoSum: number | null;
  holeCount: number;
};

export default async function HistorikkPage() {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('profile.historikk');
  const tModes = await getTranslations('modes');
  const tFinished = await getTranslations('finishedCard');
  const userIdRaw = await getProxyVerifiedUserId();
  if (!userIdRaw) redirect({ href: '/login', locale });
  const userId = userIdRaw as string; // guarded non-null above (redirect isn't typed `never`)

  const supabase = await getServerClient();

  // Round-trip 1: all finished games the user participated in, with the
  // player's own strokes-received (`course_handicap`) and stored per-mode
  // outcome (`result_summary`, #572) for netto + result badge.
  // No SQL `.order()` here: supabase-js foreignTable-order is a no-op on a
  // to-one `games!inner` embed (#569) — the JS sort below is authoritative.
  const { data: gamePlayers, error: gpError } = await supabase
    .from('game_players')
    .select(
      'game_id, course_handicap, result_summary, games!inner(id, name, scheduled_tee_off_at, ended_at, game_mode, mode_config, course_id, courses(name))',
    )
    .eq('user_id', userId)
    .eq('games.status', 'finished');

  if (gpError) throw gpError;

  const rows = (gamePlayers ?? []) as unknown as Array<{
    game_id: string;
    course_handicap: number | null;
    result_summary: ResultSummary | null;
    games: GameRow;
  }>;

  const gameIds = rows.map((r) => r.game_id);

  // Round-trip 2: fetch all user scores for those games in one IN query.
  const scoresByGame: Map<string, ScoreRow[]> = new Map();
  if (gameIds.length > 0) {
    const { data: scores, error: scoresError } = await supabase
      .from('scores')
      .select('game_id, strokes')
      .eq('user_id', userId) // userId is string — narrowed after redirect guard above
      .in('game_id', gameIds)
      .not('strokes', 'is', null);

    if (scoresError) throw scoresError;

    for (const score of scores ?? []) {
      const existing = scoresByGame.get(score.game_id) ?? [];
      existing.push(score as ScoreRow);
      scoresByGame.set(score.game_id, existing);
    }
  }

  // Carry course_handicap + result_summary onto the game, then sort by tee-off
  // date descending (newest first).
  const sortedGames: GameWithMeta[] = rows
    .map((r) => ({
      ...r.games,
      course_handicap: r.course_handicap,
      result_summary: r.result_summary,
    }))
    .sort((a, b) => {
      const aTime = a.scheduled_tee_off_at
        ? new Date(a.scheduled_tee_off_at).getTime()
        : a.ended_at
          ? new Date(a.ended_at).getTime()
          : 0;
      const bTime = b.scheduled_tee_off_at
        ? new Date(b.scheduled_tee_off_at).getTime()
        : b.ended_at
          ? new Date(b.ended_at).getTime()
          : 0;
      return bTime - aTime;
    });

  // Compute brutto + netto per game.
  const gamesWithStats: GameWithStats[] = sortedGames.map((game) => {
    const gameScores = scoresByGame.get(game.id) ?? [];
    const holeCount = gameScores.length;
    const bruttoSum =
      holeCount > 0
        ? gameScores.reduce((acc, s) => acc + (s.strokes ?? 0), 0)
        : null;
    const nettoSum =
      bruttoSum != null && game.course_handicap != null
        ? bruttoSum - game.course_handicap
        : null;
    return { ...game, bruttoSum, nettoSum, holeCount };
  });

  const finishedCount = gamesWithStats.length;

  // #936/#949 — formkurve: kun komplette 18-hulls-runder (eple-mot-eple, samme
  // disiplin som «Mine tall»/`playerStats`), avgrenset til de SISTE 20 (WHS/
  // Golfbox-vinduet) og sortert eldst→nyest. `gamesWithStats` er nyest-først,
  // så vi tar de første 20 og reverserer.
  const trendWindow = gamesWithStats
    .filter((g) => g.holeCount === COMPLETE_ROUND_HOLES && g.bruttoSum != null)
    .slice(0, MAX_TREND_ROUNDS)
    .reverse();
  const trendRounds: TrendRound[] = trendWindow.map((g) => ({
    brutto: g.bruttoSum as number,
    netto: g.nettoSum,
  }));
  const trend = buildScoringTrend(trendRounds);
  const trendSummary = trend ? summarizeTrendRounds(trendRounds) : null;
  const trendDateRange = trend ? formatTrendDateRange(trendWindow, locale) : '';

  // #940 — per-bane-rollup: samme komplett-18-disiplin som formkurven/«Mine tall».
  // 9-hulls/ufullstendige runder gir `completeBrutto = null` og teller ikke.
  const unknownCourseName = t('unknownCourse');
  const courseRounds: CourseRoundInput[] = gamesWithStats.map((g) => ({
    courseId: g.course_id,
    courseName: g.courses?.name ?? unknownCourseName,
    completeBrutto:
      g.holeCount === COMPLETE_ROUND_HOLES && g.bruttoSum != null
        ? g.bruttoSum
        : null,
  }));
  const courseStats = computeCourseStats(courseRounds);

  // «Statistikk»-fanen (default): formkurve (når ≥2 komplette runder) + per-bane.
  const statsContent = (
    <div className="space-y-4">
      {trend && trendSummary && (
        <Card>
          <ScoringTrendChart
            geometry={trend}
            summary={trendSummary}
            ariaLabel={t('trendAriaLabel', { count: trendRounds.length })}
            heading={t('trendHeading')}
            windowLabel={t('trendWindow', { count: trendRounds.length })}
            dateRangeLabel={trendDateRange}
            bruttoLabel={t('colBrutto')}
            nettoLabel={t('colNetto')}
            startLabel={t('trendStart')}
            nowLabel={t('trendNow')}
            bestLabel={t('trendBest')}
          />
        </Card>
      )}
      <CoursePerformancePanel
        courses={courseStats}
        heading={t('coursesHeading')}
        subtitle={t('coursesSubtitle')}
        colRounds={t('coursesColRounds')}
        colAvg={t('coursesColAvg')}
        colBest={t('coursesColBest')}
        emptyLabel={t('coursesEmpty')}
      />
    </div>
  );

  // «Runder»-fanen (#962): kronologisk per-runde-liste som tette, trykkbare
  // rader i ett Card (samme delte-rad-mønster som «Baner»-panelet) — ikke
  // lenger frittstående kort med egen fot-lenke.
  const roundsContent = (
    <Card className="p-0 overflow-hidden">
      <div className="divide-y divide-border">
        {gamesWithStats.map((game) => {
          const formatLabel = tModes(
            formatDisplayLabelKey(
              game.game_mode,
              game.mode_config,
            ) as Parameters<typeof tModes>[0],
          );
          const badge = game.result_summary
            ? finishedResultBadge(game.result_summary)
            : null;
          const resultText = badge
            ? tFinished(
                badge.key as Parameters<typeof tFinished>[0],
                badge.values as Parameters<typeof tFinished>[1],
              )
            : null;
          const dateObj = effectiveDate(game);
          return (
            <GameHistoryRow
              key={game.id}
              href={`/games/${game.id}/leaderboard?from=/profile/historikk`}
              dateLabel={dateObj ? formatShortDayMonthLocale(dateObj, locale) : null}
              courseName={game.courses?.name ?? null}
              formatLabel={formatLabel}
              resultText={resultText}
              resultIsWin={badge?.isWin ?? false}
              brutto={game.bruttoSum}
              nettoLabel={
                game.nettoSum != null
                  ? t('roundNetto', { netto: game.nettoSum })
                  : null
              }
            />
          );
        })}
      </div>
    </Card>
  );

  return (
    <AppShell>
      <TopBar
        backHref="/profile"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
      />

      {finishedCount > 0 && (
        <p className="mb-4 text-sm text-muted">{t('roundCount', { count: finishedCount })}</p>
      )}

      {finishedCount === 0 ? (
        <Card>
          <p className="font-sans text-sm text-muted leading-relaxed">
            {t('emptyState')}
          </p>
        </Card>
      ) : (
        <HistorikkTabs statsContent={statsContent} roundsContent={roundsContent} />
      )}
    </AppShell>
  );
}

/** Effektiv runde-dato (samme fallback som lista/sorteringen). */
function effectiveDate(g: GameWithStats): Date | null {
  const iso = g.scheduled_tee_off_at ?? g.ended_at;
  return iso ? new Date(iso) : null;
}

/**
 * Dato-spennet i formkurve-headeren («5. jan – 24. jun»). `windowGames` er
 * eldst→nyest, så første og siste gir spennet. Faller til ett dato-tall når
 * de er like, og til tom streng om datoene mangler.
 */
function formatTrendDateRange(
  windowGames: GameWithStats[],
  locale: AppLocale,
): string {
  const first = windowGames[0] ? effectiveDate(windowGames[0]) : null;
  const last = windowGames.length
    ? effectiveDate(windowGames[windowGames.length - 1])
    : null;
  if (!first || !last) return '';
  const from = formatShortDayMonthLocale(first, locale);
  const to = formatShortDayMonthLocale(last, locale);
  return from === to ? from : `${from} – ${to}`;
}
