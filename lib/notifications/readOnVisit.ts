import type { NotificationKind } from './types';

/**
 * The pages a notification links to (#2201). Opening one marks the viewer's
 * unread notifications it answers as read: what you have seen is read. A row
 * that still waits for you is the exception (`isWaitingRow`, #2759).
 */
export type VisitSurface =
  | 'gameHome'
  | 'gameApprove'
  | 'gameLeaderboard'
  | 'gameSubmit'
  | 'gameHole'
  | 'gameFinish'
  | 'adminGame'
  | 'adminSignups'
  | 'teamSignup'
  | 'cup'
  | 'cupResults'
  | 'cupParticipants'
  | 'club'
  | 'clubManage'
  | 'friends'
  | 'history'
  | 'league'
  | 'leagueRoundStart'
  | 'leagueMarker';

/** The payload field that ties a notification to the page's entity. */
export type VisitKey = 'game_id' | 'tournament_id' | 'group_id' | 'league_id';

export type VisitRule = {
  kinds: readonly NotificationKind[];
  /** `null`: the page has no entity, so every unread row of these kinds is read. */
  key: VisitKey | null;
};

/**
 * Which kinds each page clears, and by which payload field. The one home for
 * «what is cleared where» (#2201): every page calls `markReadOnVisit` with its
 * surface, and the app (`native/app`) reads the same map. A kind may sit on
 * more than one surface: an `invite` or `auto_start_blocked` reaches an admin
 * on the Sekretariat as well as on the game page, and since #2203 a
 * `scorecard_submitted` goes to the organiser on the game page (older rows and
 * a non-playing admin end up on the desk).
 *
 * Pure module with type-only imports, so the app can import it without
 * pulling in the zod schemas.
 */
export const READ_ON_VISIT: Record<VisitSurface, VisitRule> = {
  gameHome: {
    kinds: [
      'invite',
      'scorecard_approved',
      'scorecard_rejected',
      'scorecard_reopened',
      'game_reopened',
      'registration_approved',
      'player_added',
      'game_started',
      'payment_reminder',
      'auto_start_blocked',
      'scorecard_submitted',
      // #2480: the game page shows the new tee-off.
      'game_moved',
    ],
    key: 'game_id',
  },
  gameApprove: { kinds: ['peer_approval_request'], key: 'game_id' },
  gameLeaderboard: { kinds: ['game_finished'], key: 'game_id' },
  gameSubmit: { kinds: ['deliver_reminder'], key: 'game_id' },
  gameHole: { kinds: ['missing_score_reminder'], key: 'game_id' },
  // #2203: the organiser's «Avslutt spillet» page.
  gameFinish: { kinds: ['all_scorecards_delivered', 'game_stale_reminder'], key: 'game_id' },
  adminGame: {
    kinds: ['scorecard_submitted', 'invite', 'auto_start_blocked'],
    key: 'game_id',
  },
  adminSignups: { kinds: ['registration_request'], key: 'game_id' },
  teamSignup: { kinds: ['team_invite', 'team_member_withdrew'], key: 'game_id' },
  cup: { kinds: ['cup_started', 'cup_lineup_revealed'], key: 'tournament_id' },
  cupResults: { kinds: ['cup_finished'], key: 'tournament_id' },
  cupParticipants: { kinds: ['cup_signup'], key: 'tournament_id' },
  club: { kinds: ['club_role_changed'], key: 'group_id' },
  // #2326: requests are answered on the club's back room, where they link.
  clubManage: { kinds: ['club_join_request'], key: 'group_id' },
  // #2800: a friend's brag links here. One to a league player links to the
  // league, which does not clear it: every kind on that page waits, so a visit
  // sends no write at all (`visitCanMarkRead`). A tap in the inbox reads it.
  friends: { kinds: ['friend_request', 'friend_accepted', 'friend_achievement'], key: null },
  history: { kinds: ['achievement_unlocked'], key: null },
  // #2638: the league page, where the round is played from.
  league: { kinds: ['league_round_open', 'league_round_closing'], key: 'league_id' },
  // #2666: a simulator league's round start, where the same two messages link.
  leagueRoundStart: { kinds: ['league_round_open', 'league_round_closing'], key: 'league_id' },
  // #2661: the marker's page for a card in a simulator-league flight.
  leagueMarker: { kinds: ['league_marker_request'], key: 'game_id' },
};

/**
 * Kinds without a page of their own. They are read when tapped in the inbox,
 * or when their push is tapped (`?varsel=`, `readMarker.ts`).
 */
export const INBOX_ONLY_KINDS: readonly NotificationKind[] = [
  'registration_rejected',
  'registration_expired',
  'idea_built',
  'product_update',
  // #2481: the game is deleted before the notice is written.
  'game_cancelled',
];

