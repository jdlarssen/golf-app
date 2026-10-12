// Tavla (#2253): the live board for solo stableford (incl. modified) and solo
// strokeplay. Pure code — no React, next-intl or server imports — so the web
// board, the app (native/app) and the surfaces that build on it (#2254, #2275,
// #2286, #2299) all read the same numbers.
//
// It never ranks by itself. Every rank, total and tie comes from the scoring
// engine (`computeLeaderboard`) with the game's own mode_config, so the board
// and the podium read one rule (a net-to-par game ranks on net to par on both).

import { computeLeaderboard } from '@/lib/scoring';
import {
  buildStablefordContext,
  type StablefordContextHoleRow,
  type StablefordContextPlayerRow,
  type StablefordContextScoreRow,
} from '@/lib/scoring/context/buildStablefordContext';
import { buildSoloStrokeplayContext } from '@/lib/scoring/context/buildSoloStrokeplayContext';
import { maxHolesPlayed } from '@/lib/scoring/holesPlayed';
import { isStablefordFamily } from '@/lib/scoring/modes/types';
import type {
  GameMode,
  GameModeConfig,
  SoloStrokeplayResult,
  StablefordSoloResult,
} from '@/lib/scoring/modes/types';
import { scoreTone, type ScoreTone } from '@/lib/scoring/scoreTone';
import type { HoleSegment } from '@/lib/scoring/holeSegment';
import { resolveActiveCardState } from '@/lib/games/activeCardState';
import { nextUnfilledHole, playOrder } from '@/lib/games/nextHole';
import type { StartType } from '@/lib/games/startType';
import type { GameStatus } from '@/lib/games/status';
import { revealState, shouldHideNetto, type ScoreVisibility } from '@/lib/games/visibility';

/** What the number column counts: stableford points, net to par, or net strokes. */
export type LiveBoardUnit = 'points' | 'toPar' | 'net';

export type LiveBoardRow = {
  userId: string;
  /** Raw `users.name`; the component formats it. */
  name: string | null;
  nickname: string | null;
  rank: number;
  /** Another row shares this rank. */
  tied: boolean;
  /**
   * points: totalPoints · toPar: netToPar · net: totalNetStrokes. `null` until
   * the player has played a hole.
   */
  total: number | null;
  holesPlayed: number;
  /**
   * Rank before each player's latest hole − rank now (positive = up). `null`
   * under `minHolesForMovement` played holes (default 2).
   */
  movement: number | null;
  /** Gross colour of up to the last five played holes, oldest first. */
  recent: ScoreTone[];
  /**
   * The same holes as `recent` (#2286): strokes, the player's own par, and the
   * hole's stableford points or net strokes (`null` in the other unit).
   */
  recentHoles: LiveBoardRecentHole[];
};

export type LiveBoardRecentHole = {
  holeNumber: number;
  gross: number;
  par: number;
  points: number | null;
  net: number | null;
};

export type LiveBoard = {
  unit: LiveBoardUnit;
  /** The furthest-along player's number of played holes («LIVE · ETTER 7 HULL»). */
  holesPlayed: number;
  /** In the engine's order — the board never sorts on its own. */
  rows: LiveBoardRow[];
};

export type LiveBoardPlayerRow = StablefordContextPlayerRow;

export type LiveBoardGame = {
  game_mode: GameMode;
  mode_config: GameModeConfig;
  status: GameStatus;
  score_visibility: ScoreVisibility;
  /**
   * #2286: the order the holes are played in (`playOrder`) — the last five
   * holes and the movement read it. Left out, a full round from the first tee.
   */
  hole_segment?: HoleSegment;
  start_type?: StartType;
};

type SoloResult = StablefordSoloResult | SoloStrokeplayResult;

const RECENT_HOLES = 5;

/** Each player's holes with strokes. */
function filledByPlayer(
  rows: ReadonlyArray<{ user_id: string; hole_number: number; strokes: number | null }>,
): Map<string, Set<number>> {
  const filled = new Map<string, Set<number>>();
  for (const r of rows) {
    if (r.strokes == null) continue;
    const holes = filled.get(r.user_id);
    if (holes) holes.add(r.hole_number);
    else filled.set(r.user_id, new Set([r.hole_number]));
  }
  return filled;
}

/**
 * Removes each player's latest played hole: the last hole with strokes in the
 * order the player plays them (`playOrder` — hole order from the first tee,
 * the group's own start in a shotgun, #2286). Rows without strokes stay; they
 * count for nothing either way.
 */
export function withoutLatestHolePerPlayer<
  T extends { user_id: string; hole_number: number; strokes: number | null },
