// native/app/src/data/friends.ts
// #2256: vennene i appen — lista og handlingene, alt gjennom `/api/friends/*`.
//
// **Hvorfor serverruter.** Vennene, forespørslene og forslagene leses med
// admin-klienten (`users` er ikke lesbar for andre), og varslene etter en
// handling sendes med den. En telefon kan aldri holde den nøkkelen, så appen
// spør serveren, og serveren kjører den samme kjernen som webben
// (`lib/friends/friendActionsCore.ts`).
//
// **Ingen kø.** Vennehandlinger har ingen lokal-først-vei: uten nett stopper
// `callWebRoute` med `offline`, og skjermen sier at venner krever tilkobling.
//
// **Ingen id for kalleren i kroppen.** Hvem som handler, er tokenets sak.
//
// Status → kode oversettes her, ikke på skjermen (samme arbeidsdeling som
// `data/profile.ts`). Skjermen leser aldri et statusnummer.
import {
  FRIEND_LINK_RELATIONS,
  asFriendStatus,
  asInviteStatus,
  type FriendLinkRelation,
  type FriendStatus,
  type InviteStatus,
} from '../../../../lib/friends/friendStatus';
import { callWebRoute, type WebApiFailure } from './webApi';

/** Det dere har spilt sammen (`lib/friends/friendStats.ts` på serveren). */
export interface FriendStats {
  roundsTogether: number;
  lastPlayedAt: string | null;
  lastGameName: string | null;
}

export interface FriendPerson {
  id: string;
  /** Visningsnavnet serveren ga (navn, ellers maskert adresse). */
  name: string;
  /** `null` = tallene kunne ikke leses (eller en eldre server uten dem). */
  stats: FriendStats | null;
}

export interface FriendItem extends FriendPerson {
  /**
   * Handicap når profilen er ferdig OG dere har minst én ferdig runde sammen
   * (ingen av dere trakk dere), ellers `null` (#2267).
   */
  hcp: number | null;
}

export interface FriendRequestItem extends FriendPerson {
  /** `friendships.id` — det godta, avslå og trekk trenger. */
  requestId: string;
}

export interface FriendsData {
  /** Sist spilt først, så navn (serverens rekkefølge). */
  friends: FriendItem[];
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
  suggestions: FriendPerson[];
  /** Din egen venne-kode til delelenka, eller `null` (da vises ikke delingen). */
  friendCode: string | null;
}

export type FriendsLoadResult =
  | { ok: true; data: FriendsData }
  | { ok: false; reason: WebApiFailure | 'load_failed' };

export type FriendActionResult<S> = { ok: true; status: S } | { ok: false; reason: WebApiFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readStats(value: unknown): FriendStats | null {
  if (!isRecord(value) || typeof value.roundsTogether !== 'number') return null;
  return {
    roundsTogether: value.roundsTogether,
    lastPlayedAt: typeof value.lastPlayedAt === 'string' ? value.lastPlayedAt : null,
    lastGameName: typeof value.lastGameName === 'string' ? value.lastGameName : null,
  };
}

function readPerson(item: Record<string, unknown> & { id: string }): FriendPerson {
  return {
    id: item.id,
    name: typeof item.name === 'string' ? item.name : '',
    stats: readStats(item.stats),
  };
}

function readPeople(value: unknown): FriendPerson[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isRecord(item) && typeof item.id === 'string' ? [readPerson({ ...item, id: item.id })] : [],
  );
}

function readFriends(value: unknown): FriendItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isRecord(item) && typeof item.id === 'string'
      ? [
          {
            ...readPerson({ ...item, id: item.id }),
            hcp: typeof item.hcp === 'number' ? item.hcp : null,
          },
        ]
      : [],
  );
}

function readRequests(value: unknown): FriendRequestItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isRecord(item) && typeof item.id === 'string' && typeof item.requestId === 'string'
      ? [{ requestId: item.requestId, ...readPerson({ ...item, id: item.id }) }]
      : [],
  );
}

