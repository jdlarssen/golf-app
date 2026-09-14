import type { GameMode } from '@/lib/scoring/modes/types';
import { teamScoreOwnerId } from './teamCaptain';
import { scoreOwnerForHole } from './scoreOwner';

/** The minimum a roster row must carry for us to find its team's row owner. */
export type FilledRosterRow = {
  user_id: string;
  team_number: number | null;
  withdrawn_at: string | null;
};

/**
 * The minimum a `scores` row must carry — snake_case, as PostgREST returns it.
 *
 * Rows are expected to be ALREADY filtered to entered strokes: this module never
 * sees `strokes` and cannot tell an empty row from a filled one. The caller owns
 * that filter (`.not('strokes', 'is', null)`). Pass unfiltered rows and you
 * count holes nobody played.
 */
export type FilledScoreRow = { user_id: string; hole_number: number };

/**
 * The rows each player on the roster has filled — the one home for that rule
 * (#2017). `filledHolesByPlayer` counts them; the admin status page also reads
 * the newest `updated_at` off them (#2041).
 *
 * Taking a player's OWN rows is wrong in the team-collapsed modes: the captain
 * owns every shared row, so a teammate reads «not started» however far the
 * team has got. This writes no new rule. It asks the existing ones, per roster
 * member and per ROW: `teamScoreOwnerId` picks the team's row owner (#1538) and
 * `scoreOwnerForHole` says who owns each hole (#1577). Per hole and not per
 * round, because patsome plays own ball on holes 1-6 and a shared ball on 7-18.
 *
 * Players are grouped on `team_number` with withdrawn members left in —
 * `teamScoreOwnerId` skips them itself and needs the whole team to do so. In
 * modes where `team_number` is a rotation slot (wolf, round robin) the grouping
 * is harmless: `scoreOwnerForHole` ignores the owner when the mode does not
 * collapse.
 *
 * No dedupe: `scores` is unique on (game_id, user_id, hole_number) and exactly
 * one id owns each hole, so each hole appears at most once per player.
 *
 * Generic so the caller's extra columns come back unnarrowed. Rows keep their
 * order from `scores`. Returns one entry per player in `players`, including
 * empty ones. Rows from users outside the roster are ignored.
 */
export function ownedScoresByPlayer<T extends FilledScoreRow>(opts: {
  players: readonly FilledRosterRow[];
  scores: readonly T[];
  mode: GameMode;
}): Map<string, T[]> {
  const { players, scores, mode } = opts;

  const ownerByTeam = new Map<number, string | null>();
  const teamOwner = (teamNumber: number | null): string | null => {
    if (teamNumber == null) return null;
    if (!ownerByTeam.has(teamNumber)) {
      ownerByTeam.set(
        teamNumber,
        teamScoreOwnerId(players.filter((p) => p.team_number === teamNumber)),
      );
    }
    return ownerByTeam.get(teamNumber) ?? null;
  };

  const owned = new Map<string, T[]>();
  for (const player of players) {
    const owner = teamOwner(player.team_number);
    owned.set(
      player.user_id,
      scores.filter(
        (row) =>
          row.user_id ===
          scoreOwnerForHole(mode, row.hole_number, player.user_id, owner),
      ),
    );
  }
  return owned;
}

/**
 * How many holes each player on the roster has filled — the count of
 * `ownedScoresByPlayer`'s rows, so the two can never disagree.
 *
 * Returns one entry per player in `players`, including zeroes. Rows from users
 * outside the roster are ignored.
 */
export function filledHolesByPlayer(opts: {
  players: readonly FilledRosterRow[];
  scores: readonly FilledScoreRow[];
  mode: GameMode;
}): Map<string, number> {
  const filled = new Map<string, number>();
  for (const [userId, rows] of ownedScoresByPlayer(opts)) {
    filled.set(userId, rows.length);
  }
  return filled;
}
