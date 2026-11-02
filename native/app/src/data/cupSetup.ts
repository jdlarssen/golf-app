// native/app/src/data/cupSetup.ts
// #2752: oppsettet av en cup og spillerlista, via rutene.
//
// Fila er med vilje tynn. Reglene bor i kjernene på serveren (`lib/cup/setupCore.ts`,
// `sideAwardCore.ts`, `cupJoinCore.ts`), de samme nettet bruker. Appen sender hva
// arrangøren valgte, og leser en kode. Alt her krever nett: uten nett kommer `offline`
// tilbake, og skjermene sier det.
//
// **Wire-kontrakten** (rutene og denne fila endres i samme PR) står i rutene under
// `app/api/cup/`, og typene i `lib/cup/appCupSetupView.ts`.
import type { AppCupDeletePreview } from '../../../../lib/cup/appCupDeleteView';
import type { AppCupGenerateView, CupMatchesBody } from '../../../../lib/cup/appCupGenerateView';
import type { AppCupLineupView } from '../../../../lib/cup/appCupLineupView';
import type {
  AppCupJoinView,
  AppCupParticipantsView,
  AppCupSetupView,
  CupSetupCreateBody,
  CupSetupPlanBody,
} from '../../../../lib/cup/appCupSetupView';
import type { SideAwardConfigInput } from '../../../../lib/cup/sideAwardRows';
import { callWebRoute } from './webApi';

const base = (cupId: string) => `/api/cup/${encodeURIComponent(cupId)}`;
const join = (shortId: string) => `/api/cup/join/${encodeURIComponent(shortId)}`;

/** En kode: appens egen tilstand, eller `error` fra ruta. */
export type CupSetupFailure = string;
export type CupSetupResult = { ok: true } | { ok: false; reason: CupSetupFailure };

function failureOf(status: number, body: unknown): CupSetupFailure {
  if (status === 401) return 'unauthorized';
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === 'string') return error;
  if (status === 404) return 'not_found';
  return status === 403 ? 'not_manager' : 'load_failed';
}

async function read<T>(path: string, isValid: (view: Partial<T>) => boolean) {
  const call = await callWebRoute(path, 'GET');
  if (!call.ok) return { ok: false as const, reason: call.reason as CupSetupFailure };
  if (call.status !== 200) return { ok: false as const, reason: failureOf(call.status, call.body) };
  const view = call.body as Partial<T>;
  // En 200 uten det skjermen skal tegne, er ikke noe å tegne.
  return isValid(view) ? { ok: true as const, view: view as T } : { ok: false as const, reason: 'load_failed' };
}

async function send(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: Record<string, unknown>,
): Promise<CupSetupResult> {
  const call = await callWebRoute(path, method, body);
  if (!call.ok) return { ok: false, reason: call.reason };
  return call.status === 200 ? { ok: true } : { ok: false, reason: failureOf(call.status, call.body) };
}

export async function createCup(body: CupSetupCreateBody) {
  const call = await callWebRoute('/api/cup', 'POST', body);
  if (!call.ok) return { ok: false as const, reason: call.reason as CupSetupFailure };
  const id = (call.body as { id?: unknown } | null)?.id;
  if (call.status !== 200 || typeof id !== 'string') {
    return { ok: false as const, reason: call.status === 200 ? 'cup_insert_failed' : failureOf(call.status, call.body) };
  }
  return { ok: true as const, id };
}

export function fetchCupSetup(cupId: string) {
  return read<AppCupSetupView>(`${base(cupId)}/setup`, (view) =>
    Boolean(view.id && view.status && Array.isArray(view.sideAwards)),
  );
}

export function saveCupPlan(cupId: string, body: CupSetupPlanBody) {
  return send(`${base(cupId)}/plan`, 'PUT', body);
}

export function saveCupSideAwards(cupId: string, awards: SideAwardConfigInput[]) {
  return send(`${base(cupId)}/side-awards`, 'PUT', { awards });
}

export function fetchCupParticipants(cupId: string) {
  return read<AppCupParticipantsView>(`${base(cupId)}/participants`, (view) =>
    Boolean(view.id && Array.isArray(view.participants) && Array.isArray(view.candidates)),
  );
}

export function addCupParticipant(cupId: string, userId: string) {
  return send(`${base(cupId)}/participants`, 'POST', { userId });
}

export function removeCupParticipant(cupId: string, userId: string) {
  return send(`${base(cupId)}/participants/${encodeURIComponent(userId)}`, 'DELETE');
}

