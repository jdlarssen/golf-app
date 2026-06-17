import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  FourballMatchplayView,
  type FourballPlayerInfo,
} from '../FourballMatchplayView';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { getLeaderboardContext } from '../leaderboardContext';
import { renderMatchplaySideSection } from '../sideTournament';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Fourball matchplay-grenen (issue #217). Speiler `renderMatchplay`-pattern
 * tett — bygger ScoringContext, kjører mode-router-en, og rendrer
 * `FourballMatchplayView` med både live- og finished-state håndtert av
 * komponenten selv.
 *
 * Forskjell fra singles: vi henter `team_1_name`/`team_2_name` fra det
 * koblede `tournaments`-rad-et når matchen er en del av et cup
 * (`games.tournament_id !== null`). Når matchen ikke er cup-koblet (i
 * fremtiden vil fri-fourball støttes) brukes generisk «Lag 1»/«Lag 2».
 *
 * Fetch-en er en slim direkte query — `getGameWithPlayers` cache-er ikke
 * tournament-radet (cross-game fan-out problem) og tournament-navn endrer
 * seg sjelden, så vi henter direkte med et minimum av cost.
 */
export async function renderFourballMatchplay(opts: {
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
      game_mode: 'fourball_matchplay' as const,
      mode_config: game.mode_config,
    },
    players: gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        // Fourball-validatoren håndhever team_number ∈ {1, 2} med 2+2-fordeling.
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
  if (result.kind !== 'fourball_matchplay') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const playerInfo: Record<string, FourballPlayerInfo> = {};
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
  // generisk «Lag 1» / «Lag 2». Slim direkte query — cache hits sjelden
  // siden tournament-radet ikke endres ofte.
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
    <FourballMatchplayView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playerInfo={playerInfo}
      side1Label={side1Label}
      side2Label={side2Label}
      gameStatus={game.status}
      backHref={backHref}
      sideTournamentSection={sideTournamentSection}
    />
  );
}
