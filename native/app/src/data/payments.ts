// native/app/src/data/payments.ts
// #2749 PR C: «Hvem har betalt?» fra appen: lista, avhukingen og purringen.
//
// **Hvorfor ruter og ikke en skriving.** Skrivevakta (0191 (e)) nekter
// arrangøren å sette `paid_at` på sin egen rad, og purringen er `server-only`
// med service-role. Reglene om hvem som teller og hvem som purres bor i
// `lib/games/payments.ts`, som nettets side også kaller. Appen speiler ingen av
// dem (AGENTS trap 4); den spør rutene og viser svaret.
//
// **Wire-kontrakten er frosset** og står i rutene
// (`app/api/games/[id]/payments/route.ts`, `[userId]/route.ts`, `remind/route.ts`).
// Denne fila er den andre halvdelen; endres den ene, endres den andre i samme PR:
//   GET    200 { entryFeeKr, gameName, paidCount, totalCount, remindable,
//                players: [{ userId, name, isGuest, withdrawn, paid }] }
//   PUT    { paid } → 200 { paid }
//   POST   remind → 200 { reminded }
//   400 bad_request · 401 unauthorized · 403 forbidden · 404 not_found
//   409 no_fee · 500 payments_failed
import { callWebRoute, type WebApiFailure } from './webApi';

/** Hvorfor kallet ikke gikk. Appens egne fire, så rutas koder med wire-stavemåten. */
export type PaymentsFailure = WebApiFailure | 'forbidden' | 'not_found' | 'no_fee' | 'payments_failed';

export type PaymentsPlayer = {
  userId: string;
  name: string | null;
  isGuest: boolean;
  withdrawn: boolean;
  paid: boolean;
};

export type PaymentsOverview = {
  entryFeeKr: number;
  gameName: string;
  paidCount: number;
  totalCount: number;
  remindable: number;
  players: PaymentsPlayer[];
};

function paymentsPath(gameId: string, rest = ''): string {
  return `/api/games/${encodeURIComponent(gameId)}/payments${rest}`;
}

/** Status → kode, én gang, så skjermen aldri leser et statusnummer. */
function failureForStatus(status: number): PaymentsFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'no_fee';
  return 'payments_failed';
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function readPlayer(value: unknown): PaymentsPlayer | null {
  if (value === null || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (typeof p.userId !== 'string' || typeof p.paid !== 'boolean') return null;
  return {
    userId: p.userId,
    name: typeof p.name === 'string' ? p.name : null,
    isGuest: p.isGuest === true,
    withdrawn: p.withdrawn === true,
    paid: p.paid,
  };
}

/**
 * Lista og tallene. **Fail-closed** på et svar som ikke kan leses: et kort med
 * «NaN / 4» eller en liste uten haker er verre enn en ærlig feil.
 */
export async function fetchPayments(
  gameId: string,
): Promise<{ ok: true; overview: PaymentsOverview } | { ok: false; reason: PaymentsFailure }> {
  const call = await callWebRoute(paymentsPath(gameId), 'GET');
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: failureForStatus(call.status) };

  const body = call.body;
  const counts = [body.entryFeeKr, body.paidCount, body.totalCount, body.remindable].map(readCount);
  const players = Array.isArray(body.players) ? body.players.map(readPlayer) : null;
  if (counts.some((n) => n === undefined) || !players || players.some((p) => p === null)) {
    return { ok: false, reason: 'payments_failed' };
  }
  const [entryFeeKr, paidCount, totalCount, remindable] = counts as number[];
  return {
    ok: true,
    overview: {
      entryFeeKr,
      gameName: typeof body.gameName === 'string' ? body.gameName : '',
      paidCount,
      totalCount,
      remindable,
      players: players as PaymentsPlayer[],
    },
  };
}

/** Huk av eller fjern haken. 200 er kvitteringen. */
export async function setPaid(
  gameId: string,
  userId: string,
  paid: boolean,
): Promise<{ ok: true } | { ok: false; reason: PaymentsFailure }> {
  const call = await callWebRoute(paymentsPath(gameId, `/${encodeURIComponent(userId)}`), 'PUT', { paid });
  if (!call.ok) return call;
  return call.status === 200 ? { ok: true } : { ok: false, reason: failureForStatus(call.status) };
}

/**
 * Purr de som mangler. Mail og push er best-effort på serveren, så 200 er
 * suksess også når `reminded` mangler; da er tallet 0.
 */
export async function remindUnpaid(
  gameId: string,
): Promise<{ ok: true; reminded: number } | { ok: false; reason: PaymentsFailure }> {
  const call = await callWebRoute(paymentsPath(gameId, '/remind'), 'POST');
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: failureForStatus(call.status) };
  return { ok: true, reminded: readCount(call.body.reminded) ?? 0 };
}