/** Vennene dine, forespørslene begge veier og forslagene. */
export async function fetchFriends(): Promise<FriendsLoadResult> {
  const call = await callWebRoute('/api/friends', 'GET');
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status !== 200) return { ok: false, reason: 'load_failed' };

  const body = call.body;
  return {
    ok: true,
    data: {
      friends: readFriends(body.friends),
      incoming: readRequests(body.incoming),
      outgoing: readRequests(body.outgoing),
      suggestions: readPeople(body.suggestions),
      friendCode: typeof body.friendCode === 'string' && body.friendCode ? body.friendCode : null,
    },
  };
}

/**
 * Din egen venne-kode, til QR-koden på bag-taggen (#2627), fra den lette
 * `/api/friends/code` i stedet for hele vennesiden. `null` ved alt som ikke er
 * en kode (ikke innlogget, serverfeil, uten nett, tom kode): kortet tegner da
 * initialringen som før, og Profil viser ingen feil for den. Kaster aldri.
 */
export async function fetchFriendCode(): Promise<string | null> {
  try {
    const call = await callWebRoute('/api/friends/code', 'GET');
    if (!call.ok || call.status !== 200) return null;
    const code = call.body.friendCode;
    return typeof code === 'string' && code ? code : null;
  } catch (err) {
    console.error('[friends] kodeoppslag feilet', err);
    return null;
  }
}

export type FriendLinkLoadResult =
  | { ok: true; relation: FriendLinkRelation; name: string }
  | { ok: false; reason: WebApiFailure | 'not_found' | 'load_failed' };

/** Ruta for en venne-kode. Koden står i stien, kodet, så den aldri blir en annen sti. */
function friendLinkRoute(code: string): string {
  return `/api/friends/link/${encodeURIComponent(code)}`;
}

/**
 * Hvem venne-lenka tilhører, sett fra deg (#2627): navnet (maskert på
 * serveren) og forholdet. `not_found` er en ukjent kode eller en slettet konto.
 */
export async function fetchFriendLink(code: string): Promise<FriendLinkLoadResult> {
  const call = await callWebRoute(friendLinkRoute(code), 'GET');
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, reason: 'not_found' };
  if (call.status !== 200) return { ok: false, reason: 'load_failed' };
  const { relation, name } = call.body;
  if (!(FRIEND_LINK_RELATIONS as readonly unknown[]).includes(relation)) {
    return { ok: false, reason: 'load_failed' };
  }
  return {
    ok: true,
    relation: relation as FriendLinkRelation,
    name: typeof name === 'string' ? name : '',
  };
}

/** Bli venner via venne-lenka (#2627): `accepted` når dere ble venner nå. */
export function connectFriendLink(code: string): Promise<FriendActionResult<FriendStatus>> {
  return act(friendLinkRoute(code), {}, asFriendStatus);
}

/**
 * Én handling mot sin rute. 401 er «ikke innlogget»; ellers leses `status`
 * fra kroppen, også på en 500, der ruta svarer `{ status: 'error' }`.
 */
async function act<S>(
  path: string,
  body: Record<string, unknown>,
  read: (value: unknown) => S,
): Promise<FriendActionResult<S>> {
  const call = await callWebRoute(path, 'POST', body);
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  return { ok: true, status: read(call.body.status) };
}

export function sendFriendRequest(addresseeId: string): Promise<FriendActionResult<FriendStatus>> {
  return act('/api/friends/request', { addresseeId }, asFriendStatus);
}

export function addFriendByEmail(email: string): Promise<FriendActionResult<FriendStatus>> {
  return act('/api/friends/by-email', { email }, asFriendStatus);
}

export function respondToFriendRequest(
  requestId: string,
  accept: boolean,
): Promise<FriendActionResult<FriendStatus>> {
  return act('/api/friends/respond', { requestId, accept }, asFriendStatus);
}

export function removeFriend(otherId: string): Promise<FriendActionResult<FriendStatus>> {
  return act('/api/friends/remove', { otherId }, asFriendStatus);
}

export function inviteFriend(email: string): Promise<FriendActionResult<InviteStatus>> {
  return act('/api/friends/invite', { email }, asInviteStatus);
}
