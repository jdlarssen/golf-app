import type { AppLocale } from '@/i18n/routing';
import {
  FRIEND_KINDS,
  buildInboxEntryView,
  buildInboxSections,
  waitsUntilDone,
  type InboxEntry,
  type InboxEntryView,
  type InboxRow,
  type InboxSectionKey,
  type InboxTextContext,
} from './inboxSections';
import type { NotificationSurface, NotificationTranslator } from './cardContent';
import { DOT_KINDS, isKnownKind } from './readOnVisit';

/**
 * What `GET /api/inbox` sends the app (#2759). The app cannot bundle the
 * catalog and has no lookups, so the server builds the whole board, in finished
 * text, with the rules the web inbox uses.
 *
 * Fields are only ever added: an app in the store reads this shape.
 */
export type InboxWireEntry = InboxEntryView & {
  key: string;
  unread: boolean;
  /**
   * The rows a tap marks read. Rows already read are not written again (#1665),
   * and a row that waits is not written at all (#2759): it leaves when it is done.
   */
  unreadIds: string[];
  /** A friend row. «Venner» in the app is a filter on this. */
  friend: boolean;
  /** «Godta»/«Avslå» answer this row. Then `key` is the varsel's id. */
  decidable: boolean;
};

export type InboxWire = {
  actionCount: number;
  /** Rows «Marker alt lest» can mark: a row that waits does not count. */
  hasUnread: boolean;
  /** The number on the envelope on Hjem: unread rows, also the ones that wait. No news. */
  unreadCount: number;
  sections: Record<InboxSectionKey, InboxWireEntry[]>;
};

export type InboxWireInput = {
  rows: InboxRow[];
  now: number;
  teeOffByGame: InboxTextContext['teeOffByGame'];
  resultByGame: InboxTextContext['resultByGame'];
  finishedGameIds: readonly string[];
  leagueFlightGameIds: readonly string[];
};

function toWireEntry(
  entry: InboxEntry,
  section: InboxSectionKey,
  ctx: InboxTextContext,
): InboxWireEntry {
  const view = buildInboxEntryView(entry, section, ctx);
  return {
    ...view,
    key: entry.key,
    unread: entry.unread,
    unreadIds: entry.rows.filter((row) => row.read_at == null && !waitsUntilDone(row)).map((row) => row.id),
    friend: entry.rows.some((row) => FRIEND_KINDS.has(row.kind)),
    decidable: entry.type === 'single' && view.actionKey === 'decide',
  };
}

export function buildInboxWire(
  board: InboxWireInput,
  text: {
    t: NotificationTranslator;
    tFinished: NotificationTranslator;
    locale: AppLocale;
    surface: NotificationSurface;
  },
): InboxWire {
  const ctx: InboxTextContext = {
    ...text,
    now: board.now,
    teeOffByGame: board.teeOffByGame,
    resultByGame: board.resultByGame,
    finishedGameIds: board.finishedGameIds,
    leagueFlightGameIds: board.leagueFlightGameIds,
  };
  const sections = buildInboxSections(board.rows, { filter: 'all', now: board.now });
  return {
    actionCount: sections.action.length,
    hasUnread: board.rows.some(
      (row) => isKnownKind(row.kind) && row.read_at == null && !waitsUntilDone(row),
    ),
    unreadCount: board.rows.filter((row) => row.read_at == null && DOT_KINDS.includes(row.kind)).length,
    sections: {
      action: sections.action.map((entry) => toWireEntry(entry, 'action', ctx)),
      today: sections.today.map((entry) => toWireEntry(entry, 'today', ctx)),
      earlier: sections.earlier.map((entry) => toWireEntry(entry, 'earlier', ctx)),
    },
  };
}
