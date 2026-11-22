import 'server-only';
import type { GameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getAdminClient } from '@/lib/supabase/admin';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  ceremonyAvailable,
  ceremonyLines,
  ceremonyPlaces,
  ceremonySteps,
  type CeremonyPlace,
  type CeremonyStep,
} from '@/lib/games/ceremony';
import { fetchSideWinners } from '../leaderboard/leaderboardContext';
import { nobodyWon } from '@/lib/leaderboard/podium';

export interface CeremonySidePrize {
  category: 'longest_drive' | 'closest_to_pin';
  position: number;
  /** How many prizes of the category the game has — «Lengste drive 1» / «2». */
  count: number;
  winnerUserId: string;
}

export interface CeremonyData {
  places: CeremonyPlace[];
  steps: CeremonyStep[];
  sidePrizes: CeremonySidePrize[];
  /** userId → the name as the podium shows it. A missing id is an unknown player. */
  names: Record<string, string>;
  /**
   * Everyone ended on zero (`nobodyWon`, audit 2026-11-20): the stage turns
   * the top card without confetti, as the podiums do.
   */
  nobodyWon?: boolean;
}

/**
 * The prize-giving's podium for a finished game (#2298), for the phone and
 * the TV alike. The result is `buildModeResultForGame`, the same build
 * `endGame` stores as `result_summary`, so the screen, the podium in the app
 * and the place in the mail come from one calculation. It already handles a
 * derived game's host scores (#1441), the hole segment and withdrawn players.
 *
 * Service role on purpose: it reads what `getResultReadClient` reads for a
 * finished game. Access is decided before the call — the organiser on the
 * phone, the `spectate_token` on the TV.
 */
export async function loadCeremonyData({ game, players }: GameWithPlayers): Promise<CeremonyData> {
  const admin = getAdminClient();
  const [result, sideRows] = await Promise.all([
    buildModeResultForGame(admin, {
      id: game.id,
      game_mode: game.game_mode,
      mode_config: game.mode_config,
      course_id: game.course_id,
      hole_segment: game.hole_segment,
      source_game_id: game.source_game_id,
    }),
    game.side_tournament_enabled ? fetchSideWinners(admin, game.id) : Promise.resolve([]),
  ]);

  const places = ceremonyPlaces(result ? ceremonyLines(result) : []);

  const countOf = (category: CeremonySidePrize['category']) =>
    sideRows.filter((r) => r.category === category).length;
  // A slot nobody won is not a prize to hand out.
  const sidePrizes = sideRows.flatMap((r) =>
    r.winner_user_id
      ? [{ category: r.category, position: r.position, count: countOf(r.category), winnerUserId: r.winner_user_id }]
      : [],
  );

  const names: Record<string, string> = {};
  for (const p of players) {
    const name = p.users ? formatRevealName(p.users.name ?? '', p.users.nickname) : '';
    if (name) names[p.user_id] = name;
  }

  return {
    places,
    steps: ceremonySteps(places, sidePrizes.length > 0),
    sidePrizes,
    names,
    nobodyWon:
      result !== null &&
      nobodyWon(result, { modifiedStableford: game.game_mode === 'modified_stableford' }),
  };
}

/** The game fields `ceremonyOpenFor` reads. */
type CeremonyGame = Pick<
  GameWithPlayers['game'],
  | 'id'
  | 'game_mode'
  | 'mode_config'
  | 'course_id'
  | 'hole_segment'
  | 'source_game_id'
  | 'league_round_id'
  | 'status'
>;

/**
 * Is the prize-giving open for this game? The one answer every entry reads:
 * the game page, the organiser view, the admin page, the remote and the TV.
 * `ceremonyAvailable` plus the owner's rule of 22.11 («Skjul den»): when
 * nobody won (`nobodyWon`), it is hidden. The result is only built for a
 * finished game in a podium format; before the finish there is nothing to
 * hand out and the entries are hidden by their own status check.
 */
export async function ceremonyOpenFor(game: CeremonyGame): Promise<boolean> {
  const leagueFlight = game.league_round_id != null;
  if (!ceremonyAvailable(game.game_mode, leagueFlight)) return false;
  if (game.status !== 'finished') return true;
  const result = await buildModeResultForGame(getAdminClient(), {
    id: game.id,
    game_mode: game.game_mode,
    mode_config: game.mode_config,
    course_id: game.course_id,
    hole_segment: game.hole_segment,
    source_game_id: game.source_game_id,
  });
  const noWinner =
    result !== null &&
    nobodyWon(result, { modifiedStableford: game.game_mode === 'modified_stableford' });
  return ceremonyAvailable(game.game_mode, leagueFlight, noWinner);
}
