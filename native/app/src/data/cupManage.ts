// native/app/src/data/cupManage.ts
// #2752: «Styr cupen», trekket og byttet, via rutene.
//
// Fila er med vilje tynn. Reglene bor i kjernene på serveren (`withdrawalCore.ts`,
// `swapCupMatchPlayerCore.ts`), de samme nettet bruker. Appen sender hvem og hva,
// og leser en kode. Alt her krever nett: uten nett kommer `offline` tilbake, og
// skjermene sier det.
//
// **Wire-kontrakten** (rutene og denne fila endres i samme PR) står i rutene under
// `app/api/cup/[id]/`, og typene i `lib/cup/appCupManageView.ts`.
import type {
  AppCupManageView,
  AppCupSwapCandidates,
  AppCupWithdrawalView,
} from '../../../../lib/cup/appCupManageView';
import { callWebRoute } from './webApi';

const base = (cupId: string) => `/api/cup/${encodeURIComponent(cupId)}`;
const match = (cupId: string, gameId: string) =>
  `${base(cupId)}/matches/${encodeURIComponent(gameId)}`;

/** En kode: appens egen tilstand, eller `error` fra ruta. */
export type CupManageFailure = string;

export type CupActionResult = { ok: true; partial?: boolean } | { ok: false; reason: CupManageFailure };

function loadFailure(status: number, body: unknown): CupManageFailure {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 403) return 'not_manager';
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' ? error : 'load_failed';
}

async function read<T>(path: string, isValid: (view: Partial<T>) => boolean) {
  const call = await callWebRoute(path, 'GET');
  if (!call.ok) return { ok: false as const, reason: call.reason as CupManageFailure };
  if (call.status !== 200) {
    return { ok: false as const, reason: loadFailure(call.status, call.body) };
  }
  const view = call.body as Partial<T>;
  // En 200 uten det skjermen skal tegne, er ikke noe å tegne.
  return isValid(view)
    ? { ok: true as const, view: view as T }
    : { ok: false as const, reason: 'load_failed' };
}

async function post(path: string, body: Record<string, unknown>): Promise<CupActionResult> {
  const call = await callWebRoute(path, 'POST', body);
  if (!call.ok) return { ok: false, reason: call.reason };
  if (call.status !== 200) return { ok: false, reason: loadFailure(call.status, call.body) };
  return { ok: true, partial: (call.body as { partial?: unknown } | null)?.partial === true };
}

export function fetchCupManage(cupId: string) {
  return read<AppCupManageView>(`${base(cupId)}/manage`, (view) =>
    Boolean(view.id && Array.isArray(view.players) && Array.isArray(view.matches)),
  );
}

/** Uten `userId`: spillerens eget trekk. */
export function fetchCupWithdrawal(cupId: string, userId?: string) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return read<AppCupWithdrawalView>(`${base(cupId)}/withdrawal${query}`, (view) =>
    Boolean(view.cup && view.player && Array.isArray(view.matches)),
  );
}

export function withdrawCupPlayer(
  cupId: string,
  userId: string,
  choices: { playOnGameIds: string[]; offeredGameIds: string[] },
) {
  return post(`${base(cupId)}/withdraw`, { userId, ...choices });
}

export function withdrawSelfFromCup(cupId: string) {
  return post(`${base(cupId)}/withdraw-self`, {});
}

export function undoCupWithdrawal(cupId: string, userId: string) {
  return post(`${base(cupId)}/withdraw/undo`, { userId });
}

export function setCupPlayOn(cupId: string, gameId: string, playOn: boolean) {
  return post(`${match(cupId, gameId)}/play-on`, { playOn });
}

export function fetchCupSwapCandidates(cupId: string, gameId: string) {
  return read<AppCupSwapCandidates>(`${match(cupId, gameId)}/swap-candidates`, (view) =>
    Boolean(view.gameId && Array.isArray(view.out) && Array.isArray(view.in)),
  );
}

export function swapCupPlayer(cupId: string, gameId: string, outUserId: string, inUserId: string) {
  return post(`${match(cupId, gameId)}/swap`, { outUserId, inUserId });
}
