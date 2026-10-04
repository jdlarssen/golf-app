import type { GameMode, HoleSegment } from '@/lib/scoring';
import { splitFinishRoster, stampsFromRow } from './finishGate';
import { ownedScoresByPlayer, type FilledScoreRow } from './filledHoles';
import { flightBuckets } from './flightScope';
import {
  holeCountForSegment,
  holeNumbersForSegment,
  positionInSegment,
} from './holeScope';
import type { StartType } from './startType';

export { elapsedParts } from './elapsed';

// The organiser's desk (arrangørpulten, #2268): what the admin page shows while
// a round is in progress. Pure rules, no rendering; #2269 (Klubbhuset) reuses
// `deliveryCounts`.
//
// Two homes count deliveries, and they answer different questions:
//
//  - `deliveryCounts` here counts what the finish gate counts
//    (`splitFinishRoster` in `./finishGate.ts`): who is active, who has not
//    delivered, who waits for a peer approval. The desk's header and its
//    «Avslutt spillet» bar read it, so they can never disagree with `endGame`.
//  - `classifyDeliveryStatus` (`./deliveryStatus.ts`) needs hole progress and
//    answers «who gets a reminder». The status page and the club house's action
//    items (`lib/admin/actionItems.ts`) read it.
//
// A new surface picks one of the two. Do not write a third.

/** The roster columns the desk reads. Snake_case, as PostgREST returns them. */
export type DeskPlayer = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  submitted_at: string | null;
  withdrawn_at: string | null;
};

export type DeliveryCounts = {
  /** Active (not withdrawn) players: the «av Y». */
  total: number;
  /** Active players who have delivered: the «X». */
  submitted: number;
  notSubmitted: number;
  /** Active players waiting for a peer approval; 0 without peer approval. */
  pendingApproval: number;
};

/**
 * «Levert scorekort X av Y» and the finish bar's blockers, from the finish
 * gate's own lists. Withdrawn players are out of every count.
 */
export function deliveryCounts<
  T extends {
    submitted_at: string | null;
    approved_at: string | null;
    withdrawn_at: string | null;
  },
>(players: readonly T[], requirePeerApproval: boolean): DeliveryCounts {
  const { active, missing, unapproved } = splitFinishRoster(
    players,
    stampsFromRow,
    requirePeerApproval,
  );
  return {
    total: active.length,
    submitted: active.length - missing.length,
    notSubmitted: missing.length,
    pendingApproval: unapproved.length,
  };
}

/**
 * What the «Avslutt spillet» bar can offer:
 *
 *  - `no_active`: everyone has withdrawn. The page shows no finish bar, a
 *    deliberate UI choice even though the gate itself would accept the finish
 *    (it counts raw rows).
 *  - `ready`: everyone has delivered (and been approved, with peer approval).
 *  - `only_missing`: missing deliveries are the only blocker, so «Avslutt
 *    likevel» (#375) is on offer.
 *  - `blocked`: a scorecard waits for approval. `allowMissing` never relaxes
 *    that (`finishGate`), so there is no «Avslutt likevel».
 */
export type EndGameReadiness = 'no_active' | 'ready' | 'only_missing' | 'blocked';

export function endGameReadiness(counts: DeliveryCounts): EndGameReadiness {
  if (counts.total === 0) return 'no_active';
  if (counts.pendingApproval > 0) return 'blocked';
  return counts.notSubmitted === 0 ? 'ready' : 'only_missing';
}

type DeskInput = {
  /** The whole roster, withdrawn included: the team's row owner needs it. */
  players: readonly DeskPlayer[];
  /** Progress rows, already filtered to entered strokes (`FilledScoreRow`). */
  scores: readonly FilledScoreRow[];
  mode: GameMode;
  holeSegment: HoleSegment;
  startType: StartType;
};

export type ScoreGap = {
  /** One player, or teammates whose missing holes are the same. */
  userIds: string[];
  /** Real hole numbers, in segment order. */
  holes: number[];
  /** The last hole the row's players have entered (real number). */
  lastHole: number;
};

/**
 * Holes a player skipped: in the game's segment, before the last hole they
 * entered, and not entered. Only players who are neither withdrawn nor
 * delivered get rows, and the rows they fill come from `ownedScoresByPlayer`
 * (team cards and a captain change are covered there).
 *
 * Teammates (same non-null `team_number`) with the same missing holes share
 * one row. Rows come in roster order.
 *
 * A shotgun round gives no rows: the database does not store which hole each
 * group started on, so «before the last entered hole» means nothing when the
 * group started on hole 10.
 */
