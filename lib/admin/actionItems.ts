import { cache } from 'react';
import { classifyDeliveryStatus } from '@/lib/games/deliveryStatus';
import {
  filledHolesByPlayer,
  type FilledRosterRow,
  type FilledScoreRow,
} from '@/lib/games/filledHoles';
import { holeCountForSegment } from '@/lib/games/holeScope';
import type { HoleSegment } from '@/lib/scoring';
import type { GameMode } from '@/lib/scoring/modes/types';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';

// ─── Types ────────────────────────────────────────────────────────────────

/** One active game that may require admin action. */
export interface ActiveGameInput {
  id: string;
  name: string;
  requirePeerApproval: boolean;
  /**
   * Antall hull som skal til for «ferdig» for DENNE spilleren (#1441). Uten
   * feltet defaulter `classifyDeliveryStatus` til 18 — samme etablerte
   * mønster som `app/[locale]/admin/games/[id]/status/page.tsx` bruker
   * (`holeCountForSegment(game.hole_segment)`). Uten dette leser et komplett
   * 9-hulls segment-spill aldri som «klart» i Sekretariatets action-items.
   */
  expectedHoles?: number;
}

/** One player row from game_players, withdrawn players included. */
export interface ActivePlayerInput {
  gameId: string;
  submittedAt: string | null;
  approvedAt: string | null;
  withdrawnAt: string | null;
  /** Number of holes with a recorded stroke for this player in this game. */
  holesFilled: number;
}

/**
 * One active game that needs the admin (#2345, «Trenger deg»). The two counts
 * mirror endGame's finish-blockers: `notDelivered` is players who have filled
 * every hole but not submitted (`not_all_submitted`), `pendingApproval` is
 * submitted cards waiting for a peer approval (`not_all_approved`).
 */
export interface NeedsYouRow {
  gameId: string;
  name: string;
  notDelivered: number;
  pendingApproval: number;
  /** Every non-withdrawn player has submitted, so only approvals remain. */
  allDelivered: boolean;
}

/** One active game under «I dag» (#2345). */
export interface LiveRoundRow {
  gameId: string;
  name: string;
  /** Non-withdrawn players. */
  playerCount: number;
  /** Fewest filled holes among the players still playing; null otherwise. */
  hole: number | null;
  /**
   * `playing`: someone is mid-round. `done`: nobody is, and someone has
   * finished. `none`: nobody has entered a stroke.
   */
  state: 'playing' | 'done' | 'none';
}

// ─── Pure logic ───────────────────────────────────────────────────────────

function playersByGame(players: readonly ActivePlayerInput[]) {
  const byGame = new Map<string, ActivePlayerInput[]>();
  for (const p of players) {
    if (!byGame.has(p.gameId)) byGame.set(p.gameId, []);
    byGame.get(p.gameId)!.push(p);
  }
  return byGame;
}

function statusOf(game: ActiveGameInput, p: ActivePlayerInput) {
  return classifyDeliveryStatus({
    holesFilled: p.holesFilled,
    submittedAt: p.submittedAt,
    approvedAt: p.approvedAt,
    withdrawnAt: p.withdrawnAt,
    requirePeerApproval: game.requirePeerApproval,
    expectedHoles: game.expectedHoles,
  });
}

/**
 * «Trenger deg» (#2345): one row per active game with a card not delivered or
 * waiting for approval, undelivered games first. Pure, I/O-free.
 *
 * Rule home: the finish-blockers in `endGame` are the canonical definition;
 * `classifyDeliveryStatus` sorts each player into them. Withdrawn players
 * never count.
 */
