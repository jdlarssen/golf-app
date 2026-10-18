import 'server-only';
import type { GameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getAdminClient } from '@/lib/supabase/admin';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  ceremonyLines,
  ceremonyPlaces,
  ceremonySteps,
  type CeremonyPlace,
  type CeremonyStep,
} from '@/lib/games/ceremony';
import { fetchSideWinners } from '../leaderboard/leaderboardContext';

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

  return { places, steps: ceremonySteps(places, sidePrizes.length > 0), sidePrizes, names };
}