export function findScoreGaps(input: DeskInput): ScoreGap[] {
  if (input.startType === 'shotgun') return [];

  const segmentHoles = holeNumbersForSegment(input.holeSegment);
  const owned = ownedScoresByPlayer({
    players: input.players,
    scores: input.scores,
    mode: input.mode,
  });

  const gaps: (ScoreGap & { team: number | null })[] = [];
  for (const p of input.players) {
    if (p.withdrawn_at != null || p.submitted_at != null) continue;
    const entered = new Set(
      (owned.get(p.user_id) ?? [])
        .map((r) => r.hole_number)
        .filter((h) => segmentHoles.includes(h)),
    );
    if (entered.size === 0) continue;
    const lastPosition = Math.max(
      ...[...entered].map((h) => positionInSegment(h, input.holeSegment)),
    );
    const missing = segmentHoles.filter(
      (h, i) => i + 1 < lastPosition && !entered.has(h),
    );
    if (missing.length === 0) continue;
    const lastHole = segmentHoles[lastPosition - 1];

    const mate =
      p.team_number == null
        ? undefined
        : gaps.find(
            (g) => g.team === p.team_number && sameHoles(g.holes, missing),
          );
    if (mate) {
      mate.userIds.push(p.user_id);
      mate.lastHole = Math.max(mate.lastHole, lastHole);
    } else {
      gaps.push({ userIds: [p.user_id], holes: missing, lastHole, team: p.team_number });
    }
  }
  return gaps.map(({ userIds, holes, lastHole }) => ({ userIds, holes, lastHole }));
}

function sameHoles(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((h, i) => h === b[i]);
}

/**
 * The group a progress row is about. `side` only in singles matchplay set up
 * with each side in its own flight (the wizard's layout); a cup-made singles
 * match has both sides in flight 1 and reads «Flight 1».
 */
export type ProgressLabel =
  | { kind: 'flight' | 'side'; n: number }
  | { kind: 'all' }
  | { kind: 'none' };

export type FlightProgress = {
  label: ProgressLabel;
  /** The group's active players, in roster order. */
  userIds: string[];
  /** Holes in the game's segment (the «av 9»). */
  holeCount: number;
  /**
   * The group's furthest hole, real number. Null when the group has entered
   * nothing, and always null in a shotgun round (the order is unknown).
   */
  maxHole: number | null;
  /** Holes played as a position in the segment: the bar is `position / holeCount`. */
  position: number;
  /** Same as `position`; in a shotgun round, the distinct holes entered. */
  played: number;
  /** Every active player in the group has delivered. */
  allSubmitted: boolean;
  startType: StartType;
};

/**
 * How far each group has come, grouped on `flight_number` (active players
 * only). With no flights at all there is one group, «Alle spillere»; when some
 * players have a flight and some do not, the rest form «Uten flight», last.
 *
 * A first-tee group is at its largest entered hole, as a position in the
 * segment, so a back9 group on hole 12 is 3 of 9 and never «12 of 9». A
 * shotgun group counts its distinct entered holes instead: one that has played
 * 15-18 and 1 has played 5, not 18.
 */
export function flightProgress(input: DeskInput): FlightProgress[] {
  const segmentHoles = holeNumbersForSegment(input.holeSegment);
  const holeCount = holeCountForSegment(input.holeSegment);
  const owned = ownedScoresByPlayer({
    players: input.players,
    scores: input.scores,
    mode: input.mode,
  });

  const { assigned, unassigned } = flightBuckets(input.players);
  const active = input.players.filter((p) => p.withdrawn_at == null);
  const asSides =
    input.mode === 'singles_matchplay' &&
    active.length > 0 &&
    active.every((p) => p.flight_number != null && p.flight_number === p.team_number);

  const groups: { label: ProgressLabel; members: DeskPlayer[] }[] = [];
  if (assigned.size === 0) {
    if (unassigned.length > 0) groups.push({ label: { kind: 'all' }, members: unassigned });
  } else {
    for (const n of [...assigned.keys()].sort((a, b) => a - b)) {
      groups.push({
        label: { kind: asSides ? 'side' : 'flight', n },
        members: assigned.get(n) ?? [],
      });
    }
    if (unassigned.length > 0) groups.push({ label: { kind: 'none' }, members: unassigned });
  }

  return groups.map(({ label, members }) => {
    const entered = new Set(
      members
        .flatMap((p) => owned.get(p.user_id) ?? [])
        .map((r) => r.hole_number)
        .filter((h) => segmentHoles.includes(h)),
    );
    let maxHole: number | null = null;
    let position: number;
    if (input.startType === 'shotgun') {
      position = entered.size;
    } else {
      position = entered.size === 0
        ? 0
        : Math.max(...[...entered].map((h) => positionInSegment(h, input.holeSegment)));
      maxHole = position === 0 ? null : segmentHoles[position - 1];
    }
    return {
      label,
      userIds: members.map((p) => p.user_id),
      holeCount,
      maxHole,
      position,
      played: position,
      allSubmitted: members.every((p) => p.submitted_at != null),
      startType: input.startType,
    };
  });
}

