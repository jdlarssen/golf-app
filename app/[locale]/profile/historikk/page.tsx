import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { formatShortDayMonthLocale, formatNumber } from '@/lib/i18n/format';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { finishedResultBadge } from '@/lib/games/finishedResultBadge';
import { computeRoundScore } from '@/lib/games/roundScore';
import { GameHistoryRow } from '@/components/stats/GameHistoryRow';
import {
  buildScoringTrend,
  summarizeTrendRounds,
  type TrendRound,
  type TrendSummary,
} from '@/lib/stats/scoringTrend';
import { ScoringTrendChart } from '@/components/stats/ScoringTrendChart';
import { CoursePerformancePanel } from '@/components/stats/CoursePerformancePanel';
import { HistorikkTabs } from '@/components/stats/HistorikkTabs';
import {
  computeCourseStats,
  type CourseRoundInput,
} from '@/lib/stats/courseStats';
import { SeasonRecapPanel } from '@/components/stats/SeasonRecapPanel';
import { AchievementWall } from '@/components/stats/AchievementWall';
import { StreakPanel } from '@/components/stats/StreakPanel';
import {
  computeSeasonStats,
  type SeasonRoundInput,
} from '@/lib/stats/seasonStats';
import { computeStreak } from '@/lib/stats/streak';
import { PuttsStatPanel } from '@/components/stats/PuttsStatPanel';
import {
  computePuttsStats,
  type PuttsRoundInput,
} from '@/lib/stats/puttsStats';
import {
  countRoundAchievements,
  parForGender,
  EMPTY_ACHIEVEMENTS,
  type Achievements,
  type HoleScore,
} from '@/lib/stats/achievements';
import {
  COURSE_HOLES_SELECT,
  type CourseHoleRow,
} from '@/lib/supabase/queryFragments';
import { osloParts } from '@/lib/format/teeOff';
import { computeScoreDifferential } from '@/lib/scoring/scoreDifferential';
import { getRatingForGender, type TeeBoxRatings } from '@/lib/games/teeRating';
import { getAdminClient } from '@/lib/supabase/admin';
import { after } from 'next/server';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import type {
  GameMode,
  GameModeConfig,
  ScoringGender,
} from '@/lib/scoring/modes/types';
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
  // #941 — tee for slope/CR-oppslag (live differensial-fallback).
  tee_box_id: string | null;
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn.
  courses: { name: string } | null;
};

type ScoreRow = {
  game_id: string;
  hole_number: number;
  strokes: number | null;
  putts: number | null;
};

