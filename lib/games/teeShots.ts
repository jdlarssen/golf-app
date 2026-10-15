import { isScrambleFamily, type GameMode } from '../scoring/modes/types';
import { deliveryCoversWholeTeam } from './teamDelivery';

/**
 * «Hvem sitt utslag» (#2580): the one TypeScript home of the tee-shot rule.
 *
 * The organiser can require every player on a scramble or shamble team to
 * have at least N of the team's tee shots used over the 18 holes. The team
 * records whose tee shot it played on each hole (`team_tee_shots`), and no
 * card can be delivered while anyone is short. The rule never touches the
 * scoring: it only changes what the team must record.
 *
 * Every surface asks here: the wizard's «går ikke» tiles, the validator, the
 * hole page (web and app), the delivery (web, app and server) and the
 * organiser's pages. The SQL mirror lives in
 * `supabase/migrations/0209_team_tee_shots.sql` (`team_tee_shot_shortfall`,
 * the CHECK `games_min_tee_shots_valid` and the delivery branches of
 * `set_team_tee_shot_if_newer`); `supabase/tests/team_tee_shots_test.sql`
 * pins that the two agree (trap 4).
 *
 * Pure: no React, Dexie or server code, so the native app imports it too.
 */

/** The scramble family and shamble always play the full round (#2265). */
export const TEE_SHOT_HOLES = 18;

export const MIN_TEE_SHOTS_OPTIONS = [3, 4, 5, 6] as const;
export type MinTeeShots = (typeof MIN_TEE_SHOTS_OPTIONS)[number];

/** Name of both the `mode_config` key and the form field. */
export const MIN_TEE_SHOTS_FIELD = 'min_tee_shots' as const;

/** The formats where the organiser can turn the setting on. */
export function formatTracksTeeShots(mode: GameMode): boolean {
  return isScrambleFamily(mode) || mode === 'shamble';
}

function isOption(min: number): min is MinTeeShots {
  return (MIN_TEE_SHOTS_OPTIONS as readonly number[]).includes(min);
}

/**
 * Does a minimum of `min` per player fit on the round? Every player needs
 * `min` holes of their own, so `min × teamSize` may not exceed the holes.
 */
export function minTeeShotsFeasible(min: number, teamSize: number, holeCount: number = TEE_SHOT_HOLES): boolean {
  return isOption(min) && min * teamSize <= holeCount;
}

/** The highest option that fits, or null when not even the lowest does. */
export function highestFeasibleMinTeeShots(teamSize: number, holeCount: number = TEE_SHOT_HOLES): MinTeeShots | null {
  for (let i = MIN_TEE_SHOTS_OPTIONS.length - 1; i >= 0; i -= 1) {
    const option = MIN_TEE_SHOTS_OPTIONS[i];
    if (minTeeShotsFeasible(option, teamSize, holeCount)) return option;
  }
  return null;
}

/** Picked when the organiser turns the setting on, as the artboard draws it. */
export const DEFAULT_MIN_TEE_SHOTS: MinTeeShots = 4;

/** The minimum to pre-select for a team size: 4, or the highest that fits. */
export function defaultMinTeeShots(teamSize: number): MinTeeShots | null {
  return minTeeShotsFeasible(DEFAULT_MIN_TEE_SHOTS, teamSize)
    ? DEFAULT_MIN_TEE_SHOTS
    : highestFeasibleMinTeeShots(teamSize);
}

/**
 * Keeps a chosen minimum when it still fits a new team size; otherwise the
 * highest that does (a four-player team with 6 chosen gets 4). Null stays null.
 */
export function clampMinTeeShots(min: MinTeeShots | null, teamSize: number): MinTeeShots | null {
  if (min === null || minTeeShotsFeasible(min, teamSize)) return min;
  return highestFeasibleMinTeeShots(teamSize);
}

/** The options that do not fit 18 holes for the team size: the wizard's «går ikke». */
export function infeasibleMinTeeShots(teamSize: number): MinTeeShots[] {
  return MIN_TEE_SHOTS_OPTIONS.filter((option) => !minTeeShotsFeasible(option, teamSize));
}

/** Holes the team may give anyone once every player has the minimum. */
export function freeHolesAtMinimum(min: number, teamSize: number, holeCount: number = TEE_SHOT_HOLES): number {
  return holeCount - min * teamSize;
}

/** A stored or posted value back to an option, or null. */
export function asMinTeeShots(value: unknown): MinTeeShots | null {
  return typeof value === 'number' && isOption(value) ? value : null;
}

/**
 * The one reader of the setting, for web, app and server. Null when the key
 * is missing (the setting is off, and every game from before #2580), is not a
 * number among the options, does not fit the team size, or the format does
 * not count tee shots.
 */
