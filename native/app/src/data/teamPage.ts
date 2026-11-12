// native/app/src/data/teamPage.ts
// #2840 del 3: lagsiden i appen, via `/api/pamelding/{shortId}/lag`.
//
// Som `roundInvite.ts`: fila er tynn. Hvem som får gjøre hva, avgjør serveren
// (`teamDashboardCore.ts`): bare lagets kaptein styrer laget, og en forespørsel eller
// invitasjon er bare din egen. Ingenting legges i sync-køen: uten nett stopper kallet
// før det går ut.
//
// **Wire-kontrakten** (typene står i `lib/games/appRoundInviteView.ts`):
//   GET  200 AppTeamPageResponse · 401 · 404 { error: 'game_not_found' } · 500
//   POST { intent: 'remove' | 'resend' | 'transfer', requestId }
//        { intent: 'attach', invitationId }
//        { intent: 'add', friendId, replaceRequestId? }
//        200 { status: 'removed' | 'resent' | 'transferred' | 'attached' } | { status: 'added', replaced? }
//        400 bad_request · 401 · 403 teammate_not_friend · 404 not_found
//        409 game_locked | signup_closed | profile_incomplete | not_approved
//            | captain_is_guest | team_unknown | team_full | already_registered
//        500 db_error
//
// Utfallene er TYPEDE koder, aldri bruker-tekst. Teksten bor i `lib/teamPageCopy.ts`.
import type {
  AppTeamPageAnswer,
  AppTeamPageGame,
  AppTeamPageMember,
  AppTeamPagePerson,
  AppTeamPageResponse,
  TeamRequestStatus,
} from '../../../../lib/games/appRoundInviteView';
import { callWebRoute, type WebApiFailure } from './webApi';

export type TeamPageLoadFailure = WebApiFailure | 'not_found' | 'load_failed';

export type TeamPageLoadResult =
  | { ok: true; view: AppTeamPageResponse }
  | { ok: false; reason: TeamPageLoadFailure };

/** Svarene der ruta sier nei til en handling på lagsiden. */
export type TeamPageRefusal =
  | 'teammate_not_friend'
  | 'game_locked'
  | 'signup_closed'
  | 'profile_incomplete'
  | 'not_approved'
  | 'captain_is_guest'
  | 'team_unknown'
  | 'team_full'
  | 'already_registered';

export type TeamPageActionFailure = TeamPageRefusal | WebApiFailure | 'not_found' | 'db_error';

export type TeamPageActionResult =
  | ({ ok: true } & AppTeamPageAnswer)
  | { ok: false; reason: TeamPageActionFailure };

/** `Record<…, true>` er porten: en ny kode uten en linje her faller på `tsc`. */
const REFUSALS: Record<TeamPageRefusal, true> = {
  teammate_not_friend: true,
  game_locked: true,
  signup_closed: true,
  profile_incomplete: true,
  not_approved: true,
  captain_is_guest: true,
  team_unknown: true,
  team_full: true,
  already_registered: true,
};

const REFUSAL_CODES: ReadonlySet<unknown> = new Set(Object.keys(REFUSALS));

const STATUSES: readonly unknown[] = ['pending', 'approved', 'rejected', 'withdrawn'] satisfies TeamRequestStatus[];

const route = (shortId: string) => `/api/pamelding/${encodeURIComponent(shortId)}/lag`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function readGame(value: unknown): AppTeamPageGame | null {
  if (!isRecord(value)) return null;
  const { id, shortId, name } = value;
  if (typeof id !== 'string' || typeof shortId !== 'string' || typeof name !== 'string') return null;
  if (value.joinEffect !== 'instant' && value.joinEffect !== 'approval') return null;
  return {
    id,
    shortId,
    name,
    courseName: str(value.courseName),
    joinEffect: value.joinEffect,
    signupsClosed: value.signupsClosed === true,
    // En eldre server sender ingen av dem: da står ingen ledige plasser og ingen tid.
    teamSize: typeof value.teamSize === 'number' && value.teamSize >= 2 ? value.teamSize : null,
    teeOffAt: str(value.teeOffAt),
  };
}

function readPerson(value: unknown): AppTeamPagePerson | null {
  if (!isRecord(value)) return null;
  const { requestId, userId, status } = value;
  if (typeof requestId !== 'string' || typeof userId !== 'string' || !STATUSES.includes(status)) return null;
  return { requestId, userId, displayName: str(value.displayName), status: status as TeamRequestStatus };
}

/** Én medspiller. En rad med feil form faller bort; et ukjent gjeste-flagg er en gjest, som på serveren. */
function readMember(value: unknown): AppTeamPageMember[] {
  const person = readPerson(value);
  if (!person || !isRecord(value)) return [];
  return [{ ...person, isGuest: value.isGuest !== false }];
}

