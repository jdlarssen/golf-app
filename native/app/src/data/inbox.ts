// native/app/src/data/inbox.ts
// #2759: innboksen i appen.
//
// **Hvorfor en serverrute for lista.** Tavla slår opp spill, kort og påmeldinger
// med admin-klienten, og radtekstene kommer fra `messages/no.json`, som Metro
// ikke ser. Serveren sender ferdige rader (`GET /api/inbox`, samme regler som
// webben), og appen gjentar ingen av dem. Samme ruta merker sakene som er gjort,
// så tallet på Hjem faller uten at innboksen åpnes.
//
// **Uten nett** stopper `callWebRoute` med `offline`, som for vennene. Varsler er
// ferskvare, så det finnes ingen lokal kopi og ingen kø.
//
// **Direkte under RLS:** lest og «Tøm leste» skriver bare egne rader
// (`notifications_update_own`), som `data/markRead.ts`. En sak som venter, røres
// aldri av dem (`NOT_WAITING_FILTER`).
//
// Status → kode oversettes her, ikke på skjermen (samme arbeidsdeling som
// `data/friends.ts`). Skjermen leser aldri et statusnummer.
import { NOT_WAITING_FILTER } from '../../../../lib/notifications/readOnVisit';
import type { InboxWireEntry } from '../../../../lib/notifications/inboxWire';
import { supabase } from '../supabase';
import { callWebRoute, type WebApiFailure } from './webApi';

export type InboxEntry = InboxWireEntry;
export type InboxSectionKey = 'action' | 'today' | 'earlier';
export type InboxFilter = 'all' | 'action' | 'friends';

export const INBOX_SECTION_ORDER: readonly InboxSectionKey[] = ['action', 'today', 'earlier'];

export interface InboxData {
  actionCount: number;
  /** Noe «Marker alt lest» kan røre. Ellers er pillen «Tøm leste». */
  hasUnread: boolean;
  /** Tallet på Hjem. */
  unreadCount: number;
  sections: Record<InboxSectionKey, InboxEntry[]>;
}

export type InboxLoadResult =
  | { ok: true; data: InboxData }
  | { ok: false; reason: WebApiFailure | 'load_failed' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readEntries(value: unknown): InboxEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is InboxEntry =>
      isRecord(item) &&
      typeof item.key === 'string' &&
      typeof item.title === 'string' &&
      typeof item.subtitle === 'string' &&
      isRecord(item.avatar) &&
      Array.isArray(item.unreadIds),
  );
}

/** Tavla fra serveren. Et svar uten seksjoner er en feil, aldri en tom innboks (#1392). */
export async function loadInbox(): Promise<InboxLoadResult> {
  const call = await callWebRoute('/api/inbox', 'GET');
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status !== 200 || !isRecord(call.body.sections)) return { ok: false, reason: 'load_failed' };

  const { actionCount, hasUnread, unreadCount, sections } = call.body as {
    actionCount?: unknown;
    hasUnread?: unknown;
    unreadCount?: unknown;
    sections: Record<string, unknown>;
  };
  return {
    ok: true,
    data: {
      actionCount: typeof actionCount === 'number' ? actionCount : 0,
      hasUnread: hasUnread === true,
      unreadCount: typeof unreadCount === 'number' ? unreadCount : 0,
      sections: {
        action: readEntries(sections.action),
        today: readEntries(sections.today),
        earlier: readEntries(sections.earlier),
      },
    },
  };
}

/** Tallet på Hjem, eller `null` når det ikke kunne leses: da står det forrige tallet. */
export async function fetchInboxUnreadCount(): Promise<number | null> {
  const result = await loadInbox();
  return result.ok ? result.data.unreadCount : null;
}

export function inboxIsEmpty(data: InboxData): boolean {
  return INBOX_SECTION_ORDER.every((key) => data.sections[key].length === 0);
}

/**
 * Brikkene. «Krever handling» viser bare den seksjonen, «Venner» det `friend`
 * sier. Vennetypene grupperes aldri, så dette er de samme radene som webbens
 * filter (`lib/notifications/inboxWire.test.ts`).
 */
export function filterInboxSection(
  entries: InboxEntry[],
  key: InboxSectionKey,
  filter: InboxFilter,
): InboxEntry[] {
  if (filter === 'friends') return entries.filter((entry) => entry.friend);
  return filter === 'action' && key !== 'action' ? [] : entries;
}

export type InboxDecision = 'approve' | 'reject';

export type InboxDecideFailure =
  | WebApiFailure
  | 'forbidden'
  | 'not_pending'
  | 'request_not_found'
  | 'game_not_found'
  | 'game_locked'
  | 'no_team_slot'
  | 'failed';

export type InboxDecideResult =
  | {
      ok: true;
      outcome: 'approved' | 'rejected';
      gameName: string;
      teamName: string | null;
      name: string | null;
    }
  | { ok: false; reason: InboxDecideFailure };

const CONFLICTS: ReadonlySet<string> = new Set([
  'not_pending',
  'request_not_found',
  'game_not_found',
  'game_locked',
  'no_team_slot',
]);

/** «Godta» eller «Avslå». Stien bærer varselets id; serveren leser `request_id` fra varselet. */
export async function decideRegistration(
  notificationId: string,
  decision: InboxDecision,
): Promise<InboxDecideResult> {
  const call = await callWebRoute(`/api/inbox/${encodeURIComponent(notificationId)}/decide`, 'POST', { decision });
  if (!call.ok) return call;
  const { outcome, gameName, teamName, name, error } = call.body;
  if (call.status === 200 && (outcome === 'approved' || outcome === 'rejected') && typeof gameName === 'string') {
    return {
      ok: true,
      outcome,
      gameName,
      teamName: typeof teamName === 'string' ? teamName : null,
      name: typeof name === 'string' ? name : null,
    };
  }
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 403) return { ok: false, reason: 'forbidden' };
  if (call.status === 409 && typeof error === 'string' && CONFLICTS.has(error)) {
    return { ok: false, reason: error as InboxDecideFailure };
  }
  return { ok: false, reason: 'failed' };
}

/** «Marker alt lest»: alt ulest som ikke venter. 0 rader er ingen feil. */
export async function markAllRead(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .or(NOT_WAITING_FILTER);
    if (error) console.error('[inbox] «Marker alt lest» feilet', error.message);
    return !error;
  } catch (err: unknown) {
    console.error('[inbox] «Marker alt lest» feilet', err);
    return false;
  }
}

/** «Tøm leste»: arkiverer alt som er lest. 0 rader er ingen feil. */
export async function clearReadRows(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ archived_at: new Date().toISOString() })
      .not('read_at', 'is', null)
      .is('archived_at', null);
    if (error) console.error('[inbox] «Tøm leste» feilet', error.message);
    return !error;
  } catch (err: unknown) {
    console.error('[inbox] «Tøm leste» feilet', err);
    return false;
  }
}