>(rows: T[], segment: HoleSegment = 'full', startType: StartType = 'first_tee'): T[] {
  const latest = new Map<string, number>();
  for (const [userId, holes] of filledByPlayer(rows)) {
    const order = playOrder(segment, startType, holes);
    const last = [...order].reverse().find((h) => holes.has(h));
    if (last !== undefined) latest.set(userId, last);
  }
  return rows.filter((r) => r.strokes == null || latest.get(r.user_id) !== r.hole_number);
}

/**
 * The live board, or `null` when the game should not show it: another format,
 * team stableford, a finished game (podium or duel) or a reveal game that is
 * still hiding net results.
 */
export function computeLiveBoard(opts: {
  gameId: string;
  game: LiveBoardGame;
  players: LiveBoardPlayerRow[];
  holesRows: StablefordContextHoleRow[];
  scoresRows: StablefordContextScoreRow[];
  /**
   * Played holes before a row gets movement. The demo (#2281) passes 1 so the
   * arrow shows from the first hole; every real board keeps the default 2.
   */
  minHolesForMovement?: number;
}): LiveBoard | null {
  const { gameId, game, players, holesRows, scoresRows, minHolesForMovement = 2 } = opts;
  if (game.status === 'finished') return null;
  if (shouldHideNetto(revealState(game.score_visibility, game.status))) return null;

  const resultFor = (scores: StablefordContextScoreRow[]): SoloResult | null => {
    if (isStablefordFamily(game.game_mode)) {
      const result = computeLeaderboard(
        buildStablefordContext({
          gameId,
          gameMode: game.game_mode === 'modified_stableford' ? 'modified_stableford' : 'stableford',
          modeConfig: game.mode_config,
          players,
          holesRows,
          scoresRows: scores,
        }),
      );
      return result.kind === 'stableford' && result.variant === 'solo' ? result : null;
    }
    if (game.game_mode === 'solo_strokeplay') {
      const result = computeLeaderboard(
        buildSoloStrokeplayContext({
          gameId,
          modeConfig: game.mode_config,
          players,
          holesRows,
          scoresRows: scores,
        }),
      );
      return result.kind === 'solo_strokeplay' ? result : null;
    }
    return null;
  };

  const result = resultFor(scoresRows);
  if (!result) return null;
  const segment = game.hole_segment ?? 'full';
  const startType = game.start_type ?? 'first_tee';
  const filled = filledByPlayer(scoresRows);
  const previous = resultFor(withoutLatestHolePerPlayer(scoresRows, segment, startType));
  const previousRank = new Map(previous?.players.map((p) => [p.userId, p.rank]) ?? []);

  // The engine says which rule it ranked on; the board shows that number.
  const unit: LiveBoardUnit =
    result.kind === 'stableford' ? 'points' : result.ranking === 'net_to_par' ? 'toPar' : 'net';

  const lines: { userId: string; rank: number; holesPlayed: number; total: number | null }[] =
    result.kind === 'stableford'
      ? result.players.map((p) => ({ ...p, total: p.totalPoints }))
      : result.players.map((p) => ({
          ...p,
          total: unit === 'toPar' ? p.netToPar : p.totalNetStrokes,
        }));

  const userById = new Map(players.map((p) => [p.user_id, p.users]));
  const rankCount = new Map<number, number>();
  for (const l of lines) rankCount.set(l.rank, (rankCount.get(l.rank) ?? 0) + 1);

  const rows = lines.map((l): LiveBoardRow => {
    const user = userById.get(l.userId) ?? null;
    const before = previousRank.get(l.userId);
    const recentHoles = lastPlayedHoles(
      result.holes,
      l.userId,
      playOrder(segment, startType, filled.get(l.userId) ?? new Set()),
    );
    return {
      userId: l.userId,
      name: user?.name ?? null,
      nickname: user?.nickname ?? null,
      rank: l.rank,
      tied: (rankCount.get(l.rank) ?? 0) > 1,
      total: l.holesPlayed > 0 ? l.total : null,
      holesPlayed: l.holesPlayed,
      movement: l.holesPlayed < minHolesForMovement || before === undefined ? null : before - l.rank,
      recent: recentHoles.map((h) => scoreTone(h.gross, h.par)),
      recentHoles,
    };
  });

  const activeIds = new Set(rows.map((r) => r.userId));
  return {
    unit,
    holesPlayed: maxHolesPlayed(scoresRows.filter((s) => activeIds.has(s.user_id))),
    rows,
  };
}

/**
 * Up to the last five played holes in the order played (`order`, from
 * `playOrder`), oldest first — the one source of `recent` and `recentHoles`.
 */
