// #2256: runde-lista i appen — spillerens ferdige runder, én rad per spill.
//
// Lista har ett hjem. Bag-taggen (#2256) regner sesongen fra den, og
// Rundedagboka (#2265) leser dagboka, formkurven og statistikken fra de samme
// rundene (denne fila og `data/roundHistory.ts`), i stedet for å skrive en ny
// spørring (AGENTS felle 4).
//
// **Året er enhetens lokaltid.** Webben dater runder med `effectiveYear`
// (Oslo-kalender via `osloParts`), men den veien er stengt her: Hermes mangler
// tidssonene (app-spike.md). Regelen er ellers den samme: planlagt utslag,
// ellers avslutning. For en spiller i Norge gir de to samme år. Ukesrekka
// (#2265) regnes på samme måte, med `localDateParts`.
//
// **Lagets ball er ingen sin egen runde.** Når laget deler én ball, står
// slagene på kapteinen, men de er lagets. Regelen bor i
// `lib/stats/ownRoundScores.ts`, som webbens historikk også bruker: slagene
// tømmes FØR brutto, hullene, puttene og differensialen regnes, så runden
// teller som runde, men gir ingen egne tall.
//
// Ren og I/O-fri (Type A). Mappingen fra snake_case bor i `data/roundHistory.ts`.
import { computeRoundScore } from '../../../../lib/games/roundScore';
import type { TeeBoxRatings } from '../../../../lib/games/teeRating';
import type { HoleSegment } from '../../../../lib/scoring/holeSegment';
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import {
  EMPTY_ACHIEVEMENTS,
  countRoundAchievements,
  parForGender,
  type Achievements,
  type HoleScore,
} from '../../../../lib/stats/achievements';
import { computeCourseStats, type CourseStat } from '../../../../lib/stats/courseStats';
import { isTeamBallRound, ownRoundScores } from '../../../../lib/stats/ownRoundScores';
import {
  COMPLETE_ROUND_HOLES,
  computePlayerStats,
  type MyStats,
} from '../../../../lib/stats/playerStats';
import { computePuttsStats, type PuttsStats } from '../../../../lib/stats/puttsStats';
import { computeDifferentials } from '../../../../lib/stats/roundDifferentials';
import { MAX_TREND_ROUNDS } from '../../../../lib/stats/scoringTrend';
import {
  computeSeasonStats,
  seasonGrossAverageExact,
  type SeasonRoundInput,
  type SeasonSummary,
} from '../../../../lib/stats/seasonStats';
import { computeStreak, type StreakSummary } from '../../../../lib/stats/streak';
import type { CourseHoleRow } from '../../../../lib/supabase/queryFragments';
import { HISTORY_TEXT } from './historyCopy';
import { localDateParts } from './homeDates';

/** Ett ferdig spill spilleren var med i, slik datalaget har lest det. */
export interface HistoryGameInput {
  gameId: string;
  name: string;
  scheduledTeeOffAt: string | null;
  endedAt: string | null;
  gameMode: GameMode;
  /** Hele runden, eller en av nierne (#1441). */
  holeSegment: HoleSegment;
  courseId: string | null;
  courseName: string | null;
  teeBoxId: string | null;
  /** Teen spilleren gikk fra; velger par per hull (`parForGender`). */
  teeGender: ScoringGender | null;
  /** Slagene spilleren fikk i spillet; netto = brutto − dette. */
  courseHandicap: number | null;
  /** Frosset WHS-differensial, eller `null` (da regnes den her, #941). */
  scoreDifferential: number | null;
  /** Spillerens lagrede utfall (`game_players.result_summary`). */
  resultSummary: ResultSummary | null;
}

/** Ett eget slag (`scores.strokes`, aldri null her — datalaget filtrerer). */
export interface HistoryScoreInput {
  gameId: string;
  holeNumber: number;
  strokes: number;
  putts: number | null;
}

/** Banene og tee-ene rundene ble spilt på: par per hull og slope/CR. */
export interface HistoryCourseData {
  holesByCourse: ReadonlyMap<string, ReadonlyMap<number, CourseHoleRow>>;
  teeById: ReadonlyMap<string, TeeBoxRatings>;
}