export function readMinTeeShots(mode: GameMode, modeConfig: unknown): MinTeeShots | null {
  if (!formatTracksTeeShots(mode)) return null;
  if (typeof modeConfig !== 'object' || modeConfig === null) return null;
  const config = modeConfig as Record<string, unknown>;
  const value = asMinTeeShots(config[MIN_TEE_SHOTS_FIELD]);
  if (value === null) return null;
  const teamSize = config.team_size;
  if (typeof teamSize === 'number' && !minTeeShotsFeasible(value, teamSize)) return null;
  return value;
}

export interface TeeShotPick {
  holeNumber: number;
  /** Whose tee shot the team played; null = the choice was cleared. */
  teeShotBy: string | null;
}

export interface TeeShotStatusInput {
  minimum: number;
  /** The team's active members (`withdrawn_at` null), in team order. */
  memberIds: readonly string[];
  picks: readonly TeeShotPick[];
  /** The holes of the round; 1–18 when left out. */
  holeNumbers?: readonly number[];
}

export interface TeeShotPlayerStatus {
  userId: string;
  count: number;
  /** `minimum − count`, never below 0. */
  missing: number;
}

export interface TeeShotStatus {
  minimum: number;
  /** One row per active member, in team order. */
  players: TeeShotPlayerStatus[];
  totalShort: number;
  /** Holes without a choice, skipped holes included. */
  openHoles: number[];
  /**
   * `totalShort − openHoles.length`. Above 0: the team is already short and
   * must swap on chosen holes. Below 0: that many holes are free to choose.
   */
  excess: number;
  /** The members who are short: biggest shortfall first, ties in team order. */
  short: TeeShotPlayerStatus[];
  /** Members above the minimum, in team order. */
  surplusPlayers: string[];
  canDeliver: boolean;
}

const ALL_HOLES = Array.from({ length: TEE_SHOT_HOLES }, (_, i) => i + 1);

/** The last pick per hole, so a duplicate never counts twice. */
function picksByHole(picks: readonly TeeShotPick[]): Map<number, string | null> {
  const byHole = new Map<number, string | null>();
  for (const pick of picks) byHole.set(pick.holeNumber, pick.teeShotBy);
  return byHole;
}

/**
 * Where the team stands. A pick on someone who is no longer an active member
 * (withdrawn, or moved to another team) fills the hole but gives no credit.
 */
export function teeShotStatus(input: TeeShotStatusInput): TeeShotStatus {
  const holes = input.holeNumbers ?? ALL_HOLES;
  const byHole = picksByHole(input.picks);
  const counts = new Map<string, number>(input.memberIds.map((id) => [id, 0]));
  const openHoles: number[] = [];
  for (const hole of holes) {
    const owner = byHole.get(hole) ?? null;
    if (owner === null) {
      openHoles.push(hole);
      continue;
    }
    const current = counts.get(owner);
    if (current !== undefined) counts.set(owner, current + 1);
  }
  const players = input.memberIds.map((userId) => {
    const count = counts.get(userId) ?? 0;
    return { userId, count, missing: Math.max(input.minimum - count, 0) };
  });
  const totalShort = players.reduce((sum, p) => sum + p.missing, 0);
  const short = players
    .map((p, order) => ({ p, order }))
    .filter(({ p }) => p.missing > 0)
    .sort((a, b) => b.p.missing - a.p.missing || a.order - b.order)
    .map(({ p }) => p);
  return {
    minimum: input.minimum,
    players,
    totalShort,
    openHoles,
    excess: totalShort - openHoles.length,
    short,
    surplusPlayers: players.filter((p) => p.count > input.minimum).map((p) => p.userId),
    canDeliver: totalShort === 0,
  };
}

/** How far the team's delivery has come, as the tee-shot rule sees it. */
export type TeeShotDelivery = 'none' | 'partial' | 'all';

export interface TeeShotDeliveryMember {
  userId: string;
  submittedAt: string | null;
  withdrawnAt?: string | null;
}

/**
 * The one definition of «the team has delivered» in TypeScript. Formats where
 * one delivery covers the whole team (`deliveryCoversWholeTeam`, the scramble
 * family): `'all'` once an active member has delivered. Shamble, where each
 * player delivers their own card: `'partial'` from the first card until the
 * last. A withdrawn member does not count. The delivery branches of
 * `set_team_tee_shot_if_newer` are the SQL mirror.
 */
export function teamTeeShotDelivery(mode: GameMode, members: readonly TeeShotDeliveryMember[]): TeeShotDelivery {
  const active = members.filter((m) => !m.withdrawnAt);
  const delivered = active.filter((m) => m.submittedAt !== null).length;
  if (deliveryCoversWholeTeam(mode)) return delivered > 0 ? 'all' : 'none';
  if (delivered === 0) return 'none';
  return delivered === active.length ? 'all' : 'partial';
}

function withPick(input: TeeShotStatusInput, holeNumber: number, next: string | null): TeeShotStatusInput {
  return {
    ...input,
    picks: [...input.picks.filter((p) => p.holeNumber !== holeNumber), { holeNumber, teeShotBy: next }],
  };
}