/** Visningen, eller `null` når den har feil form. */
export function readTeamPageView(body: unknown): AppTeamPageResponse | null {
  if (!isRecord(body)) return null;
  const game = readGame(body.game);
  if (!game) return null;
  switch (body.kind) {
    case 'no_team':
    case 'solo':
      return { kind: body.kind, game };
    case 'team_unknown':
      return { kind: 'team_unknown', game, noCaptain: body.noCaptain === true };
    case 'invited_unknown': {
      const invitationId = str(body.invitationId);
      if (!invitationId) return null;
      return {
        kind: 'invited_unknown',
        game,
        invitationId,
        captainName: str(body.captainName),
        teamName: str(body.teamName),
      };
    }
    case 'captain':
    case 'member': {
      const myRowId = str(body.myRowId);
      if (!myRowId || !STATUSES.includes(body.myStatus) || !Array.isArray(body.members)) return null;
      return {
        kind: body.kind,
        game,
        myRowId,
        myStatus: body.myStatus as TeamRequestStatus,
        teamName: str(body.teamName),
        captain: readPerson(body.captain),
        members: body.members.flatMap(readMember),
        ...(body.kind === 'captain'
          ? {
              unavailableFriendIds: Array.isArray(body.unavailableFriendIds)
                ? body.unavailableFriendIds.filter((id): id is string => typeof id === 'string')
                : [],
            }
          : {}),
      };
    }
    default:
      return null;
  }
}

/** Laget ditt i runden, eller hvorfor det ikke er noe lag å vise. */
/**
 * `visit: false` er en titt (#2840): raden «Laget ditt» leser laget uten at plassen
 * bekreftes eller lagvarslene merkes lest. Det gjør bare lagsiden selv.
 */
export async function fetchTeamPage(
  shortId: string,
  { visit = true }: { visit?: boolean } = {},
): Promise<TeamPageLoadResult> {
  const call = await callWebRoute(visit ? route(shortId) : `${route(shortId)}?visit=0`, 'GET');
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, reason: 'not_found' };
  if (call.status !== 200) return { ok: false, reason: 'load_failed' };
  const view = readTeamPageView(call.body);
  return view ? { ok: true, view } : { ok: false, reason: 'load_failed' };
}

const ANSWERS: readonly unknown[] = ['removed', 'resent', 'transferred', 'attached', 'added'] satisfies AppTeamPageAnswer['status'][];

async function act(shortId: string, body: Record<string, unknown>): Promise<TeamPageActionResult> {
  const call = await callWebRoute(route(shortId), 'POST', body);
  if (!call.ok) return call;
  if (call.status === 200) {
    const { status, replaced } = call.body;
    if (!ANSWERS.includes(status)) return { ok: false, reason: 'db_error' };
    if (status === 'added') {
      return typeof replaced === 'boolean' ? { ok: true, status, replaced } : { ok: true, status };
    }
    return { ok: true, status: status as Exclude<AppTeamPageAnswer['status'], 'added'> };
  }
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, reason: 'not_found' };
  const { error } = call.body;
  return REFUSAL_CODES.has(error) ? { ok: false, reason: error as TeamPageRefusal } : { ok: false, reason: 'db_error' };
}

/** «Fjern fra laget». Plassen blir ledig. */
export function removeTeammate(shortId: string, requestId: string): Promise<TeamPageActionResult> {
  return act(shortId, { intent: 'remove', requestId });
}

/** «Send på nytt»: varselet går til en medspiller som ikke har svart. */
export function resendInvite(shortId: string, requestId: string): Promise<TeamPageActionResult> {
  return act(shortId, { intent: 'resend', requestId });
}

/** «Gi kapteinsrollen». Bare til en som har sagt ja og ikke er gjest (0228). */
export function transferCaptaincy(shortId: string, requestId: string): Promise<TeamPageActionResult> {
  return act(shortId, { intent: 'transfer', requestId });
}

/** «Bli med på laget» fra en gammel invitasjon på e-post. */
export function attachToTeam(shortId: string, invitationId: string): Promise<TeamPageActionResult> {
  return act(shortId, { intent: 'attach', invitationId });
}

/**
 * «Legg <navn> til på laget»: en venn på en ledig plass, eller i stedet for en som
 * takket nei (`replaceRequestId`).
 */
export function addTeammate(
  shortId: string,
  friendId: string,
  replaceRequestId?: string | null,
): Promise<TeamPageActionResult> {
  return act(shortId, { intent: 'add', friendId, ...(replaceRequestId ? { replaceRequestId } : {}) });
}
