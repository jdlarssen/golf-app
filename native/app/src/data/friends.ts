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
  asFriendStatus,
  asInviteStatus,
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
  /** Handicap når profilen er ferdig, ellers `null`. */
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