/** Én runde i lista. */
export interface HistoryRound {
  gameId: string;
  name: string;
  courseName: string | null;
  courseId: string | null;
  gameMode: GameMode;
  holeSegment: HoleSegment;
  /** Tidsstempelet runden dateres av (planlagt utslag, ellers avslutning). */
  date: string | null;
  /** Kalenderåret i enhetens lokaltid, `null` når runden ikke kan dateres. */
  year: number | null;
  /** Laget delte én ball: ingen egne slag, ingen brutto. */
  teamBall: boolean;
  /** Antall hull med eget slag (0 for en lagball-runde). */
  holeCount: number;
  /** Summen av egne slag, eller `null` uten slag. */
  brutto: number | null;
  /** Brutto minus slagene spilleren fikk, eller `null`. */
  netto: number | null;
  /** Brutto når alle 18 hull har eget slag, ellers `null`. */
  completeBrutto: number | null;
  /** Egne slag mot par for spillerens tee (bragdene). */
  holes: HoleScore[];
  /** Førte putter, ett tall per hull som har en (0 er et tall). */
  putts: number[];
  /** WHS-differensialen (frosset eller regnet), eller `null`. */
  differential: number | null;
  resultSummary: ResultSummary | null;
}

type DatedGame = Pick<HistoryGameInput, 'scheduledTeeOffAt' | 'endedAt'>;

function roundDate(game: DatedGame): Date | null {
  const iso = game.scheduledTeeOffAt ?? game.endedAt;
  if (iso == null) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Året runden hører til, i enhetens lokaltid. `null` = kan ikke dateres. */
export function localRoundYear(game: DatedGame): number | null {
  return roundDate(game)?.getFullYear() ?? null;
}

const NO_COURSES: HistoryCourseData = { holesByCourse: new Map(), teeById: new Map() };

/**
 * Spillene og de egne slagene → runde-lista, nyeste runde først og udaterte
 * sist (samme rekkefølge som webbens historikk). Uten banene får hullene par
 * 0 (ingen bragder), og bare frosne differensialer kommer med.
 */
export function buildHistoryRounds(
  games: readonly HistoryGameInput[],
  scores: readonly HistoryScoreInput[],
  courses: HistoryCourseData = NO_COURSES,
): HistoryRound[] {
  const scoresByGame = new Map<string, HistoryScoreInput[]>();
  for (const score of scores) {
    const list = scoresByGame.get(score.gameId) ?? [];
    list.push(score);
    scoresByGame.set(score.gameId, list);
  }

  const built = games.map((game) => {
    const date = roundDate(game);
    const own = ownRoundScores(game.gameMode, scoresByGame.get(game.gameId) ?? []);
    const { brutto, netto } = computeRoundScore(
      own.map((s) => s.strokes),
      game.courseHandicap,
    );
    const perHole = game.courseId ? courses.holesByCourse.get(game.courseId) : undefined;
    return {
      game,
      own,
      sortKey: date?.getTime() ?? 0,
      round: {
        gameId: game.gameId,
        name: game.name,
        courseName: game.courseName,
        courseId: game.courseId,
        gameMode: game.gameMode,
        holeSegment: game.holeSegment,
        date: date ? (game.scheduledTeeOffAt ?? game.endedAt) : null,
        year: date?.getFullYear() ?? null,
        teamBall: isTeamBallRound(game.gameMode),
        holeCount: own.length,
        brutto,
        netto,
        completeBrutto: own.length === COMPLETE_ROUND_HOLES ? brutto : null,
        holes: own.map((s) => {
          const row = perHole?.get(s.holeNumber);
          return {
            holeNumber: s.holeNumber,
            strokes: s.strokes,
            par: row ? parForGender(row, game.teeGender) : 0,
          };
        }),
        putts: own.map((s) => s.putts).filter((p): p is number => p != null),
        differential: null as number | null,
        resultSummary: game.resultSummary,
      } satisfies HistoryRound,
    };
  });

  // Differensialen er webbens (`computeDifferentials`): frosset verdi vinner,
  // ellers regnes den av de egne slagene mot banen. Lagball og runder uten 18
  // egne slag får ingen.
  const { byGame } = computeDifferentials(
    built.map(({ game, own }) => ({
      id: game.gameId,
      game_mode: game.gameMode,
      course_id: game.courseId,
      tee_box_id: game.teeBoxId,
      course_handicap: game.courseHandicap,
      score_differential: game.scoreDifferential,
      holeCount: own.length,
    })),
    {
      teeById: new Map(courses.teeById),
      genderByGame: new Map(games.map((game) => [game.gameId, game.teeGender])),
      holesByCourse: new Map(
        [...courses.holesByCourse].map(([id, holes]) => [id, new Map(holes)]),
      ),
      scoresByGame: new Map(
        built.map(({ game, own }) => [
          game.gameId,
          own.map((s) => ({ hole_number: s.holeNumber, strokes: s.strokes })),
        ]),
      ),
    },
  );

  return built
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ round }) => ({ ...round, differential: byGame.get(round.gameId) ?? null }));
}