export function fetchCupJoin(shortId: string) {
  return read<AppCupJoinView>(join(shortId), (view) => Boolean(view.decision && view.cup));
}

export type CupJoinAnswer =
  | { ok: true; status: 'joined' | 'joined_self' | 'already_joined' | 'left' | 'left_self' | 'not_joined' }
  | { ok: false; reason: CupSetupFailure };

async function answer(shortId: string, method: 'POST' | 'DELETE'): Promise<CupJoinAnswer> {
  const call = await callWebRoute(join(shortId), method);
  if (!call.ok) return { ok: false, reason: call.reason };
  if (call.status !== 200) return { ok: false, reason: failureOf(call.status, call.body) };
  const status = (call.body as { status?: unknown } | null)?.status;
  return typeof status === 'string'
    ? { ok: true, status: status as Extract<CupJoinAnswer, { ok: true }>['status'] }
    : { ok: false, reason: 'load_failed' };
}

export function joinCup(shortId: string) {
  return answer(shortId, 'POST');
}

export function leaveCup(shortId: string) {
  return answer(shortId, 'DELETE');
}

// «Fordel & generer» og start (rutene `generate`, `matches` og `start`).

export function fetchCupGenerate(cupId: string) {
  return read<AppCupGenerateView>(
    `${base(cupId)}/generate`,
    (view) => typeof view.status === 'string' && Array.isArray(view.players),
  );
}

export function createCupMatches(cupId: string, body: CupMatchesBody): Promise<CupSetupResult> {
  return send(`${base(cupId)}/matches`, 'POST', body);
}

export function startCup(cupId: string): Promise<CupSetupResult> {
  return send(`${base(cupId)}/start`, 'POST');
}

// Lag og kaptein, og kapteinuttaket. Hemmeligheten står på serveren: `slots: null` i svaret
// er alt appen får se av motstanderens uttak.

export function setCupParticipantRole(
  cupId: string,
  userId: string,
  body: { teamNumber: 1 | 2 | null; isCaptain: boolean },
): Promise<CupSetupResult> {
  return send(`${base(cupId)}/participants/${encodeURIComponent(userId)}/role`, 'POST', body);
}

export function fetchCupDeletePreview(cupId: string) {
  return read<AppCupDeletePreview>(
    `${base(cupId)}/delete`,
    (view) => typeof view.name === 'string' && typeof view.draft === 'boolean',
  );
}

export async function deleteCup(cupId: string): Promise<CupSetupResult> {
  const call = await callWebRoute(`${base(cupId)}/delete`, 'DELETE');
  if (!call.ok) return { ok: false, reason: call.reason };
  if (call.status === 200) return { ok: true };
  // Skjermen regner `not_found` som slettet, så det må komme fra ruta selv. En 404 uten kropp
  // kan komme fra hva som helst foran den.
  const error = (call.body as { error?: unknown } | null)?.error;
  return { ok: false, reason: typeof error === 'string' ? error : 'delete_failed' };
}

export function fetchCupLineup(cupId: string) {
  return read<AppCupLineupView>(
    `${base(cupId)}/lineup`,
    (view) => typeof view.role === 'string' && Array.isArray(view.sessions),
  );
}

export function setCupPlannedMatchCount(cupId: string, plannedMatchCount: string): Promise<CupSetupResult> {
  return send(`${base(cupId)}/planned-match-count`, 'PUT', { plannedMatchCount });
}

const session = (cupId: string, sessionId: string) => `${base(cupId)}/lineup/sessions/${encodeURIComponent(sessionId)}`;

export function openCupLineupSession(cupId: string, format: string, slotCount: number): Promise<CupSetupResult> {
  return send(`${base(cupId)}/lineup/sessions`, 'POST', { format, slotCount });
}

export function deleteCupLineupSession(cupId: string, sessionId: string): Promise<CupSetupResult> {
  return send(session(cupId, sessionId), 'DELETE');
}

export function submitCupLineup(
  cupId: string,
  sessionId: string,
  team: 1 | 2,
  slots: { slotIndex: number; userIds: string[] }[],
): Promise<CupSetupResult> {
  return send(`${session(cupId, sessionId)}/submit`, 'POST', { team, slots });
}

export function unlockCupLineup(cupId: string, sessionId: string, team: 1 | 2): Promise<CupSetupResult> {
  return send(`${session(cupId, sessionId)}/unlock`, 'POST', { team });
}

export function retryCupLineupReveal(cupId: string, sessionId: string): Promise<CupSetupResult> {
  return send(`${session(cupId, sessionId)}/reveal`, 'POST');
}
