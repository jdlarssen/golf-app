// #2283 (part D2): what the hole page sends to the side-contest row. Pure over
// what `fetchHolePageData` read: which contests the hole has, whether I may
// report, what the flight has reported, and who is in my flight. The reads
// themselves live in `holePageData.ts`.

import { isSingleFlightGame } from '@/lib/games/flightScope';
import type { GameForHole, PlayerForHole } from '@/lib/games/getGameWithPlayers';
import { claimsNeeded, type HoleClaimsRead } from '@/lib/games/sideClaims';
import { contestsForHole, sideClaimFlightKey, type SideHolesConfig } from '@/lib/games/sideContest';
import { teeShotNames } from '@/lib/games/teeShotNames';
import { nameInitials } from '@/lib/names/initials';
import { playerName } from '@/lib/names/playerName';
import type { HoleSideContestProps, SideContestClaimsSnapshot, SideContestPlayer } from './holeClientProps';
import type { CupSideAwardsRead } from './holePageData';

/** The game's own side-contest slots as `contestsForHole` reads them. */
export function sideHolesConfigFor(
  game: Pick<
    GameForHole,
    'side_ld_count' | 'side_ctp_count' | 'side_ld_holes' | 'side_ctp_holes' | 'source_game_id'
  >,
): SideHolesConfig {
  return {
    sideLdCount: game.side_ld_count,
    sideCtpCount: game.side_ctp_count,
    sideLdHoles: game.side_ld_holes,
    sideCtpHoles: game.side_ctp_holes,
    sourceGameId: game.source_game_id,
  };
}

/**
 * Whether I may report on this hole: the round is running and I am an active
 * player with a key in the claim tables. The same rule the rpcs apply
 * (`side_claim_flight_key`, then `not_active`), so a withdrawn player, or one
 * without a flight in a game of more than four, is refused here and there.
 */
export function canReportSideClaims(args: {
  game: Pick<GameForHole, 'status' | 'game_mode'>;
  allPlayers: readonly PlayerForHole[];
  userId: string;
}): boolean {
  const { game, allPlayers, userId } = args;
  return game.status === 'active' && sideClaimFlightKey(game.game_mode, allPlayers, userId) !== null;
}

/**
 * Everyone whose reports I see: the players with my claim key (`sideClaimFlightKey`),
 * withdrawn ones too, since a report may name them and `entered_by` may be them.
 * In a single-flight game that is everyone in the game. Empty when I cannot
 * report. Names follow the rest of the hole page: full name in the sheet, short
 * name in the row (the full name when two share a first name, #2286).
 */
export function buildSideContestPlayers(args: {
  game: Pick<GameForHole, 'game_mode'>;
  allPlayers: readonly PlayerForHole[];
  userId: string;
  unknownPlayer: string;
}): SideContestPlayer[] {
  const { game, allPlayers, userId, unknownPlayer } = args;
  const me = allPlayers.find((p) => p.user_id === userId && p.withdrawn_at == null);
  if (!me) return [];
  const single = isSingleFlightGame(game.game_mode, [...allPlayers]);
  const group = allPlayers.filter((p) => single || p.flight_number === me.flight_number);
  const shortNames = teeShotNames(group, unknownPlayer);
  return group.map((p) => {
    const name = playerName(p.users) ?? unknownPlayer;
    return {
      userId: p.user_id,
      name,
      shortName: shortNames.get(p.user_id) ?? unknownPlayer,
      initial: nameInitials(name),
      teamNumber: p.team_number ?? null,
      withdrawn: p.withdrawn_at != null,
    };
  });
}

/**
 * The side contests on this hole for `HoleClient`, or null when it has none.
 *
 * A failed read never throws and never passes for «nobody has reported»:
 *  - claims: `failed: true`, so the row says «Fikk ikke hentet. Prøver igjen.»
 *    and the browser hook fetches at once;
 *  - cup awards: a cup-only hole is unknown, so the hole shows what the game's
 *    own slots give (like the green pins: the feature drops out rather than the
 *    page). The error is logged. The app keeps its previous bundle instead; the
 *    web has no earlier answer to keep.
 */
export function resolveSideContest(args: {
  game: GameForHole;
  allPlayers: readonly PlayerForHole[];
  userId: string;
  holeNumber: number;
  awardsRes: CupSideAwardsRead | null;
  claimsRes: HoleClaimsRead | null;
  unknownPlayer: string;
}): HoleSideContestProps | null {
  const { game, allPlayers, userId, holeNumber, awardsRes, claimsRes, unknownPlayer } = args;

  if (awardsRes && !awardsRes.ok) {
    console.error('[holes] cup side awards fetch failed — cup contest holes hidden', {
      gameId: game.id,
      holeNumber,
      error: awardsRes.error,
    });
  }
  const contests = contestsForHole(
    sideHolesConfigFor(game),
    awardsRes?.ok ? awardsRes.awards : null,
    holeNumber,
  );
  if (contests.length === 0) return null;

  const canReport = canReportSideClaims({ game, allPlayers, userId });
  if (!canReport) return { contests, canReport, claims: null, players: [] };

  const need = claimsNeeded(contests);
  let claims: SideContestClaimsSnapshot = { failed: true, side: undefined, gir: undefined };
  if (claimsRes?.ok) {
    // The wave reads a superset of what the hole needs (a cup reads both tables
    // before it knows the hole). Hand over only what the hole reports into, and
    // treat a missing table it does need as a failed read, never as an empty one.
    const side = need.side ? claimsRes.side : undefined;
    const gir = need.gir ? claimsRes.gir : undefined;
    if (!(need.side && side === undefined) && !(need.gir && gir === undefined)) {
      claims = { failed: false, side, gir };
    }
  } else if (claimsRes) {
    console.error('[holes] side claims fetch failed — the card says «Fikk ikke hentet»', {
      gameId: game.id,
      holeNumber,
      error: claimsRes.error,
    });
  }

  return {
    contests,
    canReport,
    claims,
    players: buildSideContestPlayers({ game, allPlayers, userId, unknownPlayer }),
  };
}
