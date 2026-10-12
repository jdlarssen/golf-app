// The organiser's signups inbox (#2288): which requests wait, how many seats
// are taken, and what each card says about them. Pure rules, no Supabase, so
// the page, the client cards and later the native app (#1954) read the same
// answers. The capacity counts the roster, not approved requests (#2291).

import type { RegistrationMode } from '@/lib/games/registration';
import { isRosterLocked, type GameStatus } from '@/lib/games/status';
import { isOpenForSignups } from '@/lib/games/publicSignupVisibility';
import { isRosterFull } from '@/lib/games/teamFormatLimits';
import { osloDayNumber } from '@/lib/format/osloCalendar';
import { firstName } from '@/lib/firstName';

/** A signup request's status (`registration_request_status` in the DB). */
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/**
 * #2061: a teammate who accepts the team invitation before the organiser has
 * approved the captain gets status 'approved' but no game_players row — they
 * wait for the team. The decision's cascade and the inbox's grouping both
 * read these two statuses.
 */
export const CASCADE_STATUSES = ['pending', 'approved'] as const;
export type CascadeStatus = (typeof CASCADE_STATUSES)[number];

export function isCascadeStatus(s: RequestStatus): s is CascadeStatus {
  return (CASCADE_STATUSES as readonly RequestStatus[]).includes(s);
}

/** The fields of a request the grouping and counting read. */
export type SignupRequestLike = {
  id: string;
  userId: string;
  status: RequestStatus;
  isTeamCaptain: boolean;
  teamRequestId: string | null;
};

/**
 * Groups requests by team: a captain takes every child of theirs in `rows`,
 * whatever the status; a child without its captain in `rows` is its own
 * group; the order is the list's. Does not filter — `inboxGroups` and
 * `historyGroups` decide which rows go in.
 */
export function groupSignupRequests<T extends SignupRequestLike>(rows: T[]): T[][] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const consumed = new Set<string>();
  const groups: T[][] = [];

  for (const row of rows) {
    if (consumed.has(row.id)) continue;
    if (row.isTeamCaptain) {
      const children = rows.filter(
        (r) => r.teamRequestId === row.id && !consumed.has(r.id),
      );
      groups.push([row, ...children]);
      consumed.add(row.id);
      for (const c of children) consumed.add(c.id);
    } else if (row.teamRequestId && byId.has(row.teamRequestId)) {
      // Picked up by its captain above.
      continue;
    } else {
      groups.push([row]);
      consumed.add(row.id);
    }
  }
  return groups;
}

/**
 * The cards waiting for the organiser: groups that start with a pending row.
 * A pending captain brings pending children and children who already said
 * yes (#2061), never rejected or withdrawn ones. An approved child whose
 * captain is gone does not wait for anything, so it is not here. A teammate
 * still pending under an already approved captain waits on their own, so
 * they get their own card, as under «Venter» before (#2288 review).
 */
export function inboxGroups<T extends SignupRequestLike>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (const group of groupSignupRequests(rows.filter((r) => isCascadeStatus(r.status)))) {
    if (group[0].status === 'pending') out.push(group);
    else for (const r of group) if (r.status === 'pending') out.push([r]);
  }
  return out;
}

export type HistoryStatus = Exclude<RequestStatus, 'pending'>;

/**
 * The cards in one history view: the rows with that status, grouped the same
 * way, so a rejected team is one card. A child who said yes while the captain
 * still waits is left out of «Godkjent» — it stands in the captain's card in
 * the inbox.
 */
export function historyGroups<T extends SignupRequestLike>(rows: T[], status: HistoryStatus): T[][] {
  const pendingIds = new Set(rows.filter((r) => r.status === 'pending').map((r) => r.id));
  return groupSignupRequests(
    rows.filter(
      (r) =>
        r.status === status &&
        !(status === 'approved' && r.teamRequestId !== null && pendingIds.has(r.teamRequestId)),
    ),
  );
}

/** Seats a group needs: distinct users in it who are not already on the roster (#2072). */
export function seatsNeeded(
  group: readonly SignupRequestLike[],
  activeRosterUserIds: readonly string[],
): number {
  const onRoster = new Set(activeRosterUserIds);
  return new Set(group.map((r) => r.userId).filter((id) => !onRoster.has(id))).size;
}

export type SignupCapacity = {
  /** Players on the roster (non-withdrawn `game_players` rows). */
  taken: number;
  /** People waiting in the inbox. */
  queued: number;
  /** Seats nobody on the roster has taken: the cap minus `taken`, never below 0. */
  free: number;
  /** Players above the cap (the organiser may go over it, #662). */
  over: number;
  full: boolean;
};

/**
 * The capacity line. `null` when the format has no cap. «Ledig» is the cap
 * minus those on the roster; the queue is not subtracted (owner's answer
 * 2026-10-12: «Tak minus de som er med»).
 */
export function signupCapacity({
  cap,
  rosterCount,
  queued,
}: {
  cap: number | null;
  rosterCount: number;
  queued: number;
}): SignupCapacity | null {
  if (cap === null) return null;
  return {
    taken: rosterCount,
    queued,
    free: Math.max(0, cap - rosterCount),
    over: Math.max(0, rosterCount - cap),
    full: isRosterFull(cap, rosterCount),
  };
}

