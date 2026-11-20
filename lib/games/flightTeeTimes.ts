/**
 * Start time per flight (#2451): when a round has more than one start group,
 * group N goes out (N − 1) × the interval after the first tee-off. «09:00
 * Flight 1, 09:10 Flight 2, 09:20 Flight 3».
 *
 * The one home of the rule. The time is never stored: it is worked out every
 * time from `games.scheduled_tee_off_at`, the player's start group and
 * `games.tee_interval_minutes` (0243). The wizard, the Startlista, «Klar for i
 * morgen?», the waiting room, the varsler and the cup
 * (`resolveScheduledTeeOffAt`) all read it from here.
 *
 * Import-pure on purpose (no Supabase, no `server-only`, no `Intl`), like
 * `flightScope.ts` and `startlist.ts`: the app imports it by path. Times go
 * in and out as ISO strings; the surfaces format them with the Oslo helpers.
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import {
  MAX_FLIGHT_SIZE,
  activePlayers,
  flightIsFreeGrouping,
  isSingleFlightGame,
} from './flightScope';

/** The minutes the organiser can choose between two start groups. */
export const TEE_INTERVAL_CHOICES = [8, 10, 12] as const;

export type TeeInterval = (typeof TEE_INTERVAL_CHOICES)[number];

/** Ten minutes, as on a real course and in the cup. */
export const DEFAULT_TEE_INTERVAL_MINUTES: TeeInterval = 10;

/** True for 8, 10 or 12. The CHECK `games_tee_interval_minutes_choices` agrees. */
export function isTeeInterval(value: unknown): value is TeeInterval {
  return (TEE_INTERVAL_CHOICES as readonly unknown[]).includes(value);
}

/**
 * Formats that always go out as one group, whatever the flight number says:
 * matchplay (the flight is the side, and no side goes out after the other),
 * wolf, round robin, acey deucey and nines.
 */
const ONE_GROUP_MODES: ReadonlySet<GameMode> = new Set<GameMode>([
  'singles_matchplay',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
  'wolf',
  'round_robin',
  'acey_deucey',
  'nines',
]);

/**
 * The start group a player goes out with: everyone who tees off together, up
 * to four. Not always `flight_number`, which is the side in matchplay and the
 * team in most team formats (`useGameFormState`), and which this never changes.
 *
 *  - Always one group (`ONE_GROUP_MODES`): 1.
 *  - Free grouping (`flightIsFreeGrouping`) and best ball: the flight, set on
 *    the Startlista or in step 4. `null` while the player has none.
 *  - Other team formats: `ceil(team / floor(4 / teamSize))`. Teams of 3 or 4
 *    go out one team per group; pairs two pairs per group, like
 *    `defaultFlightForTeam`. `null` while the player has no team.
 *
 * A team that withdraws leaves a gap in the team numbers, so a pair can go out
 * alone. Best ball does the same; it is accepted (contract V1).
 */
export function startGroupFor({
  gameMode,
  teamSize,
  flightNumber,
  teamNumber,
}: {
  gameMode: GameMode;
  teamSize: number;
  flightNumber: number | null;
  teamNumber: number | null;
}): number | null {
  if (ONE_GROUP_MODES.has(gameMode)) return 1;
  if (gameMode === 'best_ball' || flightIsFreeGrouping(gameMode, teamSize)) {
    return flightNumber ?? null;
  }
  if (teamNumber == null) return null;
  const teamsPerGroup = Math.max(1, Math.floor(MAX_FLIGHT_SIZE / Math.max(1, teamSize)));
  return Math.ceil(teamNumber / teamsPerGroup);
}

/**
 * When start group `group` goes out: group 1 (or lower) at `firstTeeOffIso`,
 * returned unchanged; group N at `firstTeeOffIso + (N − 1) × intervalMinutes`.
 * The sum is in real minutes, so a group still goes out ten minutes after the
 * one before when the clocks change in between.
 */
export function startGroupTeeOffAt(
  firstTeeOffIso: string,
  group: number,
  intervalMinutes: number,
): string {
  if (group <= 1) return firstTeeOffIso;
  const offsetMs = (group - 1) * intervalMinutes * 60 * 1000;
  return new Date(new Date(firstTeeOffIso).getTime() + offsetMs).toISOString();
}

/** A roster row as the rule needs it. Callers map their own rows down. */
export type TeeTimePlayer = {
  user_id: string;
  flight_number: number | null;
  team_number: number | null;
  withdrawn_at: string | null;
};

/**
 * The round as the rule needs it. `team_size` is `expectedTeamSize(mode_config)`;
 * `tee_interval_minutes` `null` means everyone goes out at the tee-off.
 */
