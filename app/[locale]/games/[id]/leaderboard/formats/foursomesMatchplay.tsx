import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  FoursomesMatchplayView,
  type FoursomesPlayerInfo,
} from '../FoursomesMatchplayView';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import { getLeaderboardContext } from '../leaderboardContext';
import { renderMatchplaySideSection } from '../sideTournament';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Foursomes-familie-grenen — håndterer foursomes_matchplay, greensome_matchplay,
 * chapman_matchplay og gruesome_matchplay (alle returnerer kind:'foursomes_matchplay'
 * fra scoring-laget). Speilet renderFourballMatchplay tett, med tre tilpasninger:
 *
 * 1. game_mode sendes som-det-er (ikke hardkodet) slik at korrekt side-handicap-
 *    strategi + config brukes av computeModeResult.
 * 2. FoursomesMatchplayResult vs FourballMatchplayResult: kind-guard er
 *    'foursomes_matchplay'; playerInfo er FoursomesPlayerInfo (uten effectiveHandicap).
 * 3. formatLabel hentes fra MODE_LABELS[game.game_mode] og sendes til view-en
 *    for å speile variant-navnet («Foursomes», «Greensome», «Chapman», «Gruesome»).
 */
export async function renderFoursomesMatchplay(opts: {
  gameId: string;
  game: GameForHole;
  gwp: {
    players: {
      user_id: string;
      team_number: number;
      users: { name: string | null; nickname: string | null } | null;
      course_handicap: number | null;
      tee_gender: TeeGender;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  const ctx = {
    game: {
      id: gameId,
      // game_mode sendes uendret slik at greensome/chapman/gruesome får riktig
      // side-handicap-strategi fra sin respektive compute()-funksjon. Alle fire
      // returnerer kind:'foursomes_matchplay', men config-oppsett kan avvike.
      game_mode: game.game_mode,
      mode_config: game.mode_config,
    },
    players: gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        teamNumber: p.team_number ?? 0,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        teeGender: p.tee_gender,
      })),
    holes: rawHolesRows.map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: rawScoresRows.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  };

  const result = computeModeResult(ctx);
  if (result.kind !== 'foursomes_matchplay') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const playerInfo: Record<string, FoursomesPlayerInfo> = {};
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playerInfo[p.user_id] = {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
      courseHandicap: p.course_handicap ?? 0,
    };
  }

  // Cup-aware lag-labels: hvis games.tournament_id er satt, hent
  // team_1_name/team_2_name fra tournaments-radet. Ellers fall tilbake til
  // generisk «Lag 1» / «Lag 2».
  let side1Label = tc('teamLabel', { number: 1 });
  let side2Label = tc('teamLabel', { number: 2 });
  const { supabase } = await getLeaderboardContext();
  const { data: tournamentLink } = await supabase
    .from('games')
    .select('tournament_id')
    .eq('id', gameId)
    .single<{ tournament_id: string | null }>();
  if (tournamentLink?.tournament_id) {
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('team_1_name, team_2_name')
      .eq('id', tournamentLink.tournament_id)
      .single<{ team_1_name: string; team_2_name: string }>();
    if (tournament) {
      side1Label = tournament.team_1_name;
      side2Label = tournament.team_2_name;
    }
  }

  const sideTournamentSection = await renderMatchplaySideSection({
    gameId,
    game,
    gwp,
    rawHolesRows,
    rawScoresRows,
  });

  return (
    <FoursomesMatchplayView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playerInfo={playerInfo}
      side1Label={side1Label}
      side2Label={side2Label}
      formatLabel={MODE_LABELS[game.game_mode]}
      gameStatus={game.status}
      backHref={backHref}
      sideTournamentSection={sideTournamentSection}
    />
  );
}
