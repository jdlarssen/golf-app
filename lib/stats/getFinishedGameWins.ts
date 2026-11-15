import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { osloYearWindow } from '@/lib/format/osloCalendar';
import { osloParts } from '@/lib/format/teeOff';
import { chunks } from '@/lib/stats/chunks';
import { BOARD_USER_COLUMNS, leftOffTheBoards, type BoardUser } from '@/lib/stats/boardPlayers';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import {
  computeResultSummaries,
  type ResultSummary,
} from '@/lib/scoring/resultSummary';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import {
  aggregateFinishedGame,
  isWinningSummary,
  tallyClubStats,
  type FinishedGameForTally,
} from '@/lib/stats/clubStats';

type GameRow = {
  id: string;
  /** `null` for a game without a course (a free round); it has no holes to recompute from. */
  course_id: string | null;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  /** #2217: a cup match on 9 holes is scored over its own holes only. */
  hole_segment: HoleSegment;
  /** #2217: a derived single owns no scores — they live on the host game. */
  source_game_id: string | null;
  /** #2712: a league flight; it counts as played, not won. */
  league_round_id: string | null;
};

type GamePlayerRow = {
  game_id: string;
  user_id: string;
  withdrawn_at: string | null;
  result_summary: ResultSummary | null;
  users: (BoardUser & {
    name: string | null;
    nickname: string | null;
  }) | null;
};

/**
 * Locale-agnostic aggregate the cache layer stores. Plain serializable arrays
 * (not `Map`s) because `unstable_cache` JSON-serializes its return value. The
 * locale-dependent `unknownPlayer` fallback and `nameInitials` formatting are
 * deliberately NOT baked in here — they're applied per-request at render time
 * so the same cached blob serves both `no` and `en`.
 */
export type ClubStatsAggregate = {
  /** True when at least one finished game exists. Drives the empty-state
   *  branch identically to the old `games.length === 0` check — note this is
   *  about games existing, not about anyone having a stat (a finished game
   *  with only corrupt/zero-player data still leaves this `true`, so the page
   *  renders with "Ingen data ennå." sections rather than the empty state). */
  hasGames: boolean;
  /** `[userId, winCount]` for every player with ≥1 mode-correct win. */
  winnerCounts: Array<[string, number]>;
  /** `[userId, gameCount]` for every player in ≥1 finished game. */
  participationCounts: Array<[string, number]>;
  /** `[userId, name]` — first non-null name seen for each player. */
  userNames: Array<[string, string]>;
  /** `[userId, nickname]` — first non-null nickname seen, for `formatPublicName`'s fallback. */
  userNicknames: Array<[string, string]>;
};

/**
 * Aggregate club-wide stats from every finished game.
 *
 * The winner of each game is read from the stored, mode-correct
 * `game_players.result_summary` (#572) — NOT recomputed as netto best-ball
 * (the #887 fix). Reading the stored outcome is cheap (no per-game
 * `computeLeaderboard`, no holes/scores fetch on the happy path) and correct
 * for every mode (matchplay/stableford/skins/…). Only games with NO stored
 * summary at all (finished before #572, or a failed best-effort persist) fall
 * back to `buildModeResultForGame`, which re-derives the same `ModeResult` the
 * summaries were built from. Withdrawn players (`withdrawn_at`) are excluded
 * from both the winner and the participation tally, matching every other
 * surface; the fallback engine already drops them too.
 *
 * ## Why the admin client
 *
 * `unstable_cache` callbacks cannot read request-scoped APIs (`cookies()`,
 * `headers()`), so the cookie-based `getServerClient()` can't be used inside
 * the cache. We use the service-role `getAdminClient()` (same pattern as
 * `lib/games/getGameWithPlayers.ts`). A finished game is NOT world-readable
 * (#1542): RLS shows it to its players only, so this read goes past RLS. The
 * caller is the gate and stays outside the cache — `authenticatedUserId` in
 * `/api/aeresbrett`, the club-membership check in `getClubDetail`. Only counts
 * and display names leave the callers, never games, dates or strokes.
 *
 * ## Why a time-based revalidate (and no tag invalidation)
 *
 * The natural invalidation trigger is "a game was finished", but wiring
 * `revalidateTag` into the game-finishing server-actions lives outside this
 * file's scope. Instead we self-heal with a 5-minute `revalidate`: a freshly
 * finished game shows up in these stats within ~5 minutes of a cache miss.
 * That staleness window is fine for a leaderboard of lifetime wins/activity —
 * it's not a live scoreboard. The `club-statistikk` tag is declared so a
 * future cross-file `revalidateTag('club-statistikk')` can invalidate on
 * demand if we later decide the lag matters.
 *
 * ## Scoped boards (#2326)
 *
 * `groupId` counts only the games of one club; `seasonYear` only games that
 * ended (`ended_at`, the one field a finished game always has) within that
 * Oslo calendar year. Both are optional: `/api/aeresbrett` passes only the year (all of Tørny).
 * `unstable_cache` keys on its arguments, so every scope is cached on its own
 * under the same tag. A club board reads finished club games with the service
 * role: the caller is the gate and passes a club id only after checking the
 * viewer's membership (`getClubDetail`).
 */
