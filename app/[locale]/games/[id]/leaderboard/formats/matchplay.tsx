import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  MatchplayMatchView,
  type MatchplayPlayerInfo,
} from '../MatchplayMatchView';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { renderMatchplaySideSection } from '../sideTournament';
import { RevealBruttoView } from '../RevealBruttoView';
import { computeLeaderboard } from '@/lib/leaderboard';
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
 * Reveal-modus (issue #801): når score_visibility='reveal' og spillet er aktivt,
 * vises RevealBruttoView i stedet for live match-status. Dette er konsekvent med
 * de andre formatene og hindrer at spillerne ser hvem som leder hull-for-hull.
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
    }[];
  };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
}) {
  const tc = await getTranslations('leaderboard.common');
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref } = opts;

  // Reveal-modus (issue #801): konsistent reveal-gate for matchplay-grenen.
  // Matchplay lekker ikke netto-poeng (viser hull-status), men for konsistens
  // og for å hindre at spillere ser hvem som leder, vises RevealBruttoView.
  // Spillere tilhører side 1 eller 2 via team_number — disse brukes direkte.
  const revSt = revealState(game.score_visibility, game.status);
  if (shouldHideNetto(revSt)) {
    const unknownPlayerForReveal = tc('unknownPlayer');
    const bruttoPlayers = gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        name: p.users!.name ?? unknownPlayerForReveal,
        nickname: p.users!.nickname ?? null,
        teamNumber: p.team_number ?? 0,
        courseHandicap: p.course_handicap ?? 0,
        teeGender: p.tee_gender,
      }));
    const bruttoHoles = rawHolesRows.map((h) => ({
      holeNumber: h.hole_number,
      par: h.par_mens,
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    }));
    const bruttoScores = rawScoresRows.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      strokes: s.strokes,
    }));
    const bruttoLines = computeLeaderboard({
      mode: 'brutto',
      players: bruttoPlayers,
      holes: bruttoHoles,
      scores: bruttoScores,
    });
    const orderedBrutto = [...bruttoLines].sort((a, b) => a.rank - b.rank);
    const holesPlayedForReveal = new Set(rawScoresRows.map((s) => s.hole_number)).size;
    return (
      <RevealBruttoView
        gameId={gameId}
        gameName={game.name}
        teams={orderedBrutto}
        holesPlayed={holesPlayedForReveal}
        backHref={backHref}
      />
    );
  }

  const ctx = {
    game: {
      id: gameId,
      game_mode: 'singles_matchplay' as const,
      mode_config: game.mode_config,
    },
    players: gwp.players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        // Matchplay-validatoren håndhever team_number ∈ {1, 2} — vi videresender
        // som-er. Defensive fallback til 0 (som scoring-laget ignorerer som
        // ugyldig side) hvis kolonnen mot formodning er null.
        teamNumber: p.team_number ?? 0,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        // #240 — per-side par på matchplay-hull-rader leses fra
        // parFor(hole, side.teeGender) inne i singlesMatchplay-modulen.
        teeGender: p.tee_gender,
      })),
    holes: rawHolesRows.map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      // #240 — per-kjønn-par for hver side. Når sidene har ulik teeGender
      // (blandet-kjønn-match) og hullet har avvikende par, leser scoring-
      // modulen riktig variant per side via parFor().
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

  return (
    <MatchplayMatchView
      gameId={gameId}
      gameName={game.name}
      result={result}
      playerInfo={playerInfo}
      gameStatus={game.status}
      backHref={backHref}
      sideTournamentSection={sideTournamentSection}
    />
  );
}
