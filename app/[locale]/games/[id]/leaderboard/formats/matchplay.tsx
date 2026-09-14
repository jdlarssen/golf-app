import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  MatchplayMatchView,
  type MatchplayPlayerInfo,
} from '../MatchplayMatchView';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildUniformContext } from '@/lib/scoring/context/buildUniformContext';
import { renderMatchplaySideSection } from '../sideTournament';
import { RoundReportCard } from '../RoundReportCard';
import { RevealHiddenView } from '../RevealHiddenView';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * Matchplay-grenen — bygger ScoringContext fra rå-rad-ene, kjører mode-router-
 * en (`computeModeResult`) og rendrer `MatchplayMatchView` med både live- og
 * finished-state håndtert av komponenten selv (basert på `result.result`).
 *
 * teamNumber sendes med fra DB siden matchplay-validatoren håndhever at hver
 * spiller tilordnes side 1 eller 2 via `game_players.team_number`. Scoring-
 * laget plukker `teamNumber === 1` vs `teamNumber === 2` for å bygge sidene.
 *
 * Spillerinfo-objektet (`playerInfo`) er strukturert som et plain JS-objekt
 * (Record) i stedet for en Map — matchplay-view-en aksesserer på userId
 * direkte og to spillere er liten skala nok at det er trivielt å bygge.
 *
 * Reveal-modus (issue #801, tightened for #1441 D12): når score_visibility=
 * 'reveal' og spillet er aktivt, vises `RevealHiddenView` (ingen match-status,
 * ingen brutto-totaler) i stedet for live match-status — den blinde cup-dagen
 * krever at «ingenting avsløres» før arrangøren avslutter, strengere enn
 * solo-/lagslag-formatenes brutto-forhåndsvisning.
 */
export async function renderMatchplay(opts: {
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

  const revSt = revealState(game.score_visibility, game.status);
  if (shouldHideNetto(revSt)) {
    return <RevealHiddenView gameName={game.name} backHref={backHref} />;
  }

  // #1958: the shared builder drops withdrawn players and their scores, the
  // same rule the result summary applies, so the live board agrees with it.
  const ctx = buildUniformContext({
    gameId,
    gameMode: 'singles_matchplay',
    modeConfig: game.mode_config,
    // Matchplay-validatoren håndhever team_number ∈ {1, 2} — vi videresender
    // som-er. Defensive fallback til 0 (som scoring-laget ignorerer som
    // ugyldig side) hvis kolonnen mot formodning er null (#844).
    players: gwp.players.map((p) => ({ ...p, team_number: p.team_number ?? 0 })),
    holesRows: rawHolesRows,
    scoresRows: rawScoresRows,
  });

  const result = computeModeResult(ctx);
  // Type-guard mot mode-router-output. Hvis routeren returnerer feil shape
  // faller vi tilbake til notFound() — sikrere enn å rendre tom UI.
  if (result.kind !== 'singles_matchplay') {
    notFound();
  }

  const unknownPlayer = tc('unknownPlayer');
  const playerInfo: Record<string, MatchplayPlayerInfo> = {};
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playerInfo[p.user_id] = {
      name: p.users.name ?? unknownPlayer,
      nickname: p.users.nickname,
      courseHandicap: p.course_handicap ?? 0,
    };
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
    <MatchplayMatchView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playerInfo={playerInfo}
      gameStatus={game.status}
      backHref={backHref}
      sideTournamentSection={sideTournamentSection}
      roundReportSection={roundReportSection}
    />
  );
}
