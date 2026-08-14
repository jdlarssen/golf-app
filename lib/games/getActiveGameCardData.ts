import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { GameMode } from '@/lib/scoring/modes/types';
import { modeCollapsesToTeamCard } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import { holeNumbersForSegment, lastHoleForSegment } from './holeScope';
import { pendingApprovalsFor } from './flightScope';
import { teamScoreOwnerId } from './teamCaptain';
import { resolveActiveCardState, type ActiveCardState } from './activeCardState';

/** The active-game fields the Home card needs to resolve state, route, and count approvals. */
export type ActiveGameForCard = {
  id: string;
  game_mode: GameMode;
  require_peer_approval: boolean;
  submitted_at: string | null;
  withdrawn_at: string | null;
  approved_at: string | null;
  /**
   * #1441: limits «all holes filled» to the game's segment (9 for
   * front9/back9, 18 for 'full') so a completed 9-hole round links to
   * /submit instead of an out-of-scope hole.
   */
  hole_segment: HoleSegment;
};

export type ActiveCardExtras = {
  state: ActiveCardState;
  /** Where the card links. «Continue» → next unfilled hole / submit; else → game overview. */
  href: string;
  /** Flight-peers who submitted but await THIS user's approval (0 unless peer approval applies). */
  pendingApprovalsForMe: number;
  /**
   * #1449: the next unscored hole in THIS game when `state === 'continue'` and
   * holes remain, else `null` (all scored, or a non-continue state). Lets the
   * split-day pair merge route across both halves (front9's next hole, then
   * back9's) without re-parsing `href`.
   */
  nextHole: number | null;
};

type MateRow = {
  game_id: string;
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
};

/**
 * Who owns the shared scores row in each of `gameIds`, from the viewer's seat
 * (#1538). A game is absent from the result when the viewer already owns the
 * card themselves, when they have no team number, or when the roster came back
 * empty — RLS grants the roster per flight, and a team split across flights
 * reads as nothing. Every one of those means the same thing to the caller:
 * count the viewer's own rows, as before.
 */
function captainsForViewer(
  roster: MateRow[],
  gameIds: string[],
  userId: string,
): Map<string, string> {
  const captainByGame = new Map<string, string>();
  for (const gameId of gameIds) {
    const gameRoster = roster.filter((r) => r.game_id === gameId);
    const meRow = gameRoster.find((r) => r.user_id === userId);
    if (!meRow || meRow.team_number == null) continue;
    const ownerId = teamScoreOwnerId(
      gameRoster.filter((r) => r.team_number === meRow.team_number),
    );
    if (ownerId && ownerId !== userId) captainByGame.set(gameId, ownerId);
  }
  return captainByGame;
}

/**
 * Resolves per-active-game card data for Home (#878): the display state, the
 * tap target («rett inn i runden» for active rounds, overview otherwise), and
 * the peer-approval count. Two scoped queries at most — scores for the rounds
 * still in progress, and game_players for the games that need a roster (peer
 * approval, plus the team-collapsed rounds below) — bounded by the user's
 * handful of active games, never N+1.
 *
 * #1538: in team-collapsed modes (scramble family, alternate-shot matchplay,
 * patsome from hole 7) the whole team taps into ONE scores row owned by the
 * captain, so counting the viewer's own rows told the mate they had played
 * nothing and sent them back to hole 1. Those rounds count {viewer, captain}
 * instead. The two queries then run in sequence rather than in parallel — the
 * captain id has to come back before the scores query knows whose rows to ask
 * for — and only for those rounds; everything else still overlaps.
 *
 * Degrades safely: on any query error the affected game falls back to the
 * segment's first hole with zero pending approvals, so the card always
 * renders. An unreadable roster (a team split across flights, which RLS does
 * not grant across) degrades one step further, to the viewer's own rows.
 */
