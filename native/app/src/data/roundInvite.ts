// native/app/src/data/roundInvite.ts
// #2748: den delte påmeldingslenka i appen, via `/api/pamelding/{shortId}`.
//
// Fila er med vilje tynn. Regelen for hva du kan gjøre (`signupOffer`) og skrivingen
// (`selfRegistration`) er nettsidens, på serveren. Appen viser det ruta sender. Ingenting
// legges i sync-køen: uten nett stopper kallet før det går ut.
//
// **Wire-kontrakten** (ruta og denne fila endres i samme PR, typene står i
// `lib/games/appRoundInviteView.ts`):
//   GET  /api/pamelding/{shortId}   200 AppRoundInviteView · 401 · 404 · 500
//   POST /api/pamelding/{shortId}   { intent: 'join', src? } | { intent: 'request', message? }
//                                   | { intent: 'cancel' }
//        200 { status: 'joined', gameId } | { status: 'requested' } | { status: 'cancelled' }
//        400 { error: 'bad_request' | 'message_too_long' } · 401 · 404
//        409 { error: 'game_locked' | 'signup_closed' | 'game_full' | 'wrong_mode'
//                  | 'use_web' | 'profile_incomplete' | 'not_pending' }
//        429 { error: 'rate_limited' } · 500 { error: 'db_error' }
//   `seats` og `canCancelRequest` kom med #2837. Et svar uten dem (en eldre server)
//   leses som ingen plasser og ingen «Trekk forespørselen».
//
//   Lag (#2840): GET har `teamSignup` (lagskjemaet eller ja/nei) og `hasTeamPage`. En
//   eldre server sender ingen av dem, og et `teamSignup` med feil form leses som ingen
//   lagskjerm, så skjermen viser nettknappen som før (`offer` er `web` på en lagrunde).
//   POST /api/pamelding/{shortId}   { intent: 'team', teamName, memberIds }
//                                   | { intent: 'accept_team' | 'decline_team', requestId }
//        200 { status: 'team_registered', captainRequestId, joinEffect, slotResults }
//            | { status: 'team_accepted' } | { status: 'team_declined' }
//        400 { error: 'team_name_invalid' | 'slots_count_wrong' | 'duplicate_members'
//                  | 'self_in_slots' } · 401 · 403 { error: 'teammate_not_friend' }
//        404 { error: 'game_not_found' | 'not_found' }
//        409 { error: 'game_locked' | 'signup_closed' | 'game_full' | 'already_registered'
//                  | 'wrong_type' | 'wrong_mode' | 'mode_does_not_support_teams'
//                  | 'profile_incomplete' }
//        429 { error: 'rate_limited' } · 500 { error: 'db_error' }
//   `team_full` står i lista selv om ruta ikke sender den i dag: lagsiden (del 3) gjør det.
//
// Utfallene er TYPEDE koder, aldri bruker-tekst. HTTP-status oversettes én gang, her.
// Teksten bor i `lib/roundInviteCopy.ts`.
import type {
  AppRoundInviteAnswer,
  AppRoundInviteView,
  AppTeamSignup,
  AppTeamSignupAnswer,
  AppTeamSignupInvited,
  AppTeamSignupMember,
  AppTeamSlotResult,
} from '../../../../lib/games/appRoundInviteView';
import { callWebRoute, type WebApiFailure } from './webApi';

export type RoundInviteLoadFailure = WebApiFailure | 'not_found' | 'load_failed';

export type RoundInviteLoadResult =
  | { ok: true; view: AppRoundInviteView }
  | { ok: false; reason: RoundInviteLoadFailure };

/** Svarene der ruta sier nei. */
export type RoundInviteRefusal =
  | 'game_locked'
  | 'signup_closed'
  | 'game_full'
  | 'wrong_mode'
  | 'use_web'
  | 'profile_incomplete'
  | 'rate_limited'
  | 'message_too_long'
  | 'not_pending';

export type RoundInviteAnswerFailure = RoundInviteRefusal | WebApiFailure | 'not_found' | 'db_error';

export type RoundInviteAnswerResult =
  | ({ ok: true } & AppRoundInviteAnswer)
  | { ok: false; reason: RoundInviteAnswerFailure };

/** `Record<…, true>` er porten: en ny kode uten en linje her faller på `tsc`. */
const REFUSALS: Record<RoundInviteRefusal, true> = {
  game_locked: true,
  signup_closed: true,
  game_full: true,
  wrong_mode: true,
  use_web: true,
  profile_incomplete: true,
  rate_limited: true,
  message_too_long: true,
  not_pending: true,
};

const REFUSAL_CODES: ReadonlySet<unknown> = new Set(Object.keys(REFUSALS));

