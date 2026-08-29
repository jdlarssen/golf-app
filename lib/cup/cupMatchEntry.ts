import { holesForSegment, type HoleSegment } from '@/lib/scoring/holeSegment';
import { PERSONALLY_SCORED_CUP_GAME_MODES, type CupPerformanceGame } from './computeCupAwards';
import { computeCupMatchDisplayResult } from './cupMatchDisplayResult';
import { toCupMatchGameMode } from './cupMatchGameMode';
import { formatSideLabel, type CupNamedPlayerRow } from './cupRoster';
import type { CupMatchInput } from './computeCupLeaderboard';
import type { MatchSubmissionStatus } from './matchSubmissionStatus';

/**
 * Bygger ÉN cup-kamps leaderboard-input + (når modusen tillater det) dens
 * prestasjons-input (#1522, utdrag fra `getCupSnapshot`s game-loop). Ren
 * funksjon: kalleren har alt hentet radene, gruppert dem per spill og løst opp
 * host→avledet-scorene; her er det kun utledning.
 */

export type CupMatchPlayerRow = CupNamedPlayerRow & {
  course_handicap: number | null;
};

export type CupMatchScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

export type CupMatchGameRow = {
  id: string;
  status: CupMatchInput['status'];
  game_mode: string;
  mode_config: unknown;
  tournament_match_label: string | null;
  /** `NOT NULL DEFAULT 'full'` i DB — leses defensivt (`?? 'full'`) uansett. */
  hole_segment: string;
  source_game_id: string | null;
  score_visibility: string;
};

export type CupMatchEntryInput = {
  game: CupMatchGameRow;
  /** Kampens egne spillerrader. */
  players: readonly CupMatchPlayerRow[];
  /**
   * Scorene kampen skal leses mot. En AVLEDET kamp (#1441 D3) eier aldri egne
   * scores — kalleren har allerede slått opp `source_game_id ?? id`.
   */
  scores: readonly CupMatchScoreRow[];
  /** Banens hull, USEGMENTERT — segmentfiltreringen skjer her. */
  courseHoles: ReadonlyArray<{ number: number; par: number; strokeIndex: number }>;
  /** Fra `computeSubmissionStatusByGame` (#1488 K4 — avledet arver host). */
  submission: MatchSubmissionStatus;
  unknownLabel: string;
};

export type CupMatchEntry = {
  match: CupMatchInput;
  /** `null` når spillet ikke kvalifiserer til «dro ned mest» (#1508). */
  performance: CupPerformanceGame | null;
};

/**
 * #1508: prestasjons-input for «dro ned mest»-kåringen. To filtre, begge
 * nødvendige:
 *   - Kun modi med personlig føring (PERSONALLY_SCORED_CUP_GAME_MODES) —
 *     foursomes-familien fører lagball og kan aldri attribuere individuell
 *     prestasjon.
 *   - Kun HOST-spill: en avledet match (#1441 D3) eier ingen egne scores,
 *     den leser host-ens. Uten dette filteret ville splittet cup-dag telt
 *     det samme scoresettet to ganger.
 */
function buildPerformanceGame(
  input: CupMatchEntryInput,
  holes: ReadonlyArray<{ number: number; par: number; strokeIndex: number }>,
): CupPerformanceGame | null {
  const { game } = input;
  if (game.source_game_id != null) return null;
  if (!(PERSONALLY_SCORED_CUP_GAME_MODES as readonly string[]).includes(game.game_mode)) return null;

  return {
    gameId: game.id,
    holes: holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex })),
    players: input.players.map((p) => ({
      userId: p.user_id,
      courseHandicap: p.course_handicap ?? 0,
    })),
    scores: input.scores.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      strokes: s.strokes,
    })),
  };
}

export function buildCupMatchEntry(input: CupMatchEntryInput): CupMatchEntry {
  const { game, players, scores, unknownLabel } = input;

  // #1441 (D1/D2): hull-i-scope for matchen — 'full' (dagens oppførsel) med
  // mindre bunt-genereringen satte front9/back9.
  const segment = (game.hole_segment as HoleSegment | undefined) ?? 'full';
  const holes = holesForSegment(input.courseHoles, segment);

  // Per side: alle spillere med team_number 1 eller 2. Singles har 1 per side,
  // lag-format (fourball/foursomes/greensome/chapman/gruesome/best_ball) har 2.
  const side1Players = players.filter((p) => p.team_number === 1);
  const side2Players = players.filter((p) => p.team_number === 2);

  // `mode_config` — `allowance_pct` for matchplay-familiens lag-format,
  // `team_strokes_override` KUN meningsfullt for greensome (D10).
  // Best-ball-hosten (D4/D11) har IKKE `allowance_pct` her (#1539/#1551):
  // dens allowance bor på `games.hcp_allowance_pct` og er alt anvendt i det
  // frosne banehandicapet, slik at kampens egen tavle og cup-poenget regner
  // med samme tall. Se `lib/cup/cupMatchAllowance.ts`.
  const modeConfig = (game.mode_config ?? null) as {
    allowance_pct?: number;
    team_strokes_override?: { team1: number; team2: number };
  } | null;

  const result = computeCupMatchDisplayResult({
    gameId: game.id,
    gameMode: game.game_mode,
    status: game.status,
    scoreVisibility: game.score_visibility,
    modeConfig,
    side1: side1Players.map((p) => ({
      userId: p.user_id,
      courseHandicap: p.course_handicap ?? 0,
    })),
    side2: side2Players.map((p) => ({
      userId: p.user_id,
      courseHandicap: p.course_handicap ?? 0,
    })),
    holes,
    scores: scores.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  });

  return {
    match: {
      gameId: game.id,
      matchLabel: game.tournament_match_label,
      // Navn-label per side: singles bruker enkelt-navn, lag-format (fourball/
      // foursomes/greensome/chapman/gruesome) joiner med «/». Defensiv: tom
      // side rendres som `unknownLabel` via formatSideLabel.
      team1PlayerName: formatSideLabel(side1Players, unknownLabel),
      team2PlayerName: formatSideLabel(side2Players, unknownLabel),
      gameMode: toCupMatchGameMode(game.game_mode),
      status: game.status,
      result,
      sourceGameId: game.source_game_id,
      // #1502/#1488 (K4/K5): «Scorekort levert» + helt-trukket-flagget.
      allScorecardsSubmitted: input.submission.allScorecardsSubmitted,
      allPlayersWithdrawn: input.submission.allPlayersWithdrawn,
      // #1497: spiller-ID-ene per side, slik at per-spiller-regnskapet
      // (computeCupPlayerPoints) kan kreditere hver spiller på siden hele
      // sidens kamppoeng.
      team1UserIds: side1Players.map((p) => p.user_id),
      team2UserIds: side2Players.map((p) => p.user_id),
    },
    performance: buildPerformanceGame(input, holes),
  };
}