/**
 * Where a skipped-hole row says its player is: the group's label from
 * `flightProgress`, so «Trenger deg» and «Flightene» never name a group
 * differently. A numbered group (flight or side) gives the group's furthest
 * hole («Flight 2 er på hull 12»); «Alle spillere» and «Uten flight» give the
 * player's own last entered hole («Har ført til hull 8»), since another player
 * in that group can be far ahead. Real hole numbers throughout.
 */
export function gapLocation(
  gap: ScoreGap,
  groups: readonly FlightProgress[],
): { label: ProgressLabel; hole: number } {
  const group = groups.find((g) => g.userIds.includes(gap.userIds[0]));
  if (!group) return { label: { kind: 'none' }, hole: gap.lastHole };
  const numbered = group.label.kind === 'flight' || group.label.kind === 'side';
  return { label: group.label, hole: numbered ? (group.maxHole ?? gap.lastHole) : gap.lastHole };
}

/**
 * Who a «Påminn» on a skipped-hole row reaches (#2268, the owner's choice B),
 * and about which holes. The server recomputes the gaps when the button is
 * pressed, so the reminder goes out only if the row still exists: the hole
 * gets a score or the card is delivered in between, and there is nobody to
 * remind. The row is the gap that holds a pressed player; teammates on one
 * shared card are one row and are reminded together.
 *
 * Guests are left out, as from the delivery reminder: their placeholder
 * address cannot receive anything, and the one who keeps their card enters
 * the hole. A row of guests only comes back with no `userIds`: it still exists,
 * there is just no one in it to remind (the desk shows no button for it).
 * Null only when the row is gone.
 */
export function missingScoreTargets<P extends { user_id: string; is_guest?: boolean | null }>(
  gaps: readonly ScoreGap[],
  players: readonly P[],
  pressedUserIds: readonly string[],
): { userIds: string[]; holes: number[] } | null {
  const gap = gaps.find((g) => g.userIds.some((id) => pressedUserIds.includes(id)));
  if (!gap) return null;
  const guests = new Set(players.filter((p) => p.is_guest).map((p) => p.user_id));
  return { userIds: gap.userIds.filter((id) => !guests.has(id)), holes: gap.holes };
}

export type PultTab = 'live' | 'players' | 'setup';

// Redirect codes from the roster actions (`actions.ts`): withdraw and reinstate.
const PLAYERS_CODES = new Set([
  'player_withdrawn',
  'player_reinstated',
  'withdraw_stale',
  'reinstate_stale',
]);

// Redirect codes from the team and flight actions (`flightActions.ts`); teams and
// flights live behind «Oppsett». `db_roster` only comes from those actions.
const SETUP_CODES = new Set([
  'flight_suggested',
  'flight_updated',
  'team_suggested',
  'team_updated',
  'bad_flight',
  'flight_full',
  'bad_team',
  'team_full',
  'db_roster',
]);

/**
 * The tab the desk opens on: the one where the action that redirected here
 * lives, so the organiser sees the result. Anything else opens on «Live»; the
 * banner stands above the tabs either way.
 */
export function pultInitialTab(sp: { status?: string; error?: string }): PultTab {
  const codes = [sp.status, sp.error];
  if (codes.some((c) => c != null && PLAYERS_CODES.has(c))) return 'players';
  if (codes.some((c) => c != null && SETUP_CODES.has(c))) return 'setup';
  return 'live';
}