export type SignupFlag =
  | { kind: 'teamShort'; needed: number; free: number }
  | { kind: 'teamNone'; needed: number }
  | { kind: 'soloFull' }
  | null;

/**
 * The warning on a card, when a game with a cap cannot fit it: a team that
 * needs more seats than are free, or a solo applicant on a full game. The
 * approve button still works — the organiser may go over the cap (#662).
 */
export function signupFlag(
  group: readonly SignupRequestLike[],
  capacity: SignupCapacity | null,
  activeRosterUserIds: readonly string[],
): SignupFlag {
  if (capacity === null || group.length === 0) return null;
  const needed = seatsNeeded(group, activeRosterUserIds);
  if (group[0].isTeamCaptain) {
    if (needed <= capacity.free) return null;
    return capacity.free >= 1
      ? { kind: 'teamShort', needed, free: capacity.free }
      : { kind: 'teamNone', needed };
  }
  return needed === 1 && capacity.full ? { kind: 'soloFull' } : null;
}

/**
 * The counts behind the page (#2291): who is on the roster and how many people
 * wait. Requests never count as «med», not even approved ones — a teammate who
 * said yes has no roster row until the team is approved.
 */
export function inboxCounts({
  roster,
  requests,
}: {
  roster: readonly { user_id: string; withdrawn_at: string | null }[];
  requests: SignupRequestLike[];
}): { rosterCount: number; activeRosterUserIds: string[]; queued: number } {
  const activeRosterUserIds = roster.filter((p) => p.withdrawn_at == null).map((p) => p.user_id);
  const queued = inboxGroups(requests).reduce(
    (sum, group) => sum + seatsNeeded(group, activeRosterUserIds),
    0,
  );
  return { rosterCount: activeRosterUserIds.length, activeRosterUserIds, queued };
}

export type SignupInboxState = 'open' | 'closed' | 'inviteOnly' | 'draft' | 'locked';

/**
 * The status line at the top. First match wins: a started or finished game is
 * locked, a draft is a draft, an invite-only game outside a club is
 * invite-only, then open or closed by `isOpenForSignups` — a club round on
 * «bare inviterte» is open to its members (owner's answer 2026-10-12).
 */
export function signupInboxState(game: {
  status: GameStatus;
  registration_mode: RegistrationMode;
  signups_closed_at: string | null;
  group_id: string | null;
}): SignupInboxState {
  if (isRosterLocked(game.status)) return 'locked';
  if (game.status === 'draft') return 'draft';
  if (game.registration_mode === 'invite_only' && game.group_id == null) return 'inviteOnly';
  return isOpenForSignups(game) ? 'open' : 'closed';
}

/**
 * Can the organiser close or reopen signups? Only a scheduled game, and only
 * where someone can sign up: open, manual approval, or a club round on
 * «bare inviterte». The action's guard and the pages read this one rule.
 */
export function canToggleSignups(
  status: GameStatus | string,
  registrationMode: RegistrationMode,
  groupId: string | null,
): boolean {
  if (status !== 'scheduled') return false;
  if (registrationMode === 'open' || registrationMode === 'manual_approval') return true;
  return registrationMode === 'invite_only' && groupId != null;
}

/**
 * Does «Styr spillere» show the «Påmeldinger» link (#2288)? Never on a cup
 * match, whose roster the cup owns. Otherwise before the start, on rounds
 * that take requests (manual approval, or invite-only, #368) or whose signups
 * can be closed; and after the start only while requests are still pending
 * (#1060), since the signups page is then the only way to them.
 * `pendingCount` is null when the count failed.
 */
export function showsSignupsLink(round: {
  status: GameStatus | string;
  registrationMode: RegistrationMode;
  groupId: string | null;
  tournamentId: string | null;
  pendingCount: number | null;
}): boolean {
  if (round.tournamentId != null) return false;
  if (round.pendingCount != null && round.pendingCount > 0) return true;
  if (round.status !== 'draft' && round.status !== 'scheduled') return false;
  return (
    round.registrationMode === 'manual_approval' ||
    round.registrationMode === 'invite_only' ||
    canToggleSignups(round.status, round.registrationMode, round.groupId)
  );
}

/**
 * When a request came in, in Oslo calendar days: the same day, the day before,
 * or older. The card writes «i dag kl. 09:12», «i går kl. 21:14» or
 * «7. okt kl. 21:14» from it.
 */
export function signupAgo(
  iso: string,
  nowMs: number,
): { kind: 'today' | 'yesterday' | 'date'; date: Date } {
  const date = new Date(iso);
  const diff = osloDayNumber(nowMs) - osloDayNumber(date.getTime());
  return { kind: diff === 0 ? 'today' : diff === 1 ? 'yesterday' : 'date', date };
}

/** The first names for «Jonas, Marte, Anders og 5 til», and how many are left. */
export function firstNamesLine(
  names: readonly string[],
  max: number,
): { firstNames: string[]; rest: number } {
  return {
    firstNames: names.slice(0, max).map((n) => firstName(n) ?? n),
    rest: Math.max(0, names.length - max),
  };
}

/**
 * The roster's order on the page: alphabetical by display name, then user id.
 * `game_players` has no signup time to sort by.
 */
export function sortRoster<T extends { userId: string; displayName: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      a.displayName.localeCompare(b.displayName, 'nb') ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
}