/**
 * Kinds that are never pushed and never light the Innboks dot (#2201, the
 * owner's choice): news about Tørny. The row is still stored, so it shows in
 * the inbox and in the banner on Hjem. Read by `notify` and by
 * `useUnreadNotificationsCount`.
 */
export const QUIET_KINDS: readonly NotificationKind[] = ['product_update'];

/**
 * Every kind this code knows (#2480): the kinds of every surface plus the
 * inbox-only ones, which `readOnVisit.test.ts` holds equal to the TypeScript
 * union. A row of any other kind comes from a newer build (a new kind is
 * written before every open tab, app build or sister branch knows it), so the
 * inbox and the unread dot skip it instead of failing on it. Pure, like the
 * rest of this module, so the bottom nav and the app can use it without zod.
 */
export const KNOWN_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>([
  ...Object.values(READ_ON_VISIT).flatMap((rule) => rule.kinds),
  ...INBOX_ONLY_KINDS,
]);

export function isKnownKind(kind: string): kind is NotificationKind {
  return KNOWN_KINDS.has(kind as NotificationKind);
}

/**
 * #2759, the owner's answers 2026-11-04: a matter under «Krever handling» stands
 * until it is done. Opening it, a push tap, a page visit or «Marker alt lest»
 * does not take it out. It leaves when the server sees it is done
 * (`findSettledActionIds`), and only then gets `read_at`, so the section, the
 * chip, the dot and the envelope all follow from the same column.
 *
 * Three kinds wait only with data that can say the matter is done, see
 * `isWaitingRow`. `team_member_withdrew` has no such data at all, so it is not
 * here, and a tap takes it out. `inboxSections.test.ts` holds this list against
 * `inboxActionKey`.
 */
export const WAITING_KINDS: readonly NotificationKind[] = [
  'invite',
  'peer_approval_request',
  'league_marker_request',
  'registration_request',
  'deliver_reminder',
  'missing_score_reminder',
  'scorecard_rejected',
  'scorecard_reopened',
  'friend_request',
  'team_invite',
  'club_join_request',
  'player_added',
  'auto_start_blocked',
  'payment_reminder',
  'all_scorecards_delivered',
  'game_stale_reminder',
  'league_round_open',
  'league_round_closing',
];

/**
 * Does this row wait until its matter is done? A kind in `WAITING_KINDS`,
 * except three shapes that cannot tell:
 * - `registration_request` without `request_id`: a heads-up from an open game,
 *   nothing to answer.
 * - `scorecard_rejected` with `player_name` but no `player_id`: the deliverer's
 *   copy from before #2759, which cannot say whose card it means.
 * - `deliver_reminder` with `others_count` but no `card_user_ids`: from before
 *   #2759, which cannot say which cards it means.
 *
 * `NOT_WAITING_FILTER` is the same rule for a PostgREST write. Change both.
 */
export function isWaitingRow(row: { kind: string; payload: unknown }): boolean {
  if (!WAITING_KINDS.includes(row.kind as NotificationKind)) return false;
  const p = row.payload as {
    request_id?: unknown;
    player_name?: unknown;
    player_id?: unknown;
    others_count?: unknown;
    card_user_ids?: unknown;
  };
  if (row.kind === 'registration_request') return p.request_id != null;
  if (row.kind === 'scorecard_rejected') return p.player_name == null || p.player_id != null;
  if (row.kind === 'deliver_reminder') return p.others_count == null || p.card_user_ids != null;
  return true;
}

/**
 * The rows `isWaitingRow` says no to, as a PostgREST `.or()`. Every write that
 * marks rows read for a tap, a visit or «Marker alt lest» goes through it, on the
 * web and in the app. `readOnVisit.test.ts` runs both forms over the same rows.
 */
export const NOT_WAITING_FILTER = [
  `kind.not.in.(${WAITING_KINDS.join(',')})`,
  'and(kind.eq.registration_request,payload->>request_id.is.null)',
  'and(kind.eq.scorecard_rejected,payload->>player_name.not.is.null,payload->>player_id.is.null)',
  'and(kind.eq.deliver_reminder,payload->>others_count.not.is.null,payload->>card_user_ids.is.null)',
].join(',');

/**
 * Does the visit have anything to mark? Not when every kind on the surface waits
 * whatever its payload says. The hole page renders for every stroke, so it
 * should not send an UPDATE that can never match.
 */
export function visitCanMarkRead(surface: VisitSurface): boolean {
  return READ_ON_VISIT[surface].kinds.some(
    (kind) =>
      !WAITING_KINDS.includes(kind) ||
      kind === 'registration_request' ||
      kind === 'scorecard_rejected' ||
      kind === 'deliver_reminder',
  );
}
