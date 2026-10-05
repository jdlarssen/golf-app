import type { AppLocale } from '@/i18n/routing';
import { firstName } from '@/lib/firstName';
import { finishedResultBadge } from '@/lib/games/finishedResultBadge';
import {
  formatRelativeDayLocale,
  formatShortDayMonthLocale,
  formatTeeOffTimeLocale,
  intlLocaleTag,
} from '@/lib/i18n/format';
import { osloParts } from '@/lib/format/teeOff';
import { nameInitials } from '@/lib/names/initials';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { buildNotificationText, type NotificationTranslator } from './cardContent';
import { notificationDestination } from './deeplink';
import { NOTIFICATION_EMOJI } from './emoji';
import type { NotificationKind, NotificationPayload } from './types';

/**
 * The inbox as a board (#2263): one home for which notification needs action,
 * which ones group together, which section a row lands in, and what it says.
 *
 * Pure: no React, no Supabase. The web inbox (`app/[locale]/innboks`) renders
 * from it, and the app's inbox will use the same rules when it comes.
 *
 * Sections: KREVER HANDLING holds unread rows that ask you to do something;
 * the rest go under I DAG or TIDLIGERE by Oslo calendar day. Delivered cards
 * and open-signup heads-ups group per game, and read approval requests group
 * the same way, so twelve cards from one round are one row.
 */

/** A `notifications` row as the inbox reads it. */
export type InboxRow = {
  id: string;
  kind: NotificationKind;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
};

export type InboxFilter = 'all' | 'action' | 'friends';
export type InboxSectionKey = 'action' | 'today' | 'earlier';

/** The button(s) a row in KREVER HANDLING gets — keys under `inbox.buttons`. */
export type ActionKey =
  | 'review'
  | 'decide'
  | 'deliver'
  | 'enterScore'
  | 'fixCard'
  | 'reply'
  | 'inviteNew'
  | 'confirm'
  | 'seeMissing'
  | 'seePayment'
  | 'finishGame';

export const GROUPABLE_KINDS = [
  'peer_approval_request',
  'scorecard_submitted',
  'registration_request',
] as const;
export type GroupableKind = (typeof GROUPABLE_KINDS)[number];

/**
 * A row on the board. `single.rows` holds every notification the row stands
 * for — usually just `row`, but a group that turned out to be one person (two
 * deliveries from Marte) is shown as her single row and still marks both read.
 */
export type InboxEntry =
  | { type: 'single'; key: string; row: InboxRow; rows: InboxRow[]; unread: boolean }
  | {
      type: 'group';
      key: string;
      kind: GroupableKind;
      gameId: string;
      rows: InboxRow[];
      newest: InboxRow;
      unread: boolean;
    };

export type InboxSections = Record<InboxSectionKey, InboxEntry[]>;

const FRIEND_KINDS: ReadonlySet<NotificationKind> = new Set(['friend_request', 'friend_accepted']);

/**
 * Which button a row gets in KREVER HANDLING, or `null` when the row only
 * tells you something. Exhaustive over `NotificationKind`: a new kind does not
 * compile until it is placed here.
 *
 * `registration_request` asks for an answer when it is a pending request
 * (`request_id`). The varsel only goes to the game's organiser, and the
 * server decides who may answer (`registrationDecisionCore`, #2440), so the
 * inbox carries no role.
 */
export function inboxActionKey(row: Pick<InboxRow, 'kind' | 'payload'>): ActionKey | null {
  switch (row.kind) {
    case 'peer_approval_request':
      return 'review';
    case 'registration_request': {
      const p = row.payload as NotificationPayload<'registration_request'>;
      return p.request_id ? 'decide' : null;
    }
    case 'deliver_reminder':
      return 'deliver';
    case 'missing_score_reminder':
      return 'enterScore';
    case 'scorecard_rejected':
    case 'scorecard_reopened':
      return 'fixCard';
    case 'friend_request':
    case 'team_invite':
    case 'club_join_request':
      return 'reply';
    case 'team_member_withdrew':
      return 'inviteNew';
    case 'player_added':
    case 'invite':
      return 'confirm';
    case 'auto_start_blocked':
      return 'seeMissing';
    case 'payment_reminder':
      return 'seePayment';
    case 'all_scorecards_delivered':
    case 'game_stale_reminder':
      return 'finishGame';
    case 'scorecard_submitted':
    case 'scorecard_approved':
    case 'game_finished':
    case 'game_reopened':
    case 'product_update':
    case 'registration_approved':
    case 'registration_rejected':
    case 'registration_expired':
    case 'cup_finished':
    case 'cup_started':
    case 'cup_signup':
    case 'cup_lineup_revealed':
    case 'club_role_changed':
    case 'friend_accepted':
    case 'game_started':
    case 'achievement_unlocked':
    case 'idea_built':
      return null;
    default: {
      const unhandled: never = row.kind;
      return unhandled;
    }
  }
}

