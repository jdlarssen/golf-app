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
//        200 { status: 'joined', gameId } | { status: 'requested' }
//        400 { error: 'bad_request' | 'message_too_long' } · 401 · 404
//        409 { error: 'game_locked' | 'signup_closed' | 'game_full' | 'wrong_mode'
//                  | 'use_web' | 'profile_incomplete' }
//        429 { error: 'rate_limited' } · 500 { error: 'db_error' }
//
// Utfallene er TYPEDE koder, aldri bruker-tekst. HTTP-status oversettes én gang, her.
// Teksten bor i `lib/roundInviteCopy.ts`.
import type {
  AppRoundInviteAnswer,
  AppRoundInviteView,
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
  | 'message_too_long';

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
    view.round !== undefined &&
    typeof view.playerCount === 'number' &&
    typeof view.signupPath === 'string' &&
    (view.offer !== 'in_game' || typeof view.gameId === 'string');
  return complete ? { ok: true, view: view as AppRoundInviteView } : { ok: false, reason: 'load_failed' };
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
    return status === 'requested' ? { ok: true, status } : { ok: false, reason: 'db_error' };
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
