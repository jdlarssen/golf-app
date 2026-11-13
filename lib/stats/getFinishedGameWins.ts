import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
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
  course_id: string;
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
  users: {
    name: string | null;
    is_guest: boolean;
  } | null;
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
 * `lib/games/getGameWithPlayers.ts`). This does NOT widen exposure: the data
 * is already globally public — every finished game is world-readable via the
 * open `games.status = 'finished'` RLS policy, and this page is reachable by
 * any logged-in user. The auth gate (`getProxyVerifiedUserId`) stays at the
 * call-site, outside the cache, so the gate is unchanged.
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
 */
export const getClubStatsAggregate = unstable_cache(
  async (): Promise<ClubStatsAggregate> => {
    const supabase = getAdminClient();

    // Round-trip 1: all finished games + mode + course (mode/config feed the
    // rare fallback path that re-derives the result for null-summary games).
    // Both reads grow with every finished game in the app, so they are paged
    // past PostgREST's 1 000-row cap (#2227).
    const games = await selectAllRows(
      (from, to) =>
        supabase
          .from('games')
          .select('id, course_id, game_mode, mode_config, hole_segment, source_game_id, league_round_id')
          .eq('status', 'finished')
          .order('id')
          .range(from, to)
          .returns<GameRow[]>(),
      'club stats games',
    );

    if (games.length === 0) {
      return {
        hasGames: false,
        winnerCounts: [],
        participationCounts: [],
        userNames: [],
      };
    }

    const gameIds = games.map((g) => g.id);

    // Round-trip 2: all players for those games, with their stored per-mode
    // outcome (`result_summary`, #572) and `withdrawn_at`. No holes/scores
    // fetch — the stored summary is the source of truth for who won.
    const playersRaw = await selectAllRows(
      (from, to) =>
        supabase
          .from('game_players')
          .select(
            'game_id, user_id, withdrawn_at, result_summary, users!game_players_user_id_fkey(name, is_guest)',
          )
          .in('game_id', gameIds)
          .order('game_id')
          .order('user_id')
          .range(from, to)
          .returns<GamePlayerRow[]>(),
      'club stats game_players',
    );
    // #1009: gjester (skygge-brukere) teller ikke på klubbtavla — verken i
    // seiers- eller deltakelseslistene. Trygt å kutte dem fra tally-inputen
    // her: fallback-motoren under henter sine egne data fra DB, så andres
    // resultater påvirkes ikke. Gjeste-uids trengs likevel for å rense
    // fallback-VINNERNE (en gjest kan ha vunnet spillet).
    const allPlayersRaw = playersRaw;
    const guestUserIds = new Set(
      allPlayersRaw.filter((p) => p.users?.is_guest).map((p) => p.user_id),
    );
    const allPlayers = allPlayersRaw.filter((p) => !p.users?.is_guest);

    const playersByGame = groupBy(allPlayers, (p) => p.game_id);

    // Current name per user (first non-null wins; every row carries the live
    // name via the FK join).
    const userNames = new Map<string, string>();
    for (const p of allPlayers) {
      if (p.users?.name && !userNames.has(p.user_id)) {
        userNames.set(p.user_id, p.users.name);
      }
    }

    // Shape into the pure-tally input.
    const tallyGames: FinishedGameForTally[] = games.map((g) => ({
      id: g.id,
      // #2712: a league flight counts as played, not won.
      leagueFlight: g.league_round_id != null,
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
          if (!game) return;
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
    };
  },
  ['club-statistikk'],
  { tags: ['club-statistikk'], revalidate: 300 },
);

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