export type TeeTimeRound<P extends TeeTimePlayer = TeeTimePlayer> = {
  game_mode: GameMode;
  team_size: number;
  scheduled_tee_off_at: string | null;
  tee_interval_minutes: number | null;
  players: readonly P[];
};

export type StartGroup<P extends TeeTimePlayer = TeeTimePlayer> = {
  group: number;
  /** Minutes after the first tee-off: 0, 10, 20 … (0 for all with no interval). */
  offsetMinutes: number;
  /** The group's clock time, or `null` when the round has no tee-off yet. */
  teeOffAt: string | null;
  /** The active players in the group, in the order the caller passed them. */
  players: P[];
};

function groupOf(round: TeeTimeRound, player: TeeTimePlayer): number | null {
  return startGroupFor({
    gameMode: round.game_mode,
    teamSize: round.team_size,
    flightNumber: player.flight_number,
    teamNumber: player.team_number,
  });
}

/**
 * The round's start groups, by number, or an empty list when the round is one
 * group: four or fewer active players, wolf (`isSingleFlightGame`), or every
 * active player in the same group. Withdrawn players and players without a
 * group are left out. With no interval every group gets offset 0 and the
 * tee-off itself, so the Startlista can show the cards before times are on.
 */
export function startGroupsOf<P extends TeeTimePlayer>(round: TeeTimeRound<P>): StartGroup<P>[] {
  const active = activePlayers(round.players);
  if (isSingleFlightGame(round.game_mode, [...active])) return [];
  const byGroup = new Map<number, P[]>();
  for (const p of active) {
    const group = groupOf(round, p);
    if (group == null) continue;
    byGroup.set(group, [...(byGroup.get(group) ?? []), p]);
  }
  if (byGroup.size <= 1) return [];
  const interval = round.tee_interval_minutes ?? 0;
  return [...byGroup.entries()]
    .sort(([a], [b]) => a - b)
    .map(([group, players]) => ({
      group,
      offsetMinutes: (group - 1) * interval,
      teeOffAt:
        round.scheduled_tee_off_at == null
          ? null
          : startGroupTeeOffAt(round.scheduled_tee_off_at, group, interval),
      players,
    }));
}

/**
 * The player's own start time, or `null` when they go out at the round's
 * tee-off like everyone else: no tee-off, no interval, one group, a withdrawn
 * player or a player without a group yet. Group 1 gets a time too, so the
 * first flight reads «Du går ut 09:00 i flight 1».
 */
export function playerTeeOff(
  round: TeeTimeRound,
  player: TeeTimePlayer,
): { teeOffAt: string; group: number } | null {
  if (round.scheduled_tee_off_at == null || round.tee_interval_minutes == null) return null;
  if (player.withdrawn_at != null) return null;
  const group = groupOf(round, player);
  if (group == null) return null;
  const groups = startGroupsOf(round);
  if (!groups.some((g) => g.group === group)) return null;
  return {
    teeOffAt: startGroupTeeOffAt(round.scheduled_tee_off_at, group, round.tee_interval_minutes),
    group,
  };
}

/** The time the player actually has: their own, else the round's tee-off. */
function effectiveTeeOff(round: TeeTimeRound, player: TeeTimePlayer): string | null {
  return playerTeeOff(round, player)?.teeOffAt ?? round.scheduled_tee_off_at;
}

/**
 * The players whose time changed between two readings of the same round: a
 * player moved to another flight or team, a new interval, the times turned on
 * or off, or a round that dropped to one group. Only players active in both,
 * in `after`'s order: a newcomer gets an invitation, not a change, and a
 * withdrawn player gets nothing. Instants are compared, not strings, since
 * Supabase and `toISOString` write the same time differently. A player with no
 * time after the change is left out: there is nothing to tell them.
 */
export function teeTimeChanges(
  before: TeeTimeRound,
  after: TeeTimeRound,
): { userId: string; teeOffAt: string }[] {
  const beforeById = new Map(
    activePlayers(before.players).map((p) => [p.user_id, p] as const),
  );
  const changes: { userId: string; teeOffAt: string }[] = [];
  for (const p of activePlayers(after.players)) {
    const was = beforeById.get(p.user_id);
    if (!was) continue;
    const now = effectiveTeeOff(after, p);
    if (now == null) continue;
    const then = effectiveTeeOff(before, was);
    if (then != null && new Date(then).getTime() === new Date(now).getTime()) continue;
    changes.push({ userId: p.user_id, teeOffAt: now });
  }
  return changes;
}