export function needsYouRows(
  games: readonly ActiveGameInput[],
  players: readonly ActivePlayerInput[],
): NeedsYouRow[] {
  const byGame = playersByGame(players);
  const rows: NeedsYouRow[] = [];
  for (const game of games) {
    let active = 0;
    let submitted = 0;
    let notDelivered = 0;
    let pendingApproval = 0;
    for (const p of byGame.get(game.id) ?? []) {
      const status = statusOf(game, p);
      if (status === 'withdrawn') continue;
      active += 1;
      if (status === 'delivered' || status === 'pending_approval') submitted += 1;
      if (status === 'ready_not_delivered') notDelivered += 1;
      if (status === 'pending_approval') pendingApproval += 1;
    }
    if (notDelivered === 0 && pendingApproval === 0) continue;
    rows.push({
      gameId: game.id,
      name: game.name,
      notDelivered,
      pendingApproval,
      allDelivered: active > 0 && submitted === active,
    });
  }
  // Stable: undelivered games first, otherwise the order given.
  return rows.sort((a, b) => Number(b.notDelivered > 0) - Number(a.notDelivered > 0));
}

/**
 * «I dag» (#2345): one row per active game, in the order given. The hole is
 * the tail of the field: the fewest filled holes among the players still
 * playing. Pure, I/O-free.
 */
export function liveRoundRows(
  games: readonly ActiveGameInput[],
  players: readonly ActivePlayerInput[],
): LiveRoundRow[] {
  const byGame = playersByGame(players);
  return games.map((game) => {
    let playerCount = 0;
    let hole: number | null = null;
    let finished = false;
    for (const p of byGame.get(game.id) ?? []) {
      const status = statusOf(game, p);
      if (status === 'withdrawn') continue;
      playerCount += 1;
      if (status === 'playing') hole = hole === null ? p.holesFilled : Math.min(hole, p.holesFilled);
      if (status !== 'playing' && status !== 'not_started') finished = true;
    }
    const state = hole !== null ? 'playing' : finished ? 'done' : 'none';
    return { gameId: game.id, name: game.name, playerCount, hole, state };
  });
}

/** A roster row (withdrawn members included) tagged with its game. */
export type HolesRosterRow = FilledRosterRow & { game_id: string };

/** An entered-stroke `scores` row tagged with its game. */
export type HolesScoreRow = FilledScoreRow & { game_id: string };

/**
 * Filled holes per `${game_id}:${user_id}` across many games.
 *
 * Thin glue only: the rule lives in `filledHolesByPlayer` (#2017), which takes
 * one mode, so roster and rows are grouped per game and counted with that
 * game's `game_mode`. Counting a player's OWN rows instead left a patsome
 * partner stuck at 6/18 and never flagged (#2045).
 *
 * Pass withdrawn members in the roster — `teamScoreOwnerId` needs the whole
 * team to skip them. Scores must already be filtered to entered strokes.
 */
export function holesFilledByGame(opts: {
  games: readonly { id: string; game_mode: GameMode }[];
  players: readonly HolesRosterRow[];
  scores: readonly HolesScoreRow[];
}): Map<string, number> {
  const playersByGame = new Map<string, HolesRosterRow[]>();
  for (const p of opts.players) {
    if (!playersByGame.has(p.game_id)) playersByGame.set(p.game_id, []);
    playersByGame.get(p.game_id)!.push(p);
  }
  const scoresByGame = new Map<string, HolesScoreRow[]>();
  for (const s of opts.scores) {
    if (!scoresByGame.has(s.game_id)) scoresByGame.set(s.game_id, []);
    scoresByGame.get(s.game_id)!.push(s);
  }

  const holes = new Map<string, number>();
  for (const game of opts.games) {
    const filled = filledHolesByPlayer({
      players: playersByGame.get(game.id) ?? [],
      scores: scoresByGame.get(game.id) ?? [],
      mode: game.game_mode,
    });
    for (const [userId, count] of filled) {
      holes.set(`${game.id}:${userId}`, count);
    }
  }
  return holes;
}

// ─── Cached server helper ─────────────────────────────────────────────────