/** `${kind}:${game_id}` for rows that group per game, else `null`. */
export function inboxGroupKey(row: Pick<InboxRow, 'kind' | 'payload'>): string | null {
  switch (row.kind) {
    case 'peer_approval_request':
    case 'scorecard_submitted':
      return `${row.kind}:${(row.payload as { game_id: string }).game_id}`;
    case 'registration_request': {
      const p = row.payload as NotificationPayload<'registration_request'>;
      // A pending request is answered one by one, so it never groups.
      return p.request_id ? null : `${row.kind}:${p.game_id}`;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type InboxPerson = { full: string; short: string; initials: string };

/**
 * A name as the inbox shows it. Drops a trailing ` «kallenavn»`; a masked
 * address (`ol•••@gmail.com`, a user without a name) is kept whole with its
 * first character as the initial; anything else gives the first name and the
 * two-letter initials. `null` for a missing name — the caller picks the
 * catalog fallback.
 */
export function inboxPerson(raw: string | null | undefined): InboxPerson | null {
  if (!raw) return null;
  const full = raw.replace(/\s*«[^»]*»\s*$/, '').trim();
  if (!full) return null;
  if (full.includes('@')) {
    return { full, short: full, initials: (Array.from(full)[0] ?? '?').toUpperCase() };
  }
  return { full, short: firstName(full) ?? full, initials: nameInitials(full) };
}

/** The payload field that names the person a row is about, per kind. */
const PERSON_FIELD: Partial<Record<NotificationKind, string>> = {
  invite: 'invited_by_name',
  team_invite: 'invited_by_name',
  peer_approval_request: 'submitter_name',
  scorecard_submitted: 'player_name',
  scorecard_approved: 'approver_name',
  scorecard_rejected: 'rejecter_name',
  scorecard_reopened: 'actor_name',
  game_reopened: 'actor_name',
  friend_request: 'actor_name',
  friend_accepted: 'actor_name',
  registration_request: 'requester_name',
  club_join_request: 'requester_name',
  team_member_withdrew: 'withdrawn_player_name',
  cup_signup: 'participant_name',
  player_added: 'added_by_name',
};

/** The raw name of the person a row is about, or `null`. */
export function rowPersonName(row: Pick<InboxRow, 'kind' | 'payload'>): string | null {
  const field = PERSON_FIELD[row.kind];
  if (!field) return null;
  const value = (row.payload as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** The card owner's id on delivered-card rows (#2263), when the row has it. */
function rowPersonId(row: InboxRow): string | null {
  const p = row.payload as { submitter_id?: string; player_id?: string };
  if (row.kind === 'peer_approval_request') return p.submitter_id ?? null;
  if (row.kind === 'scorecard_submitted') return p.player_id ?? null;
  return null;
}

export type GroupPeople = { named: InboxPerson[]; total: number };

/**
 * The distinct people behind a group, newest first. Deduplicated by the card
 * owner's id when the row has it, else by name; a row without either counts as
 * its own person (shown only in «+N»). A row from before the id existed is
 * matched to a row with the id through the name, so the same card delivered
 * before and after the deploy is one person — unless that name belongs to more
 * than one id, where the name cannot tell them apart.
 */
export function groupPeople(rows: InboxRow[]): GroupPeople {
  const idByName = new Map<string, string | null>();
  for (const row of rows) {
    const id = rowPersonId(row);
    const person = inboxPerson(rowPersonName(row));
    if (!id || !person) continue;
    const name = person.full.toLowerCase();
    const known = idByName.get(name);
    idByName.set(name, known === undefined || known === id ? id : null);
  }

  const seen = new Set<string>();
  const named: InboxPerson[] = [];
  let total = 0;
  for (const row of rows) {
    const person = inboxPerson(rowPersonName(row));
    const id = rowPersonId(row) ?? (person ? idByName.get(person.full.toLowerCase()) : null);
    const key = id ? `id:${id}` : person ? `name:${person.full.toLowerCase()}` : `row:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += 1;
    if (person) named.push(person);
  }
  return { named, total };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** Days since the epoch for the Oslo calendar date of an ISO instant. */
function osloDay(ms: number): number {
  const p = osloParts(new Date(ms));
  return Math.round(Date.UTC(p.year, p.month, p.day) / 86_400_000);
}

/** Same Oslo calendar day? Oslo-pinned (#648) so server and browser agree. */
export function isSameYmd(a: string | number, b: string | number): boolean {
  return osloDay(new Date(a).getTime()) === osloDay(new Date(b).getTime());
}

function newestFirst(rows: InboxRow[]): InboxRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/**
 * Turns rows (newest first) into entries. A group stands where its newest
 * member stands. In KREVER HANDLING only approval requests group, and always
 * as a group (the row counts the cards); elsewhere a group of one person is a
 * plain row.
 */
function toEntries(rows: InboxRow[], mode: 'action' | 'rest'): InboxEntry[] {
  const order: (InboxEntry | { pending: string })[] = [];
  const members = new Map<string, InboxRow[]>();
  for (const row of rows) {
    const key =
      mode === 'action'
        ? row.kind === 'peer_approval_request'
          ? inboxGroupKey(row)
          : null
        : inboxGroupKey(row);
    if (!key) {
      order.push({ type: 'single', key: row.id, row, rows: [row], unread: row.read_at == null });
      continue;
    }
    const list = members.get(key);
    if (list) list.push(row);
    else {
      members.set(key, [row]);
      order.push({ pending: key });
    }
  }
  return order.map((item) => {
    if (!('pending' in item)) return item;
    const list = members.get(item.pending)!;
    const newest = list[0]!;
    const unread = list.some((r) => r.read_at == null);
    if (mode === 'rest' && groupPeople(list).total <= 1) {
      return { type: 'single', key: newest.id, row: newest, rows: list, unread };
    }
    return {
      type: 'group',
      key: item.pending,
      kind: newest.kind as GroupableKind,
      gameId: (newest.payload as { game_id: string }).game_id,
      rows: list,
      newest,
      unread,
    };
  });
}

/**
 * The board. `action` = unread rows with an action key; the rest split on the
 * Oslo calendar day of `created_at`. `friends` keeps friend requests and new
 * friendships in every section; `action` shows only KREVER HANDLING.
 */
export function buildInboxSections(
  rows: InboxRow[],
  opts: { filter: InboxFilter; now: number },
): InboxSections {
  const sorted = newestFirst(rows);
  const visible =
    opts.filter === 'friends' ? sorted.filter((r) => FRIEND_KINDS.has(r.kind)) : sorted;
  const actionRows = visible.filter(
    (r) => r.read_at == null && inboxActionKey(r) !== null,
  );
  const action = toEntries(actionRows, 'action');
  if (opts.filter === 'action') return { action, today: [], earlier: [] };

  const inAction = new Set(actionRows.map((r) => r.id));
  const rest = visible.filter((r) => !inAction.has(r.id));
  return {
    action,
    today: toEntries(rest.filter((r) => isSameYmd(r.created_at, opts.now)), 'rest'),
    earlier: toEntries(rest.filter((r) => !isSameYmd(r.created_at, opts.now)), 'rest'),
  };
}

/** The number on the «Krever handling» chip: rows in the section, a group counting once. */
export function countActionRows(rows: InboxRow[]): number {
  return buildInboxSections(rows, { filter: 'all', now: 0 }).action.length;
}

/**
 * When a read hit its row limit, drop the rows from its oldest Oslo day, so no
 * group is shown cut short (a round's twelve cards as «7 scorekort levert").
 * Keeps everything if that would leave nothing.
 */
export function trimToWholeDays<T extends Pick<InboxRow, 'created_at'>>(
  rows: T[],
  limit: number,
): T[] {
  if (rows.length < limit || rows.length === 0) return rows;
  const oldest = rows.reduce((min, r) =>
    new Date(r.created_at).getTime() < new Date(min.created_at).getTime() ? r : min,
  );
  const kept = rows.filter((r) => !isSameYmd(r.created_at, oldest.created_at));
  return kept.length > 0 ? kept : rows;
}

// ---------------------------------------------------------------------------
// Rows that no longer wait
// ---------------------------------------------------------------------------

export type SettledInputs = {
  viewerId: string;
  /** `game_registration_requests.status` per request id; a missing id is gone. */
  requestStatus: ReadonlyMap<string, string>;
  /** Cards in the games of the approval requests (RLS «shared game»). */
  cards: ReadonlyArray<{
    game_id: string;
    user_id: string;
    submitted_at: string | null;
    approved_at: string | null;
  }>;
  /** The viewer's own player row per game. */
  own: ReadonlyMap<string, { paid_at: string | null; submitted_at: string | null }>;
  /**
   * Games that are active or finished. A request still pending there can no
   * longer be answered: the signup page and «Godta» both refuse a started
   * game (`game_locked`), and the start's auto-reject is best-effort.
   */
  lockedGameIds?: ReadonlySet<string>;
  /** #2203: games whose status is `finished`. The organiser's finish rows are done there. */
  finishedGameIds?: ReadonlySet<string>;
};

/**
 * Unread action rows whose matter is already settled — a flightmate approved
 * the card, the request was answered or ran out or its round has started, the
 * fee is paid, the game the organiser was told to finish is finished. Not every
 * target page marks its notification read, so the inbox checks on load and
 * treats these as read (#2263).
 */
export function findSettledActionIds(rows: InboxRow[], inputs: SettledInputs): string[] {
  const settled: string[] = [];
  for (const row of rows) {
    if (row.read_at != null) continue;
    switch (row.kind) {
      case 'registration_request': {
        const p = row.payload as NotificationPayload<'registration_request'>;
        if (
          p.request_id &&
          (inputs.requestStatus.get(p.request_id) !== 'pending' || inputs.lockedGameIds?.has(p.game_id))
        ) {
          settled.push(row.id);
        }
        break;
      }
      case 'peer_approval_request': {
        const p = row.payload as NotificationPayload<'peer_approval_request'>;
        const inGame = inputs.cards.filter((c) => c.game_id === p.game_id);
        if (p.submitter_id) {
          // The card owner's row (#2200: never the deliverer's).
          const card = inGame.find((c) => c.user_id === p.submitter_id);
          if (!card || card.approved_at != null || card.submitted_at == null) {
            settled.push(row.id);
          }
        } else {
          // Older rows: settled once nobody else has a card waiting.
          const waiting = inGame.some(
            (c) =>
              c.user_id !== inputs.viewerId && c.submitted_at != null && c.approved_at == null,
          );
          if (!waiting) settled.push(row.id);
        }
        break;
      }
      case 'payment_reminder': {
        const p = row.payload as NotificationPayload<'payment_reminder'>;
        if (inputs.own.get(p.game_id)?.paid_at != null) settled.push(row.id);
        break;
      }
      case 'deliver_reminder': {
        const p = row.payload as NotificationPayload<'deliver_reminder'>;
        if (!p.others_count && inputs.own.get(p.game_id)?.submitted_at != null) {
          settled.push(row.id);
        }
        break;
      }
      // #2268: a delivered card has every hole, so the nudge is done.
      case 'missing_score_reminder': {
        const p = row.payload as NotificationPayload<'missing_score_reminder'>;
        if (inputs.own.get(p.game_id)?.submitted_at != null) settled.push(row.id);
        break;
      }
      // #2203: both ask the organiser to finish the game; a finished game is done.
      case 'all_scorecards_delivered':
      case 'game_stale_reminder': {
        const p = row.payload as NotificationPayload<'all_scorecards_delivered'>;
        if (inputs.finishedGameIds?.has(p.game_id)) settled.push(row.id);
        break;
      }
      default:
        break;
    }
  }
  return settled;
}

// ---------------------------------------------------------------------------
// What a row says
// ---------------------------------------------------------------------------

export type InboxAvatar =
  | { kind: 'people'; initials: string[]; more: number }
  | { kind: 'place'; rank: number }
  | { kind: 'emoji'; emoji: string };

export type InboxEntryView = {
  title: string;
  subtitle: string;
  /** The subtitle is someone's own words (a rejection reason): clamp it. */
  subtitleIsFreeText: boolean;
  /** A signup greeting, already in quotes. */
  quote: string | null;
  /** `product_update` body text. */
  body: string | null;
  /** `product_update` call to action, when it has a link. */
  cta: { href: string; label: string } | null;
  avatar: InboxAvatar;
  /** «2. plass av 12» for screen readers when the disc shows a place. */
  placeLabel: string | null;
  destination: string | null;
  actionKey: ActionKey | null;
};

export type InboxTextContext = {
  /** `inbox` namespace. */
  t: NotificationTranslator;
  /** `finishedCard` namespace. */
  tFinished: NotificationTranslator;
  locale: AppLocale;
  now: number;
  /** `games.scheduled_tee_off_at` per game id (signup rows). */
  teeOffByGame: Readonly<Record<string, string | null>>;
  /** Own `game_players.result_summary` per game id (result rows). */
  resultByGame: Readonly<Record<string, ResultSummary | null>>;
  /** Games whose status is `finished` — a reopened game shows no place. */
  finishedGameIds: readonly string[];
};

/** Kinds whose catalog detail says something the target page does not. */
const DETAIL_KINDS: ReadonlySet<NotificationKind> = new Set([
  'club_role_changed',
  'auto_start_blocked',
  'registration_expired',
  'registration_rejected',
  'payment_reminder',
  'achievement_unlocked',
  'scorecard_rejected',
  // #2203: the title already names the game, so the detail says why instead.
  // all_scorecards_delivered stays out: its title has no game name, and the
  // default subtitle gives it.
  'game_stale_reminder',
]);

/** Kinds whose detail carries a person's own words. */
const FREE_TEXT_KINDS: ReadonlySet<NotificationKind> = new Set([
  'registration_rejected',
  'scorecard_rejected',
]);

const SEP = ' · ';

function relTime(iso: string, ctx: InboxTextContext): string {
  return formatRelativeDayLocale(iso, ctx.locale, ctx.now);
}

function contextName(payload: NotificationPayload): string | null {
  const p = payload as { game_name?: string | null; tournament_name?: string; group_name?: string };
  return p.game_name ?? p.tournament_name ?? p.group_name ?? null;
}

/** The payload with the person's name cut to the first name (titles use first names). */
function withFirstName(row: InboxRow): NotificationPayload {
  const field = PERSON_FIELD[row.kind];
  const person = inboxPerson(rowPersonName(row));
  if (!field || !person) return row.payload;
  return { ...(row.payload as object), [field]: person.short } as NotificationPayload;
}

function catalogText(row: InboxRow, t: NotificationTranslator) {
  return buildNotificationText(row.kind, withFirstName(row), t);
}

/**
 * Title for an action-kind row that is no longer waiting (read, or settled).
 * A catalog title that says something waits is put in the past; the others
 * already read as past and stay.
 */
function readTitle(row: InboxRow, t: NotificationTranslator): string {
  const short = inboxPerson(rowPersonName(row))?.short;
  switch (row.kind) {
    case 'deliver_reminder': {
      const p = row.payload as NotificationPayload<'deliver_reminder'>;
      return t(p.others_count ? 'readTitles.deliverReminderKept' : 'readTitles.deliverReminder');
    }
    case 'missing_score_reminder':
      return t('readTitles.missingScoreReminder');
    case 'scorecard_rejected':
      return t('readTitles.scorecardRejected');
    case 'friend_request':
      return t('readTitles.friendRequest', { actorName: short ?? t('someoneFallback') });
    case 'team_invite': {
      const p = row.payload as NotificationPayload<'team_invite'>;
      return t('readTitles.teamInvite', {
        invitedByName: short ?? t('somePlayerFallback'),
        teamName: p.team_name ?? t('someTeamFallback'),
      });
    }
    case 'club_join_request':
      return t('readTitles.clubJoinRequest', { requesterName: short ?? t('somePlayerFallback') });
    case 'payment_reminder':
      return t('readTitles.paymentReminder');
    // #2203: no game name here; the subtitle carries it (not a detail kind).
    case 'all_scorecards_delivered':
      return t('readTitles.allScorecardsDelivered');
    case 'game_stale_reminder': {
      const p = row.payload as NotificationPayload<'game_stale_reminder'>;
      return t('readTitles.gameStaleReminder', { gameName: p.game_name });
    }
    default:
      return catalogText(row, t).title;
  }
}

/** «Marte, Jonas og 2 til» — newest first, the whole list up to three named people. */
export function namesLine(people: GroupPeople, ctx: Pick<InboxTextContext, 't' | 'locale'>): string {
  const { t, locale } = ctx;
  if (people.named.length === 0) {
    return people.total <= 1 ? t('somePlayerFallback') : t('board.somePlayers', { count: people.total });
  }
  const names = people.named.map((p) => p.short);
  let parts: string[];
  if (names.length === people.total && people.total <= 3) {
    parts = names;
  } else {
    const shown = names.slice(0, 2);
    const rest = people.total - shown.length;
    parts = rest > 0 ? [...shown, t('board.moreNames', { count: rest })] : shown;
  }
  return new Intl.ListFormat(intlLocaleTag(locale), { type: 'conjunction' }).format(parts);
}

/** «1. okt kl. 17:30» in Oslo time, or `null` without a start time. */
export function teeOffLine(iso: string | null | undefined, ctx: Pick<InboxTextContext, 't' | 'locale'>): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return ctx.t('board.teeOff', {
    date: formatShortDayMonthLocale(d, ctx.locale),
    time: formatTeeOffTimeLocale(d, ctx.locale),
  });
}

function peopleAvatar(people: GroupPeople, fallback: NotificationKind): InboxAvatar {
  if (people.named.length === 0) return { kind: 'emoji', emoji: NOTIFICATION_EMOJI[fallback] };
  const shown = people.named.slice(0, 2);
  return {
    kind: 'people',
    initials: shown.map((p) => p.initials),
    more: Math.max(0, people.total - shown.length),
  };
}

function singleAvatar(row: InboxRow): InboxAvatar {
  const person = inboxPerson(rowPersonName(row));
  return person
    ? { kind: 'people', initials: [person.initials], more: 0 }
    : { kind: 'emoji', emoji: NOTIFICATION_EMOJI[row.kind] };
}

function resultView(row: InboxRow, ctx: InboxTextContext): Pick<InboxEntryView, 'avatar' | 'placeLabel' | 'subtitle'> {
  const p = row.payload as NotificationPayload<'game_finished'>;
  const time = relTime(row.created_at, ctx);
  const emoji: InboxAvatar = { kind: 'emoji', emoji: NOTIFICATION_EMOJI.game_finished };
  const summary = ctx.resultByGame[p.game_id] ?? null;
  if (!summary || !ctx.finishedGameIds.includes(p.game_id)) {
    return { avatar: emoji, placeLabel: null, subtitle: [p.game_name, time].join(SEP) };
  }
  if (summary.kind === 'matchplay') {
    const badge = finishedResultBadge(summary);
    return {
      avatar: emoji,
      placeLabel: null,
      subtitle: [p.game_name, ctx.tFinished(badge.key, badge.values), time].join(SEP),
    };
  }
  const isTeam = summary.kind === 'placement' && summary.isTeam;
  return {
    avatar: { kind: 'place', rank: summary.rank },
    placeLabel: ctx.tFinished(isTeam ? 'result.teamPlacement' : 'result.placement', {
      rank: summary.rank,
      fieldSize: summary.fieldSize,
    }),
    subtitle: [p.game_name, time].join(SEP),
  };
}

/**
 * Everything a row shows: title, subtitle, disc, target and button. One
 * function for all three sections, so the wording rules have one home.
 */
export function buildInboxEntryView(
  entry: InboxEntry,
  section: InboxSectionKey,
  ctx: InboxTextContext,
): InboxEntryView {
  const { t } = ctx;
  const base: InboxEntryView = {
    title: '',
    subtitle: '',
    subtitleIsFreeText: false,
    quote: null,
    body: null,
    cta: null,
    avatar: { kind: 'emoji', emoji: '' },
    placeLabel: null,
    destination: null,
    actionKey: null,
  };

  if (entry.type === 'group') {
    const people = groupPeople(entry.rows);
    const game = (entry.newest.payload as { game_name: string }).game_name;
    const destination = notificationDestination(entry.newest);
    if (section === 'action') {
      // Only approval requests group in KREVER HANDLING.
      return {
        ...base,
        title: t('board.approvalTitle', { count: people.total }),
        subtitle: [game, t('board.deliveredBy', { names: namesLine(people, ctx) })].join(SEP),
        avatar: peopleAvatar(people, entry.kind),
        destination,
        actionKey: 'review',
      };
    }
    const title =
      entry.kind === 'registration_request'
        ? t(entry.rows.every((r) => r.read_at == null) ? 'board.newSignups' : 'board.signups', {
            count: people.total,
          })
        : t('board.deliveredCount', { count: people.total });
    return {
      ...base,
      title,
      subtitle: [game, t('board.latest', { time: relTime(entry.newest.created_at, ctx) })].join(SEP),
      avatar: peopleAvatar(people, entry.kind),
      destination,
    };
  }

  const row = entry.row;
  const time = relTime(row.created_at, ctx);
  const short = inboxPerson(rowPersonName(row))?.short;
  const destination = notificationDestination(row);

  if (section === 'action') {
    const actionKey = inboxActionKey(row);
    if (row.kind === 'registration_request') {
      const p = row.payload as NotificationPayload<'registration_request'>;
      return {
        ...base,
        title: t('kinds.registrationRequest.title', {
          requesterName: short ?? t('somePlayerFallback'),
        }),
        subtitle: [
          p.game_name,
          p.team_name ? t('board.team', { teamName: p.team_name }) : null,
          teeOffLine(ctx.teeOffByGame[p.game_id], ctx),
        ]
          .filter((part): part is string => Boolean(part))
          .join(SEP),
        quote: p.message?.trim() ? t('board.quoted', { message: p.message.trim() }) : null,
        avatar: singleAvatar(row),
        destination,
        actionKey,
      };
    }
    return { ...base, ...plainText(row, time, ctx, catalogText(row, t).title), avatar: singleAvatar(row), destination, actionKey };
  }

  switch (row.kind) {
    case 'peer_approval_request': {
      const p = row.payload as NotificationPayload<'peer_approval_request'>;
      return {
        ...base,
        title: t('board.deliveredOne', { name: short ?? t('somePlayerFallback') }),
        subtitle: [p.game_name, time].join(SEP),
        avatar: singleAvatar(row),
        destination,
      };
    }
    case 'registration_request': {
      const p = row.payload as NotificationPayload<'registration_request'>;
      return {
        ...base,
        title: t('board.signedUp', { name: short ?? t('somePlayerFallback') }),
        subtitle: [p.game_name, time].join(SEP),
        avatar: singleAvatar(row),
        destination,
      };
    }
    case 'friend_accepted': {
      const p = row.payload as NotificationPayload<'friend_accepted'>;
      const name = short ?? t('someoneFallback');
      return {
        ...base,
        title:
          p.via === 'link'
            ? t('board.friendViaLink', { name })
            : p.via === 'accept'
              ? t('board.friendViaAccept', { name })
              : t('kinds.friendAccepted.title', { actorName: name }),
        subtitle: time,
        avatar: singleAvatar(row),
        destination,
      };
    }
    case 'game_finished':
      return {
        ...base,
        title: t('kinds.gameFinished.title'),
        ...resultView(row, ctx),
        destination,
      };
    case 'product_update': {
      const p = row.payload as NotificationPayload<'product_update'>;
      return {
        ...base,
        title: p.title,
        subtitle: time,
        body: p.body,
        cta: p.link && p.cta_label ? { href: p.link, label: p.cta_label } : null,
        avatar: singleAvatar(row),
        destination,
      };
    }
    default:
      return {
        ...base,
        ...plainText(row, time, ctx, readTitle(row, t)),
        avatar: singleAvatar(row),
        destination,
      };
  }
}

/** Title + `{kontekst} · {tid}` (or `{detalj} · {tid}` for the detail kinds). */
function plainText(
  row: InboxRow,
  time: string,
  ctx: InboxTextContext,
  title: string,
): Pick<InboxEntryView, 'title' | 'subtitle' | 'subtitleIsFreeText'> {
  if (DETAIL_KINDS.has(row.kind)) {
    return {
      title,
      subtitle: [catalogText(row, ctx.t).detail, time].join(SEP),
      subtitleIsFreeText: FREE_TEXT_KINDS.has(row.kind),
    };
  }
  const context = contextName(row.payload);
  return { title, subtitle: context ? [context, time].join(SEP) : time, subtitleIsFreeText: false };
}
