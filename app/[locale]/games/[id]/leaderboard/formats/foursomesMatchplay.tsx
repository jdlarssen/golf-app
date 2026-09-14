import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  FoursomesMatchplayView,
  type FoursomesPlayerInfo,
} from '../FoursomesMatchplayView';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildUniformContext } from '@/lib/scoring/context/buildUniformContext';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import { getResultReadClient } from '../leaderboardContext';
import { renderMatchplaySideSection } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import { RevealHiddenView } from '../RevealHiddenView';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
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
      withdrawn_at: string | null;
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Reveal-modus (issue #801, tightened for #1441 D12): se matchplay.tsx.
  // Gjelder hele foursomes-familien (foursomes, greensome, chapman, gruesome).
  const revSt = revealState(game.score_visibility, game.status);
  if (shouldHideNetto(revSt)) {
    return <RevealHiddenView gameName={game.name} backHref={backHref} />;
  }

  // #1958: the shared builder drops withdrawn players and their scores, the
  // same rule the result summary applies, so the live board agrees with it.
  const ctx = buildUniformContext({
    gameId,
    // game_mode sendes uendret slik at greensome/chapman/gruesome får riktig
    // side-handicap-strategi fra sin respektive compute()-funksjon. Alle fire
    // returnerer kind:'foursomes_matchplay', men config-oppsett kan avvike.
    gameMode: game.game_mode,
    modeConfig: game.mode_config,
    // #844: team_number er nullable i prod selv om typen sier number.
    players: gwp.players.map((p) => ({ ...p, team_number: p.team_number ?? 0 })),
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

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
  // #1542: samme lese-regel som resten av resultat-dataene. Uten den ble
  // `games`-raden sperret av RLS for alle utenfor kampen, og lagnavnene falt
  // tilbake til «Lag 1»/«Lag 2» midt i en cup med ekte lagnavn.
  const supabase = await getResultReadClient(game.status);
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

  // #1008: report only ever exists once the game is finished, but gate on
  // status explicitly too — the report must never show mid-match.
  const roundReportSection =
    game.status === 'finished' && game.round_report ? (
      <RoundReportCard text={game.round_report} />
    ) : null;

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
      roundReportSection={roundReportSection}
    />
  );
}