/**
 * Every active game with its players' delivery state (#2345): the input for
 * `needsYouRows` and `liveRoundRows`. Both sections of the morning report
 * read it, and `cache()` keeps it to a single round-trip per request.
 *
 * Null when a read fails: half a roster would show «Alle har levert» or a
 * wrong hole, so the sections show an error instead (#2490).
 *
 * Requires server context (RLS-enforced server client); do not call from
 * client components.
 */
export const getActiveRoundsDelivery = cache(
  async (): Promise<{ games: ActiveGameInput[]; players: ActivePlayerInput[] } | null> => {
    // Import here to keep this file importable in tests without server-only.
    const { getAdminContext } = await import(
      '@/app/[locale]/admin/_dashboardContext'
    );
    const { supabase } = await getAdminContext();

    // 1. Fetch all active games, the earliest started first.
    const { data: gamesData, error: gamesError } = await supabase
      .from('games')
      .select('id, name, require_peer_approval, hole_segment, game_mode')
      .eq('status', 'active')
      .order('started_at', { ascending: true, nullsFirst: false });

    if (gamesError) {
      console.error('[admin/activeRounds] games', gamesError);
      return null;
    }
    if (gamesData.length === 0) return { games: [], players: [] };

    // The rosters and strokes are filtered on the parent game's status, not
    // `.in('game_id', ids)`: a few hundred ids overrun PostgREST's URL limit
    // (400 failed on staging, #2214; it held 299 active games on 13.11), and
    // paging does not help. Both forms return the same rows.
    // A game that changes status between the reads is skipped by the helpers,
    // which walk `gamesData`.

    // 2. Fetch all game_players for those games. Withdrawn players stay in:
    //    `holesFilledByGame` needs the whole team to pick its row owner, and
    //    `classifyDeliveryStatus` reads them as `withdrawn` so they never count.
    const playersRes = await selectAllRowsResult(
      (from, to) =>
        supabase
          .from('game_players')
          .select(
            'game_id, user_id, team_number, submitted_at, approved_at, withdrawn_at, games!inner(status)',
          )
          .eq('games.status', 'active')
          .order('game_id')
          .order('user_id')
          .range(from, to),
      'getActiveRoundsDelivery game_players',
    );

    // 3. Fetch entered strokes for those games.
    const scoresRes = await selectAllRowsResult(
      (from, to) =>
        supabase
          .from('scores')
          .select('game_id, user_id, hole_number, games!inner(status)')
          .not('strokes', 'is', null)
          .eq('games.status', 'active')
          .order('id')
          .range(from, to),
      'getActiveRoundsDelivery scores',
    );

    if (playersRes.data === null || scoresRes.data === null) {
      console.error('[admin/activeRounds]', playersRes.error ?? scoresRes.error);
      return null;
    }
    const playerRows = playersRes.data;

    // #2017/#2045: count via the team card's row owner, per hole — the same rule
    // as the reminder. Own rows left a patsome partner at 6/18, never flagged.
    const holesMap = holesFilledByGame({
      games: gamesData.map((g) => ({
        id: g.id,
        // DB type is `string`; games_game_mode_check (0111) constrains it to GameMode.
        game_mode: g.game_mode as GameMode,
      })),
      players: playerRows,
      scores: scoresRes.data,
    });

    const games: ActiveGameInput[] = gamesData.map((g) => ({
      id: g.id,
      name: g.name,
      requirePeerApproval: g.require_peer_approval ?? false,
      // #1441 — front9/back9-spill er «ferdig» ved 9 hull, ikke 18.
      expectedHoles: holeCountForSegment(g.hole_segment as HoleSegment),
    }));

    const players: ActivePlayerInput[] = playerRows.map((p) => ({
      gameId: p.game_id,
      submittedAt: p.submitted_at,
      approvedAt: p.approved_at,
      withdrawnAt: p.withdrawn_at,
      holesFilled: holesMap.get(`${p.game_id}:${p.user_id}`) ?? 0,
    }));

    return { games, players };
  },
);