export async function getActiveGameCardData(
  supabase: SupabaseClient<Database>,
  userId: string,
  games: ActiveGameForCard[],
): Promise<Map<string, ActiveCardExtras>> {
  const states = new Map<string, ActiveCardState>(
    games.map((g) => [g.id, resolveActiveCardState(g)]),
  );

  // Only rounds still in progress need a next-hole lookup; the roster is
  // needed by peer-approval games (who owes me an approval) and by
  // team-collapsed rounds (whose rows count as mine).
  const continueGames = games.filter((g) => states.get(g.id) === 'continue');
  const continueIds = continueGames.map((g) => g.id);
  const approvalGames = games.filter((g) => g.require_peer_approval);

  // Patsome only collapses from hole 7, so the question here is «does this
  // round collapse at any point» — ask at its last hole.
  const collapsedGames = continueGames.filter((g) =>
    modeCollapsesToTeamCard(g.game_mode, lastHoleForSegment(g.hole_segment)),
  );

  const rosterIds = [
    ...new Set([...approvalGames, ...collapsedGames].map((g) => g.id)),
  ];

  const matesPromise: Promise<{ data: MateRow[] | null }> = rosterIds.length
    ? (async () =>
        (await supabase
          .from('game_players')
          .select(
            'game_id, user_id, team_number, flight_number, submitted_at, approved_at, withdrawn_at',
          )
          .in('game_id', rosterIds)) as { data: MateRow[] | null })()
    : Promise.resolve({ data: [] });

  const captainByGame = collapsedGames.length
    ? captainsForViewer(
        (await matesPromise).data ?? [],
        collapsedGames.map((g) => g.id),
        userId,
      )
    : new Map<string, string>();

  const scoreUserIds = [...new Set([userId, ...captainByGame.values()])];

  const [scoresRes, matesRes] = await Promise.all([
    continueIds.length
      ? supabase
          .from('scores')
          .select('game_id, hole_number, user_id')
          .in('game_id', continueIds)
          .in('user_id', scoreUserIds)
          .not('strokes', 'is', null)
      : Promise.resolve({ data: [], error: null }),
    matesPromise,
  ]);

  const modeByGame = new Map(continueGames.map((g) => [g.id, g.game_mode]));

  const filledByGame = new Map<string, Set<number>>();
  for (const r of scoresRes.data ?? []) {
    // Attribute every row to the game it came from: the same person can own
    // the shared card in one round and play their own ball in another, so a
    // flat {viewer, captains} union would count their rows everywhere and
    // skip holes the viewer still has to play. A captain's row also only
    // counts on holes where the mode actually collapses — patsome's 4BBB
    // half (1-6) is per-player even though its foursomes half is not.
    if (r.user_id !== userId) {
      if (captainByGame.get(r.game_id) !== r.user_id) continue;
      const mode = modeByGame.get(r.game_id);
      if (!mode || !modeCollapsesToTeamCard(mode, r.hole_number)) continue;
    }
    let set = filledByGame.get(r.game_id);
    if (!set) {
      set = new Set<number>();
      filledByGame.set(r.game_id, set);
    }
    set.add(r.hole_number);
  }

  const matesByGame = new Map<string, MateRow[]>();
  for (const r of (matesRes.data ?? []) as MateRow[]) {
    const list = matesByGame.get(r.game_id);
    if (list) list.push(r);
    else matesByGame.set(r.game_id, [r]);
  }

  const result = new Map<string, ActiveCardExtras>();
  for (const g of games) {
    const state = states.get(g.id) ?? 'continue';

    let href = `/games/${g.id}`;
    let nextHole: number | null = null;
    if (state === 'continue') {
      const filled = filledByGame.get(g.id) ?? new Set<number>();
      const holeNumbers = holeNumbersForSegment(g.hole_segment);
      if (filled.size >= holeNumbers.length) {
        href = `/games/${g.id}/submit`;
      } else {
        let next = holeNumbers[0];
        for (const h of holeNumbers) {
          if (!filled.has(h)) {
            next = h;
            break;
          }
        }
        nextHole = next;
        href = `/games/${g.id}/holes/${next}`;
      }
    }

    let pendingApprovalsForMe = 0;
    if (g.require_peer_approval) {
      // #543/#1359: the attestation rule has one home — the same selector the
      // /approve page renders from, so this badge can't promise a card the
      // page won't show.
      pendingApprovalsForMe = pendingApprovalsFor(
        matesByGame.get(g.id) ?? [],
        g.game_mode,
        userId,
      ).length;
    }

    result.set(g.id, { state, href, pendingApprovalsForMe, nextHole });
  }

  return result;
}