function lastPlayedHoles(
  holes: ReadonlyArray<{
    holeNumber: number;
    perPlayer: ReadonlyArray<{
      userId: string;
      gross: number | null;
      par: number;
      points?: number;
      net?: number | null;
    }>;
  }>,
  userId: string,
  order: readonly number[],
): LiveBoardRecentHole[] {
  const played: LiveBoardRecentHole[] = [];
  for (const hole of holes) {
    const cell = hole.perPlayer.find((c) => c.userId === userId);
    if (cell && cell.gross != null) {
      played.push({
        holeNumber: hole.holeNumber,
        gross: cell.gross,
        par: cell.par,
        points: cell.points ?? null,
        net: cell.net ?? null,
      });
    }
  }
  const position = (hole: number) => {
    const i = order.indexOf(hole);
    return i === -1 ? order.length + hole : i;
  };
  played.sort((a, b) => position(a.holeNumber) - position(b.holeNumber));
  return played.slice(-RECENT_HOLES);
}

export type ViewerStanding = {
  rank: number;
  tied: boolean;
  fieldSize: number;
  total: number | null;
  holesPlayed: number;
  /** Everyone on rank 1 (more than one on a shared lead). */
  leaderUserIds: string[];
  /**
   * Points or strokes behind the lead; `null` when the viewer leads or the
   * numbers cannot be compared. Net to par compares across holes played
   * («thru»); points and net strokes only when the viewer and every leader
   * have played the same number of holes.
   */
  gap: number | null;
};

/** Where the viewer stands on the board, or `null` when they are not on it (organizer, withdrawn). */
export function viewerStanding(board: LiveBoard, userId: string): ViewerStanding | null {
  const me = board.rows.find((r) => r.userId === userId);
  if (!me) return null;
  const leaders = board.rows.filter((r) => r.rank === 1);
  return {
    rank: me.rank,
    tied: me.tied,
    fieldSize: board.rows.length,
    total: me.total,
    holesPlayed: me.holesPlayed,
    leaderUserIds: leaders.map((r) => r.userId),
    gap: gapToLead(board.unit, me, leaders),
  };
}

function gapToLead(unit: LiveBoardUnit, me: LiveBoardRow, leaders: LiveBoardRow[]): number | null {
  if (me.rank === 1 || me.total === null || leaders.length === 0) return null;
  const gaps = leaders.map((l) => comparableGap(unit, me, l));
  return gaps.some((g) => g === null) ? null : gaps[0];
}

/**
 * The distance between two rows' numbers, or `null` when they cannot be
 * compared: a row without a total, or — in points and net strokes — a
 * different number of holes played. Net to par compares across holes
 * («thru»). The one rule behind the gap to the lead and the follow page's
 * lead over number two (#2286).
 */
export function comparableGap(
  unit: LiveBoardUnit,
  a: Pick<LiveBoardRow, 'total' | 'holesPlayed'>,
  b: Pick<LiveBoardRow, 'total' | 'holesPlayed'>,
): number | null {
  if (a.total === null || b.total === null) return null;
  if (unit !== 'toPar' && a.holesPlayed !== b.holesPlayed) return null;
  return Math.abs(a.total - b.total);
}

/** What the strip's button does: the next hole, «Lever scorekort», or nothing after delivery. */
export type LiveBoardStripAction =
  | { kind: 'hole'; holeNumber: number; href: string }
  | { kind: 'submit'; href: string }
  | { kind: 'none' };

/**
 * The strip's button for the viewer, or `null` when the viewer gets no strip:
 * the game is not being played (a scheduled game's holes are closed), the
 * viewer has no player row (an organizer who does not play) or has withdrawn.
 *
 * Same state machine as the Home card (`resolveActiveCardState`) and the same
 * next-hole rule (`nextUnfilledHole`), so the two cannot send a player to
 * different places. `viewerScores` are the viewer's own rows in the game's
 * segment; only rows with strokes count as filled.
 */
export function liveBoardStripAction(opts: {
  gameId: string;
  status: GameStatus;
  holeSegment: HoleSegment;
  /** #2286: a shotgun group plays on from its own start (`playOrder`). */
  startType?: StartType;
  requirePeerApproval: boolean;
  viewer:
    | { submitted_at: string | null; approved_at: string | null; withdrawn_at: string | null }
    | undefined;
  viewerScores: ReadonlyArray<{ hole_number: number; strokes: number | null }>;
}): LiveBoardStripAction | null {
  const { gameId, status, holeSegment, startType, requirePeerApproval, viewer, viewerScores } = opts;
  if (status !== 'active' || !viewer) return null;
  const state = resolveActiveCardState({
    ...viewer,
    require_peer_approval: requirePeerApproval,
  });
  if (state === 'withdrawn') return null;
  if (state !== 'continue') return { kind: 'none' };
  const filled = new Set(
    viewerScores.filter((s) => s.strokes != null).map((s) => s.hole_number),
  );
  const next = nextUnfilledHole(holeSegment, filled, startType);
  return next === null
    ? { kind: 'submit', href: `/games/${gameId}/submit` }
    : { kind: 'hole', holeNumber: next, href: `/games/${gameId}/holes/${next}` };
}