const OFFERS: readonly unknown[] = [
  'in_game',
  'pending',
  'locked',
  'closed',
  'join',
  'request',
  'web',
] satisfies AppRoundInviteView['offer'][];

const route = (shortId: string) => `/api/pamelding/${encodeURIComponent(shortId)}`;

/** Runden bak lenka, og hva du kan gjøre med den. Antall påmeldte, aldri navn. */
export async function fetchRoundInvite(shortId: string): Promise<RoundInviteLoadResult> {
  const call = await callWebRoute(route(shortId), 'GET');
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, reason: 'not_found' };
  if (call.status !== 200) return { ok: false, reason: 'load_failed' };
  const view = call.body as Partial<AppRoundInviteView>;
  const complete =
    OFFERS.includes(view.offer) &&
    typeof view.round?.name === 'string' &&
    typeof view.playerCount === 'number' &&
    typeof view.signupPath === 'string' &&
    (view.offer !== 'in_game' || typeof view.gameId === 'string');
  if (!complete) return { ok: false, reason: 'load_failed' };
  return {
    ok: true,
    view: {
      ...(view as AppRoundInviteView),
      seats: view.seats ?? null,
      canCancelRequest: view.canCancelRequest === true,
      teamSignup: readTeamSignup(view.teamSignup),
      hasTeamPage: view.hasTeamPage === true,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

const MEMBER_STATUSES: readonly unknown[] = [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
] satisfies AppTeamSignupMember['status'][];

const JOIN_EFFECTS: readonly unknown[] = ['instant', 'approval'] satisfies AppTeamSignupInvited['joinEffect'][];

/** #2840: lagskjermen, eller `null` når den mangler eller har feil form. */
function readTeamSignup(value: unknown): AppTeamSignup | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'form') {
    const { teamSize, nameMin, nameMax, suggestedName, unavailableFriendIds } = value;
    if (
      typeof teamSize !== 'number' ||
      typeof nameMin !== 'number' ||
      typeof nameMax !== 'number' ||
      typeof suggestedName !== 'string' ||
      !Array.isArray(unavailableFriendIds)
    ) {
      return null;
    }
    return {
      kind: 'form',
      teamSize,
      nameMin,
      nameMax,
      suggestedName,
      unavailableFriendIds: unavailableFriendIds.filter((id): id is string => typeof id === 'string'),
    };
  }
  if (value.kind === 'invited') {
    const { requestId, captainName, teamName, joinEffect, members } = value;
    if (typeof requestId !== 'string' || !JOIN_EFFECTS.includes(joinEffect) || !Array.isArray(members)) {
      return null;
    }
    return {
      kind: 'invited',
      requestId,
      captainName: typeof captainName === 'string' ? captainName : null,
      teamName: typeof teamName === 'string' ? teamName : null,
      joinEffect: joinEffect as AppTeamSignupInvited['joinEffect'],
      members: members.flatMap((m): AppTeamSignupMember[] =>
        isRecord(m) && MEMBER_STATUSES.includes(m.status)
          ? [
              {
                name: typeof m.name === 'string' ? m.name : null,
                isCaptain: m.isCaptain === true,
                status: m.status as AppTeamSignupMember['status'],
              },
            ]
          : [],
      ),
    };
  }
  return null;
}

async function answer(
  shortId: string,
  body: Record<string, unknown>,
): Promise<RoundInviteAnswerResult> {
  const call = await callWebRoute(route(shortId), 'POST', body);
  if (!call.ok) return call;
  if (call.status === 200) {
    const { status, gameId } = call.body;
    if (status === 'joined' && typeof gameId === 'string' && gameId !== '') {
      return { ok: true, status, gameId };
    }
    return status === 'requested' || status === 'cancelled'
      ? { ok: true, status }
      : { ok: false, reason: 'db_error' };
  }
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, reason: 'not_found' };
  const { error } = call.body;
  return REFUSAL_CODES.has(error)
    ? { ok: false, reason: error as RoundInviteRefusal }
    : { ok: false, reason: 'db_error' };
}

/**
 * «Meld meg på». `src` er lenkas `?src=`, så plakaten telles også i appen. Et kall til
 * gir samme svar og ingen ny rad.
 */
export function joinRound(shortId: string, src: string | null): Promise<RoundInviteAnswerResult> {
  return answer(shortId, { intent: 'join', ...(src ? { src } : {}) });
}

/** «Be om å bli med». Et kall til gir samme svar og ingen ny rad. */
export function requestToJoin(
  shortId: string,
  message: string | null,
): Promise<RoundInviteAnswerResult> {
  return answer(shortId, { intent: 'request', ...(message ? { message } : {}) });
}