/** Et avsluttet spill beriket med spillerens egne tall (#866). */
type GameWithMeta = GameRow & {
  /** Strokes received — netto = brutto − dette (#866). */
  course_handicap: number | null;
  /** Format-riktig utfall (#572) → resultat-badge. */
  result_summary: ResultSummary | null;
  /** #941 — frosset WHS-differensial (null = ikke frosset ennå → live-beregnes). */
  score_differential: number | null;
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
      'game_id, tee_gender, course_handicap, result_summary, score_differential, games!inner(id, name, scheduled_tee_off_at, ended_at, game_mode, mode_config, course_id, tee_box_id, courses(name))',
    )
    .eq('user_id', userId)
    .eq('games.status', 'finished');

  if (gpError) throw gpError;

  const rows = (gamePlayers ?? []) as unknown as Array<{
    game_id: string;
    tee_gender: ScoringGender | null;
    course_handicap: number | null;
    result_summary: ResultSummary | null;
    score_differential: number | null;
    games: GameRow;
  }>;

  const gameIds = rows.map((r) => r.game_id);
  // #946 — course ids for the per-gender par lookup (achievements need par).
  const courseIds = [
    ...new Set(
      rows
        .map((r) => r.games?.course_id)
        .filter((c): c is string => c != null),
    ),
  ];
  // #941 — tee ids for slope/CR (live differensial-fallback for ufryste runder).
  const teeBoxIds = [
    ...new Set(
      rows
        .map((r) => r.games?.tee_box_id)
        .filter((tb): tb is string => tb != null),
    ),
  ];
  // #946 — player's tee-gender per game, for choosing par_mens/_ladies/_juniors.
  const genderByGame = new Map<string, ScoringGender | null>(
    rows.map((r) => [r.game_id, r.tee_gender]),
  );

  // Round-trips 2+3: own scores (now incl. hole_number, #946) + per-gender par
  // for the involved courses — parallel, they don't depend on each other.
  const scoresByGame: Map<string, ScoreRow[]> = new Map();
  const holesByCourse = new Map<string, Map<number, CourseHoleRow>>();
  // #941 — tee_box_id → kjønns-ratinger, for live differensial-beregning.
  const teeById = new Map<string, TeeBoxRatings>();
  if (gameIds.length > 0) {
    const [scoresRes, holesRes, teeRes] = await Promise.all([
      supabase
        .from('scores')
        .select('game_id, hole_number, strokes, putts')
        .eq('user_id', userId) // userId is string — narrowed after redirect guard above
        .in('game_id', gameIds)
        .not('strokes', 'is', null),
      supabase
        .from('course_holes')
        .select(`course_id, ${COURSE_HOLES_SELECT}`)
        .in('course_id', courseIds),
      supabase
        .from('tee_boxes')
        .select(
          'id, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors',
        )
        .in('id', teeBoxIds),
    ]);

    if (scoresRes.error) throw scoresRes.error;
    if (holesRes.error) throw holesRes.error;
    if (teeRes.error) throw teeRes.error;

    for (const tee of teeRes.data ?? []) {
      const { id, ...ratings } = tee;
      teeById.set(id, ratings as TeeBoxRatings);
    }

    for (const score of scoresRes.data ?? []) {
      const existing = scoresByGame.get(score.game_id) ?? [];
      existing.push(score as ScoreRow);
      scoresByGame.set(score.game_id, existing);
    }

    for (const h of (holesRes.data ?? []) as Array<
      CourseHoleRow & { course_id: string }
    >) {
      let perHole = holesByCourse.get(h.course_id);
      if (!perHole) {
        perHole = new Map();
        holesByCourse.set(h.course_id, perHole);
      }
      perHole.set(h.hole_number, h);
    }
  }

  // Carry course_handicap + result_summary onto the game, then sort by tee-off
  // date descending (newest first).
  const sortedGames: GameWithMeta[] = rows
    .map((r) => ({
      ...r.games,
      course_handicap: r.course_handicap,
      result_summary: r.result_summary,
      score_differential: r.score_differential,
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
    const { brutto: bruttoSum, netto: nettoSum } = computeRoundScore(
      gameScores.map((s) => s.strokes),
      game.course_handicap,
    );
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

  // #941 — handicap-form: WHS score-differensial-trend (frosset-eller-live, siste
  // 20 komplette runder). Hele seksjonen bygges i én helper for å holde page-en
  // lesbar; live-beregnede egne runder lazy-fryses etterpå (best-effort).
  const diff = buildDifferentialSection(
    gamesWithStats,
    { teeById, genderByGame, holesByCourse, scoresByGame },
    locale,
  );
  scheduleDifferentialFreeze(userId, diff.toFreeze);

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

  // #939 — putte-snitt: snitt putter per komplett 18-hulls-runde (samme
  // komplett-18-disiplin som formkurven/per-bane). Kun hull med en putt-verdi
  // teller; en runde kvalifiserer når alle 18 hull har putter ført.
  const puttsRounds: PuttsRoundInput[] = gamesWithStats.map((game) => ({
    recordedPutts: (scoresByGame.get(game.id) ?? [])
      .map((s) => s.putts)
      .filter((p): p is number => p != null),
  }));
  const puttsStats = computePuttsStats(puttsRounds);
  const puttsAvgDisplay =
    puttsStats.avgPuttsPerRound != null
      ? formatNumber(puttsStats.avgPuttsPerRound, locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
      : '';

  // #946 — sesong-recap: bøtt ferdige runder på Oslo-kalenderår. Bragder regnes
  // per runde fra rå scorer mot kjønns-par (uavhengig av modus/sideturnering);
  // snitt/beste følger samme komplett-18-disiplin som resten av huben.
  const seasonRounds: SeasonRoundInput[] = gamesWithStats.map((game) => {
    const date = effectiveDate(game);
    const courseHoles = game.course_id
      ? holesByCourse.get(game.course_id)
      : undefined;
    const gender = genderByGame.get(game.id) ?? null;
    const holes: HoleScore[] = (scoresByGame.get(game.id) ?? []).map((s) => {
      const holeRow = courseHoles?.get(s.hole_number);
      return {
        holeNumber: s.hole_number,
        strokes: s.strokes,
        par: holeRow ? parForGender(holeRow, gender) : 0,
      };
    });
    return {
      year: date ? osloParts(date).year : null,
      completeBrutto:
        game.holeCount === COMPLETE_ROUND_HOLES && game.bruttoSum != null
          ? game.bruttoSum
          : null,
      achievements: countRoundAchievements(holes),
    };
  });
  const seasonStats = computeSeasonStats(seasonRounds);

  // #1194 — streak/konsistens: avled ukentlig streak + sesong-teller fra de SAMME
  // ferdige runde-datoene (effectiveDate) sesong-recap-en bruker — ingen nytt
  // DB-kall her. Positiv ramme: et brudd gir bare `weeklyStreakActive === false`.
  const now = new Date();
  const streak = computeStreak({
    dates: gamesWithStats
      .map(effectiveDate)
      .filter((date): date is Date => date != null),
    now,
  });

  // #947 — livstids-bragder for badge-veggen: summer per-runde-tellingene vi
  // allerede regnet for sesong-recap-en, så veggen koster ingen ekstra DB-runde.
  const lifetimeAchievements: Achievements = seasonRounds.reduce<Achievements>(
    (acc, r) => ({
      holeInOne: acc.holeInOne + r.achievements.holeInOne,
      eagle: acc.eagle + r.achievements.eagle,
      birdie: acc.birdie + r.achievements.birdie,
      turkey: acc.turkey + r.achievements.turkey,
      snowman: acc.snowman + r.achievements.snowman,
    }),
    { ...EMPTY_ACHIEVEMENTS },
  );

  // «Statistikk»-fanen (default), komponert etter trajektorie → periode →
  // nedbrytning: formkurve (når ≥2 komplette runder) → sesong-recap → per-bane.
  // Faller formkurven bort (<2 komplette runder), leder sesong-recap-en naturlig.
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
      {diff.trend && diff.summary && (
        <Card>
          <ScoringTrendChart
            geometry={diff.trend}
            summary={diff.summary}
            ariaLabel={t('diffAriaLabel', { count: diff.count })}
            heading={t('diffHeading')}
            windowLabel={t('diffWindow', { count: diff.count })}
            dateRangeLabel={diff.dateRange}
            bruttoLabel={t('diffSeriesLabel')}
            nettoLabel={t('diffSeriesLabel')}
            startLabel={t('trendStart')}
            nowLabel={t('trendNow')}
            bestLabel={t('trendBest')}
            formatValue={(v) =>
              formatNumber(v, locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })
            }
          />
        </Card>
      )}
      <SeasonRecapPanel seasons={seasonStats} />
      <StreakPanel
        summary={streak}
        heading={t('streakHeading')}
        subtitle={t('streakSubtitle')}
        weeksLabel={t('streakWeeksLabel')}
        dormantLine={t('streakDormant')}
        seasonText={t('streakSeason', {
          count: streak.roundsThisSeason,
          year: String(osloParts(now).year),
        })}
      />
      <AchievementWall
        achievements={lifetimeAchievements}
        heading={t('achievementsHeading')}
        subtitle={t('achievementsSubtitle')}
        labels={{
          holeInOne: t('achievementsBadge_holeInOne'),
          eagle: t('achievementsBadge_eagle'),
          birdie: t('achievementsBadge_birdie'),
          turkey: t('achievementsBadge_turkey'),
        }}
      />
      <PuttsStatPanel
        stats={puttsStats}
        heading={t('puttsHeading')}
        subtitle={t('puttsSubtitle')}
        avgDisplay={puttsAvgDisplay}
        avgLabel={t('puttsColAvg')}
        bestLabel={t('puttsColBest')}
        roundsLabel={t('puttsColRounds')}
        emptyLabel={t('puttsEmpty')}
      />
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
 * #941 — lazy-freeze: skriv live-beregnede differensialer for spillerens egne
 * runder som ennå er NULL, etter at responsen er sendt (`after`). Service-rolle-
 * klienten passerer guard_game_players_score_differential; `.is(..., null)` gjør
 * skrivet idempotent (gjentatte visninger no-op-er). Best-effort — feil logges,
 * aldri kastet, så render-stien er upåvirket.
 */
function scheduleDifferentialFreeze(
  userId: string,
  toFreeze: { gameId: string; differential: number }[],
): void {
  if (toFreeze.length === 0) return;
  after(async () => {
    try {
      const admin = getAdminClient();
      await Promise.allSettled(
        toFreeze.map(({ gameId, differential }) =>
          admin
            .from('game_players')
            .update({ score_differential: differential })
            .eq('game_id', gameId)
            .eq('user_id', userId)
            .is('score_differential', null)
            .then(({ error }) => {
              if (error) throw error;
            }),
        ),
      );
    } catch (err) {
      console.error('[historikk] lazy-freeze score_differential failed', err);
    }
  });
}

type DifferentialDeps = {
  teeById: Map<string, TeeBoxRatings>;
  genderByGame: Map<string, ScoringGender | null>;
  holesByCourse: Map<string, Map<number, CourseHoleRow>>;
  scoresByGame: Map<string, ScoreRow[]>;
};

/**
 * #941 — WHS score-differensial per komplett 18-hulls-runde. Frosset verdi
 * (`game_players.score_differential`) vinner; ellers beregnes den live fra rå
 * runde-data (samme `computeScoreDifferential` som fryse-helperen — formelen bor
 * ett sted). Runder uten 18 hull, slope/CR eller banehandicap hoppes over.
 * `toFreeze` lister live-beregnede runder som bør lazy-fryses.
 */
function computeDifferentials(
  games: GameWithStats[],
  deps: DifferentialDeps,
): {
  byGame: Map<string, number>;
  toFreeze: { gameId: string; differential: number }[];
} {
  const byGame = new Map<string, number>();
  const toFreeze: { gameId: string; differential: number }[] = [];
  for (const game of games) {
    if (game.holeCount !== COMPLETE_ROUND_HOLES) continue;
    if (game.score_differential != null) {
      byGame.set(game.id, game.score_differential);
      continue;
    }
    const tee =
      game.tee_box_id != null ? deps.teeById.get(game.tee_box_id) : undefined;
    const gender = deps.genderByGame.get(game.id) ?? null;
    const rating = tee ? getRatingForGender(tee, gender ?? 'mens') : null;
    if (!rating) continue;
    const perHole = game.course_id
      ? deps.holesByCourse.get(game.course_id)
      : undefined;
    const scoreByHole = new Map(
      (deps.scoresByGame.get(game.id) ?? []).map((s) => [
        s.hole_number,
        s.strokes,
      ]),
    );
    const holes = Array.from({ length: COMPLETE_ROUND_HOLES }, (_, i) => {
      const holeRow = perHole?.get(i + 1);
      if (!holeRow) return null;
      return {
        strokes: scoreByHole.get(i + 1) ?? null,
        par: parForGender(holeRow, gender),
        strokeIndex: holeRow.stroke_index,
      };
    });
    if (holes.some((h) => h === null)) continue;
    const differential = computeScoreDifferential({
      holes: holes as {
        strokes: number | null;
        par: number;
        strokeIndex: number;
      }[],
      courseHandicap: game.course_handicap,
      slope: rating.slope,
      courseRating: rating.courseRating,
    });
    if (differential == null) continue;
    byGame.set(game.id, differential);
    toFreeze.push({ gameId: game.id, differential });
  }
  return { byGame, toFreeze };
}

/**
 * #941 — bygg handicap-form-seksjonen: differensial per runde (frosset-eller-live),
 * så de SISTE 20 komplette rundene MED differensial, eldst→nyest (samme vindu som
 * formkurven). Differensialen ligger i `brutto`-kanalen, ingen netto-serie.
 * Returnerer chart-geometrien (null < 2 runder), antall, dato-spenn og lista over
 * egne runder som bør lazy-fryses.
 */
function buildDifferentialSection(
  games: GameWithStats[],
  deps: DifferentialDeps,
  locale: AppLocale,
): {
  trend: ReturnType<typeof buildScoringTrend>;
  summary: TrendSummary | null;
  dateRange: string;
  count: number;
  toFreeze: { gameId: string; differential: number }[];
} {
  const { byGame, toFreeze } = computeDifferentials(games, deps);
  const window = games
    .filter((g) => g.holeCount === COMPLETE_ROUND_HOLES && byGame.has(g.id))
    .slice(0, MAX_TREND_ROUNDS)
    .reverse();
  const rounds: TrendRound[] = window.map((g) => ({
    brutto: byGame.get(g.id) as number,
    netto: null,
  }));
  const trend = buildScoringTrend(rounds);
  return {
    trend,
    summary: trend ? summarizeTrendRounds(rounds) : null,
    dateRange: trend ? formatTrendDateRange(window, locale) : '',
    count: rounds.length,
    toFreeze,
  };
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