export const getFinishedGameWins = unstable_cache(
  async (
    opts: { groupId?: string; seasonYear?: number } = {},
  ): Promise<ClubStatsAggregate> => {
    const supabase = getAdminClient();
    const season =
      opts.seasonYear === undefined
        ? null
        : osloYearWindow(new Date(Date.UTC(opts.seasonYear, 6, 1)));

    // Round-trip 1: all finished games + mode + course (mode/config feed the
    // rare fallback path that re-derives the result for null-summary games).
    // Both reads grow with every finished game in the app, so they are paged
    // past PostgREST's 1 000-row cap (#2227).
    const games = await selectAllRows(
      (from, to) => {
        let query = supabase
          .from('games')
          .select('id, course_id, game_mode, mode_config, hole_segment, source_game_id, league_round_id')
          .eq('status', 'finished');
        if (opts.groupId) query = query.eq('group_id', opts.groupId);
        if (season) query = query.gte('ended_at', season.startIso).lt('ended_at', season.endIso);
        return query.order('id').range(from, to).returns<GameRow[]>();
      },
      'club stats games',
    );

    if (games.length === 0) {
      return {
        hasGames: false,
        winnerCounts: [],
        participationCounts: [],
        userNames: [],
        userNicknames: [],
      };
    }

    const gameIds = games.map((g) => g.id);

    // Round-trip 2: all players for those games, with their stored per-mode
    // outcome (`result_summary`, #572) and `withdrawn_at`. No holes/scores
    // fetch — the stored summary is the source of truth for who won.
    // Sliced: a season of all Tørny's games is more ids than one `.in()` URL holds.
    const playersRaw: GamePlayerRow[] = [];
    for (const ids of chunks(gameIds)) {
      playersRaw.push(
        ...(await selectAllRows(
          (from, to) =>
            supabase
              .from('game_players')
              .select(
                `game_id, user_id, withdrawn_at, result_summary, users!game_players_user_id_fkey(name, nickname, ${BOARD_USER_COLUMNS})`,
              )
              .in('game_id', ids)
              .order('game_id')
              .order('user_id')
              .range(from, to)
              .returns<GamePlayerRow[]>(),
          'club stats game_players',
        )),
      );
    }
    // #1009: gjester (skygge-brukere) teller ikke på klubbtavla — verken i
    // seiers- eller deltakelseslistene. Trygt å kutte dem fra tally-inputen
    // her: fallback-motoren under henter sine egne data fra DB, så andres
    // resultater påvirkes ikke. Gjeste-uids trengs likevel for å rense
    // fallback-VINNERNE (en gjest kan ha vunnet spillet).
    const allPlayersRaw = playersRaw;
    // #2894: a deleted account is left off the same way (`leftOffTheBoards`), so the
    // tabs never show «Slettet B.».
    const guestUserIds = new Set(
      allPlayersRaw.filter((p) => leftOffTheBoards(p.users)).map((p) => p.user_id),
    );
    const allPlayers = allPlayersRaw.filter((p) => !leftOffTheBoards(p.users));

    const playersByGame = groupBy(allPlayers, (p) => p.game_id);

    // Current name per user (first non-null wins; every row carries the live
    // name via the FK join).
    const userNames = new Map<string, string>();
    for (const p of allPlayers) {
      if (p.users?.name && !userNames.has(p.user_id)) {
        userNames.set(p.user_id, p.users.name);
      }
    }

    const userNicknames = new Map<string, string>();
    for (const p of allPlayers) {
      if (p.users?.nickname && !userNicknames.has(p.user_id)) {
        userNicknames.set(p.user_id, p.users.nickname);
      }
    }

    // Shape into the pure-tally input.
    const tallyGames: FinishedGameForTally[] = games.map((g) => ({
      id: g.id,
      // #2712: a league flight counts as played, not won.
      leagueFlight: g.league_round_id != null,
      // #2259: a derived game is its host's round, not one of its own.
      derived: g.source_game_id != null,
      players: (playersByGame.get(g.id) ?? []).map((p) => ({
        userId: p.user_id,
        name: p.users?.name ?? null,
        withdrawnAt: p.withdrawn_at,
        resultSummary: p.result_summary,
      })),
    }));

    // Games with NO stored summary at all (pre-#572 / failed persist) →
    // recompute the real per-mode result via the same engine that wrote the
    // summaries. The engine excludes withdrawn players, so winners are WD-clean.
    const fallbackGameIds = tallyGames
      .filter((g) => aggregateFinishedGame(g.players).needsFallback)
      .map((g) => g.id);

    const fallbackWinnersByGameId = new Map<string, string[]>();
    if (fallbackGameIds.length > 0) {
      const gamesById = new Map(games.map((g) => [g.id, g]));
      await Promise.all(
        fallbackGameIds.map(async (id) => {
          const game = gamesById.get(id);
          // A game without a course has no holes to recompute from; it names no winner.
          if (!game || game.course_id === null) return;
          const result = await buildModeResultForGame(supabase, {
            id: game.id,
            game_mode: game.game_mode,
            mode_config: game.mode_config,
            course_id: game.course_id,
            hole_segment: game.hole_segment,
            source_game_id: game.source_game_id,
          });
          if (result === null) return;
          const summaries = computeResultSummaries(result);
          const winners: string[] = [];
          for (const [uid, summary] of summaries) {
            // #1009: en gjest kan vinne runden, men skal ikke på klubbtavla.
            if (
              isWinningSummary(summary, { leagueFlight: game.league_round_id != null }) &&
              !guestUserIds.has(uid)
            ) {
              winners.push(uid);
            }
          }
          fallbackWinnersByGameId.set(id, winners);
        }),
      );
    }

    const { winnerCounts, participationCounts } = tallyClubStats(
      tallyGames,
      fallbackWinnersByGameId,
    );

    return {
      hasGames: true,
      winnerCounts: Array.from(winnerCounts.entries()),
      participationCounts: Array.from(participationCounts.entries()),
      userNames: Array.from(userNames.entries()),
      userNicknames: Array.from(userNicknames.entries()),
    };
  },
  ['club-statistikk'],
  { tags: ['club-statistikk'], revalidate: 300 },
);

/**
 * The season the boards show, and its wins: this Oslo year, or last year while this
 * year has no finished round yet (January). `season: null` when neither has one.
 * The club board and the app's honour board share this rule, so a year never reads
 * differently on the two (#2259). Not cached itself; each year's read is.
 */
export async function getCurrentSeasonWins(
  opts: { groupId?: string } = {},
): Promise<{ season: number | null; wins: ClubStatsAggregate }> {
  const { year } = osloParts(new Date());
  let wins = await getFinishedGameWins({ ...opts, seasonYear: year });
  if (wins.hasGames) return { season: year, wins };
  wins = await getFinishedGameWins({ ...opts, seasonYear: year - 1 });
  return { season: wins.hasGames ? year - 1 : null, wins };
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const existing = out.get(key);
    if (existing) {
      existing.push(item);
    } else {
      out.set(key, [item]);
    }
  }
  return out;
}