/**
 * «Trekk forespørselen» (#2837). Bare din egen forespørsel som venter, også etter at
 * påmeldingen er stengt. `not_pending`: arrangøren rakk å svare, og ingenting er skrevet.
 */
export function cancelRequest(shortId: string): Promise<RoundInviteAnswerResult> {
  return answer(shortId, { intent: 'cancel' });
}

/** #2840: svarene der ruta sier nei til et lag eller et svar på en laginvitasjon. */
export type TeamSignupRefusal =
  | 'team_name_invalid'
  | 'slots_count_wrong'
  | 'duplicate_members'
  | 'self_in_slots'
  | 'teammate_not_friend'
  | 'team_full'
  | 'game_locked'
  | 'signup_closed'
  | 'game_full'
  | 'already_registered'
  | 'wrong_type'
  | 'wrong_mode'
  | 'mode_does_not_support_teams'
  | 'profile_incomplete'
  | 'rate_limited';

export type TeamSignupFailure = TeamSignupRefusal | WebApiFailure | 'not_found' | 'db_error';

export type TeamSignupResult =
  | ({ ok: true } & AppTeamSignupAnswer)
  | { ok: false; reason: TeamSignupFailure };

const TEAM_REFUSALS: Record<TeamSignupRefusal, true> = {
  team_name_invalid: true,
  slots_count_wrong: true,
  duplicate_members: true,
  self_in_slots: true,
  teammate_not_friend: true,
  team_full: true,
  game_locked: true,
  signup_closed: true,
  game_full: true,
  already_registered: true,
  wrong_type: true,
  wrong_mode: true,
  mode_does_not_support_teams: true,
  profile_incomplete: true,
  rate_limited: true,
};

const TEAM_REFUSAL_CODES: ReadonlySet<unknown> = new Set(Object.keys(TEAM_REFUSALS));

const SLOT_REASONS: readonly unknown[] = [
  'alreadyRegistered',
  'dbError',
  'unexpected',
] satisfies Extract<AppTeamSlotResult, { ok: false }>['reason'][];

/** Én rad i svaret. En rad uten id kan ikke kobles til vennen og faller bort. */
function readSlotResult(value: unknown): AppTeamSlotResult[] {
  if (!isRecord(value) || typeof value.userId !== 'string') return [];
  const name = typeof value.name === 'string' ? value.name : null;
  if (value.ok === true) return [{ ok: true, userId: value.userId, name }];
  const reason = SLOT_REASONS.includes(value.reason)
    ? (value.reason as Extract<AppTeamSlotResult, { ok: false }>['reason'])
    : 'unexpected';
  return [{ ok: false, userId: value.userId, name, reason }];
}

async function teamAnswer(shortId: string, body: Record<string, unknown>): Promise<TeamSignupResult> {
  const call = await callWebRoute(route(shortId), 'POST', body);
  if (!call.ok) return call;
  if (call.status === 200) {
    const { status, captainRequestId, joinEffect, slotResults } = call.body;
    if (status === 'team_accepted' || status === 'team_declined') return { ok: true, status };
    if (
      status === 'team_registered' &&
      typeof captainRequestId === 'string' &&
      JOIN_EFFECTS.includes(joinEffect) &&
      Array.isArray(slotResults)
    ) {
      return {
        ok: true,
        status,
        captainRequestId,
        joinEffect: joinEffect as AppTeamSignupInvited['joinEffect'],
        slotResults: slotResults.flatMap(readSlotResult),
      };
    }
    return { ok: false, reason: 'db_error' };
  }
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, reason: 'not_found' };
  const { error } = call.body;
  return TEAM_REFUSAL_CODES.has(error)
    ? { ok: false, reason: error as TeamSignupRefusal }
    : { ok: false, reason: 'db_error' };
}

/**
 * #2840: «Meld på <lagnavn>». Du er kapteinen; `memberIds` er vennene du valgte. Ruta
 * sjekker at de er vennene dine og at runden har plass, så appen er ikke porten.
 */
export function registerTeam(
  shortId: string,
  teamName: string,
  memberIds: readonly string[],
): Promise<TeamSignupResult> {
  return teamAnswer(shortId, { intent: 'team', teamName, memberIds });
}

/** #2840: «Bli med på laget». `requestId` er din egen rad fra visningen. */
export function acceptTeamInvite(shortId: string, requestId: string): Promise<TeamSignupResult> {
  return teamAnswer(shortId, { intent: 'accept_team', requestId });
}

/** #2840: «Nei takk». */
export function declineTeamInvite(shortId: string, requestId: string): Promise<TeamSignupResult> {
  return teamAnswer(shortId, { intent: 'decline_team', requestId });
}
