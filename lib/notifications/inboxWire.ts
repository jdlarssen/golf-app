import { SHOW_KRONER_IN_APP } from '@/lib/launchRules';
import {
  FRIEND_KINDS,
  buildInboxEntryView,
  buildInboxSections,
  countActionRows,
  type InboxBoard,
  type InboxEntryView,
  type InboxSectionKey,
  type InboxTextContext,
} from './inboxSections';
import { QUIET_KINDS, isKnownKind, isWaitingRow } from './readOnVisit';
import type { NotificationKind } from './types';

/**
 * The inbox as the app reads it from `GET /api/inbox` (#2759). Finished rows: the
 * app cannot bundle `messages/no.json` (Metro only sees `lib/`), and the rules
 * for what waits, what groups and what a row says have one home on the server.
 * `app/api/inbox/route.ts` keeps the wire's written form. The app has its own
 * reader in `native/app/src/data/inbox.ts` and imports the types from here.
 */
export type InboxWireEntry = InboxEntryView & {
  key: string;
  unread: boolean;
  /** What a tap marks read: the unread rows behind the entry that do not wait. */
  unreadIds: string[];
  /** A friend request or a new friendship: the «Venner» chip filters on this. */
  friend: boolean;
  /** «Godta» and «Avslå» answer it in place, with `key` as the varsel's id. */
  decidable: boolean;
};

export type InboxWire = {
  /** The number on the «Krever handling» chip. */
  actionCount: number;
  /** Something «Marker alt lest» can touch. Otherwise the pill is «Tøm leste». */
  hasUnread: boolean;
  /** The envelope on Home: unread rows, without news about Tørny (`QUIET_KINDS`). */
  unreadCount: number;
  sections: Record<InboxSectionKey, InboxWireEntry[]>;
};

const SECTION_KEYS: InboxSectionKey[] = ['action', 'today', 'earlier'];

export function buildInboxWire(
  board: InboxBoard,
  translators: Pick<InboxTextContext, 't' | 'tFinished' | 'locale'>,
): InboxWire {
  const rows = board.rows.filter((row) => isKnownKind(row.kind));
  const ctx: InboxTextContext = {
    ...translators,
    now: board.now,
    teeOffByGame: board.teeOffByGame,
    resultByGame: board.resultByGame,
    finishedGameIds: board.finishedGameIds,
    leagueFlightGameIds: board.leagueFlightGameIds,
    // The same switch as push to the app (`sendPush`).
    surface: SHOW_KRONER_IN_APP ? 'web' : 'app',
  };
  const sections = buildInboxSections(rows, { filter: 'all', now: board.now });
  const toWire = (key: InboxSectionKey): InboxWireEntry[] =>
    sections[key].map((entry) => {
      const view = buildInboxEntryView(entry, key, ctx);
      return {
        ...view,
        key: entry.key,
        unread: entry.unread,
        unreadIds: entry.rows.filter((r) => r.read_at == null && !isWaitingRow(r)).map((r) => r.id),
        friend: entry.rows.some((r) => FRIEND_KINDS.has(r.kind)),
        decidable: entry.type === 'single' && view.actionKey === 'decide',
      };
    });
  return {
    actionCount: countActionRows(rows),
    hasUnread: rows.some((row) => row.read_at == null && !isWaitingRow(row)),
    unreadCount: rows.filter(
      (row) => row.read_at == null && !QUIET_KINDS.includes(row.kind as NotificationKind),
    ).length,
    sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, toWire(key)])) as InboxWire['sections'],
  };
}
