// native/app/src/data/inbox.ts
// #2759: innboksen i appen.
//
// **Tavla og svaret på en påmelding går gjennom serveren.** Tavla trenger
// oppslag med admin-klienten og tekster fra katalogen, og «Godta» skriver til
// `game_players` med den nøkkelen en telefon aldri kan holde. Serveren kjører
// reglene webben bruker (`lib/notifications/inboxSections.ts`,
// `lib/notifications/decideFromInbox.ts`).
//
// **Tallet på Hjem kommer med tavla.** Hjem spør serveren, fordi en sak som venter
// først blir lest når serveren ser at den er gjort (#2759). Da faller tallet
// straks kortet er godkjent, uten at innboksen må åpnes.
//
// **De to knappene øverst går rett til Supabase under RLS.** De skriver bare egne
// rader (`notifications_update_own`), og det samme gjør `markRead.ts`.
//
// **Ingen kø og ingen lokal kopi.** Varsler er ferskvare. Uten nett stopper
// `callWebRoute` med `offline`, og skjermen sier at innboksen krever nett.
//
// Status → kode oversettes her, ikke på skjermen (samme arbeidsdeling som
// `data/friends.ts`). Skjermen leser aldri et statusnummer.
import type { InboxAvatar, InboxSectionKey } from '../../../../lib/notifications/inboxSections';
import type { InboxWire, InboxWireEntry } from '../../../../lib/notifications/inboxWire';
import { NOT_WAITING_FILTER } from '../../../../lib/notifications/readOnVisit';
import { supabase } from '../supabase';
import { callWebRoute, type WebApiFailure } from './webApi';

export type InboxLoadResult =
  | { ok: true; board: InboxWire }
  | { ok: false; reason: WebApiFailure | 'load_failed' };

export type DecideResult =
  | {
      ok: true;
      outcome: 'approved' | 'rejected';
      gameName: string;
      teamName: string | null;
      /** Fornavnet til den som ba om å bli med, eller `null`. */
      name: string | null;
    }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readAvatar(value: unknown): InboxAvatar {
  if (isRecord(value)) {
    if (value.kind === 'people' && Array.isArray(value.initials)) {
      return {
        kind: 'people',
        initials: value.initials.filter((item): item is string => typeof item === 'string'),
        more: typeof value.more === 'number' ? value.more : 0,
      };
    }
    if (value.kind === 'place' && typeof value.rank === 'number') {
      return { kind: 'place', rank: value.rank };
    }
    if (value.kind === 'icon' && typeof value.icon === 'string') {
      return { kind: 'icon', icon: value.icon as Extract<InboxAvatar, { kind: 'icon' }>['icon'] };
    }
  }
  return { kind: 'icon', icon: 'konvolutt' };
}

function readCta(value: unknown): InboxWireEntry['cta'] {
  return isRecord(value) && typeof value.href === 'string' && typeof value.label === 'string'
    ? { href: value.href, label: value.label }
    : null;
}

function readEntries(value: unknown): InboxWireEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): InboxWireEntry[] => {
    if (!isRecord(item) || typeof item.key !== 'string' || typeof item.title !== 'string') return [];
    return [
      {
        key: item.key,
        title: item.title,
        subtitle: typeof item.subtitle === 'string' ? item.subtitle : '',
        subtitleIsFreeText: item.subtitleIsFreeText === true,
        quote: textOrNull(item.quote),
        body: textOrNull(item.body),
        cta: readCta(item.cta),
        avatar: readAvatar(item.avatar),
        placeLabel: textOrNull(item.placeLabel),
        destination: textOrNull(item.destination),
        actionKey: textOrNull(item.actionKey) as InboxWireEntry['actionKey'],
        unread: item.unread === true,
        unreadIds: Array.isArray(item.unreadIds)
          ? item.unreadIds.filter((id): id is string => typeof id === 'string')
          : [],
        friend: item.friend === true,
        decidable: item.decidable === true,
      },
    ];
  });
}

const SECTION_KEYS: readonly InboxSectionKey[] = ['action', 'today', 'earlier'];

/** Tavla. Et svar uten seksjoner er en feil, ikke en tom innboks (#1392). */
export async function loadInbox(): Promise<InboxLoadResult> {
  const call = await callWebRoute('/api/inbox', 'GET');
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status !== 200 || !isRecord(call.body.sections)) return { ok: false, reason: 'load_failed' };

  const raw = call.body.sections;
  const [action, today, earlier] = SECTION_KEYS.map((key) => readEntries(raw[key]));
  return {
    ok: true,
    board: {
      actionCount: typeof call.body.actionCount === 'number' ? call.body.actionCount : action!.length,
      hasUnread: call.body.hasUnread === true,
      unreadCount: typeof call.body.unreadCount === 'number' ? call.body.unreadCount : 0,
      sections: { action: action!, today: today!, earlier: earlier! },
    },
  };
}

/** «Godta» eller «Avslå». Stien bærer varselet, kroppen bare svaret. */
export async function decideRequest(
  notificationId: string,
  decision: 'approve' | 'reject',
): Promise<DecideResult> {
  const call = await callWebRoute(
    `/api/inbox/${encodeURIComponent(notificationId)}/decide`,
    'POST',
    { decision },
  );
  if (!call.ok) return call;
  const { body } = call;
  if (
    call.status === 200 &&
    (body.outcome === 'approved' || body.outcome === 'rejected') &&
    typeof body.gameName === 'string'
  ) {
    return {
      ok: true,
      outcome: body.outcome,
      gameName: body.gameName,
      teamName: textOrNull(body.teamName),
      name: textOrNull(body.name),
    };
  }
  return { ok: false, reason: typeof body.reason === 'string' ? body.reason : 'error' };
}

/**
 * Tallet på konvolutten, eller `null` når det ikke kunne hentes: en feil er ikke
 * null uleste, så Hjem lar forrige tall stå. Serveren teller som prikken på
 * webben (`DOT_KINDS`), etter at sakene som er gjort, er ute.
 */
export async function unreadCount(): Promise<number | null> {
  const result = await loadInbox();
  return result.ok ? result.board.unreadCount : null;
}

async function ownWrite(what: string, write: () => PromiseLike<{ error: { message: string } | null }>) {
  try {
    const { error } = await write();
    if (error) {
      console.error(`[inbox] ${what} feilet`, error.message);
      return false;
    }
    return true;
  } catch (err: unknown) {
    console.error(`[inbox] ${what} feilet`, err);
    return false;
  }
}

/**
 * «Marker alt lest». 0 rader er ingen feil: da var ingenting ulest. En sak som
 * venter, blir stående (#2759).
 */
export function markAllRead(): Promise<boolean> {
  return ownWrite('marker alt lest', () =>
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .or(NOT_WAITING_FILTER),
  );
}

/** «Tøm leste»: leste varsler skjules, uleste røres ikke (#616). Radene slettes aldri. */
export function clearRead(): Promise<boolean> {
  return ownWrite('tøm leste', () =>
    supabase
      .from('notifications')
      .update({ archived_at: new Date().toISOString() })
      .not('read_at', 'is', null)
      .is('archived_at', null),
  );
}