/**
 * Formkurvens runder: brutto for hver hele 18-hullsrunde, eldst først. Kurven
 * viser de siste {@link MAX_TREND_ROUNDS}; setningen og «ny rekord» leser alle.
 */
export function formSeries(rounds: readonly HistoryRound[]): number[] {
  return rounds
    .map((round) => round.completeBrutto)
    .filter((brutto): brutto is number => brutto != null)
    .reverse();
}

/** Alt Rundedagboka og statistikken viser utover selve radene. */
export interface HistoryStats {
  /** Årene med runder, nyeste først (`computeSeasonStats`, som bag-taggen). */
  seasons: SeasonSummary[];
  /** Siste sesong med runder: undertittelen og tallene i formkortet. */
  season: SeasonSummary | null;
  /** Snittet i siste sesong uten avrunding (formkortets «86,6»). */
  seasonAverage: number | null;
  myStats: MyStats;
  putts: PuttsStats;
  courses: CourseStat[];
  lifetimeAchievements: Achievements;
  streak: StreakSummary;
  /** Handicap-formen: de siste 20 differensialene, eldst først. */
  differentials: number[];
}

export function historyStats(rounds: readonly HistoryRound[], now: Date): HistoryStats {
  const seasonRounds: SeasonRoundInput[] = rounds.map((round) => ({
    year: round.year,
    completeBrutto: round.completeBrutto,
    achievements: countRoundAchievements(round.holes),
  }));
  const seasons = computeSeasonStats(seasonRounds);
  const season = seasons[0] ?? null;

  const lifetimeAchievements = seasonRounds.reduce<Achievements>(
    (acc, r) => ({
      holeInOne: acc.holeInOne + r.achievements.holeInOne,
      eagle: acc.eagle + r.achievements.eagle,
      birdie: acc.birdie + r.achievements.birdie,
      turkey: acc.turkey + r.achievements.turkey,
      snowman: acc.snowman + r.achievements.snowman,
    }),
    { ...EMPTY_ACHIEVEMENTS },
  );

  const dates = rounds
    .map((round) => (round.date ? new Date(round.date) : null))
    .filter((date): date is Date => date != null);

  return {
    seasons,
    season,
    seasonAverage: season ? seasonGrossAverageExact(seasonRounds, season.year) : null,
    myStats: computePlayerStats(rounds.map((round) => ({ holes: round.holes }))),
    putts: computePuttsStats(
      rounds.map((round) => ({ recordedPutts: round.putts, playedHoles: round.holeCount })),
    ),
    courses: computeCourseStats(
      rounds.map((round) => ({
        courseId: round.courseId,
        courseName: round.courseName ?? HISTORY_TEXT.unknownCourse,
        completeBrutto: round.completeBrutto,
      })),
    ),
    lifetimeAchievements,
    streak: computeStreak({ dates, now, dateParts: localDateParts }),
    differentials: rounds
      .filter((round) => round.holeCount === COMPLETE_ROUND_HOLES && round.differential != null)
      .slice(0, MAX_TREND_ROUNDS)
      .map((round) => round.differential as number)
      .reverse(),
  };
}