/**
 * May the team set hole `holeNumber` to `next` (null = clear)?
 *
 * - `'all'`: never; the choices are frozen, clearing too.
 * - `'partial'` (shamble, at least one card delivered): only when nobody is
 *   short afterwards, clearing too. The same rule as the RPC, so the picker
 *   never sends a change the server refuses.
 * - `'none'`: clearing always goes. Otherwise the change goes when the team
 *   still has holes to spare afterwards, or when it is already short and the
 *   change makes the shortfall smaller.
 *
 * The RPC does not enforce the late-round lock (a queue from a phone that was
 * offline must not be dropped); the delivery is the hard gate.
 */
export function isTeeShotChangeAllowed(
  status: TeeShotStatus,
  input: TeeShotStatusInput,
  holeNumber: number,
  next: string | null,
  delivery: TeeShotDelivery,
): boolean {
  if (delivery === 'all') return false;
  const after = teeShotStatus(withPick(input, holeNumber, next));
  if (delivery === 'partial') return after.totalShort === 0;
  if (next === null) return true;
  return after.excess <= 0 || (status.excess > 0 && after.totalShort < status.totalShort);
}

/**
 * The members whose button can be tapped on `holeNumber`, in team order.
 * Tapping the member already chosen clears the hole, so that member is
 * tappable when clearing is allowed.
 */
export function selectableOnHole(
  status: TeeShotStatus,
  input: TeeShotStatusInput,
  holeNumber: number,
  delivery: TeeShotDelivery,
): string[] {
  const current = picksByHole(input.picks).get(holeNumber) ?? null;
  return input.memberIds.filter((id) =>
    isTeeShotChangeAllowed(status, input, holeNumber, id === current ? null : id, delivery),
  );
}

/**
 * The line under the hole page's buttons. The surfaces fill the names into
 * the `teeShots.*` templates; the order and the short form are decided here.
 *
 * - `free`: «Per mangler 4, Jonas 3 og Sigrid 2 · 2 hull å velge fritt på»,
 *   `short` biggest shortfall first. `othersEach` is set when every other
 *   active member is short by exactly the same number and there are at least
 *   two of them: «Per mangler 3, de andre 2 hver».
 * - `locked`: «Sigrid og Per trenger utslagene på de tre hullene som er
 *   igjen», `names` in team order.
 * - `teamShort`: the team is already short; swap on an earlier hole where one
 *   of `surplus` stands.
 * - `partial`: a shamble card is in; swaps only while everyone has enough.
 */
export type TeeShotHoleLine =
  | { kind: 'none' }
  | { kind: 'free'; short: TeeShotPlayerStatus[]; othersEach: number | null; freeHoles: number }
  | { kind: 'locked'; names: string[]; holesLeft: number }
  | { kind: 'teamShort'; short: TeeShotPlayerStatus[]; holesLeft: number; surplus: string[] }
  | { kind: 'partial' };

function othersEach(status: TeeShotStatus): number | null {
  const [, ...others] = status.short;
  if (others.length < 2 || others.length !== status.players.length - 1) return null;
  const y = others[0].missing;
  return others.every((p) => p.missing === y) ? y : null;
}

export function teeShotHoleLine(status: TeeShotStatus, delivery: TeeShotDelivery): TeeShotHoleLine {
  if (delivery === 'all') return { kind: 'none' };
  if (delivery === 'partial') return { kind: 'partial' };
  if (status.totalShort === 0) return { kind: 'none' };
  if (status.excess < 0) {
    return { kind: 'free', short: status.short, othersEach: othersEach(status), freeHoles: -status.excess };
  }
  if (status.excess === 0) {
    return {
      kind: 'locked',
      names: status.players.filter((p) => p.missing > 0).map((p) => p.userId),
      holesLeft: status.openHoles.length,
    };
  }
  return {
    kind: 'teamShort',
    short: status.short,
    holesLeft: status.openHoles.length,
    surplus: status.surplusPlayers,
  };
}

/**
 * What the delivery box tells the team (`Utslag-forslag-levering`). Null when
 * nobody is short. `short` is for the title (biggest shortfall first);
 * `shortNames` and `surplus` for the sentence, in team order. `swap` when
 * every hole is chosen: «bytt til Per på to hull der Marte eller Jonas står».
 * `pickOpen` while holes without a choice remain.
 */
export interface TeeShotDeliveryAdvice {
  kind: 'swap' | 'pickOpen';
  short: TeeShotPlayerStatus[];
  shortNames: string[];
  holes: number;
  surplus: string[];
}

export function teeShotDeliveryAdvice(status: TeeShotStatus): TeeShotDeliveryAdvice | null {
  if (status.totalShort === 0) return null;
  return {
    kind: status.openHoles.length > 0 ? 'pickOpen' : 'swap',
    short: status.short,
    shortNames: status.players.filter((p) => p.missing > 0).map((p) => p.userId),
    holes: status.totalShort,
    surplus: status.surplusPlayers,
  };
}
