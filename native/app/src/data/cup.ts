// native/app/src/data/cup.ts
// #2752: cup-rommet i appen, via de to rutene.
//
// Fila er med vilje tynn, som ligaen. Poengene, vinneren og hvem som står hvor
// regnes på serveren (`getCupSnapshot` → `buildAppCupView`), og appen regner dem
// aldri selv. Mens cupen pågår, sender ruta ingen poeng (#1468).
//
// **Ingen lokal lagring i v1**, som ligaen. Skjermen holder det den sist fikk i
// minnet, og uten nett viser den det med en merknad. Selve kampene er
// offline-først som alle spill.
//
// **Wire-kontrakten** (rutene og denne fila endres i samme PR):
//   GET /api/cup        200 { cups: AppCupSummary[] } · 401 · 500
//   GET /api/cup/{id}   200 AppCupView · 401 · 404 · 500
import type {
  AppCupListResponse,
  AppCupSummary,
  AppCupView,
} from '../../../../lib/cup/appCupView';
import { callWebRoute, type WebApiFailure } from './webApi';

/** Hvorfor cupen ikke kunne hentes. `not_found` = finnes ikke, eller ikke for deg. */
export type CupLoadFailure = WebApiFailure | 'not_found' | 'load_failed';

export type MyCupsResult =
  | { ok: true; cups: AppCupSummary[] }
  | { ok: false; reason: CupLoadFailure };

export type CupResult =
  | { ok: true; view: AppCupView }
  | { ok: false; reason: CupLoadFailure };

/** Status → kode, oversatt ÉN gang. */
function loadFailureFor(status: number): CupLoadFailure {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  return 'load_failed';
}

/** «Cupene dine» på Hjem. Hjem skjuler seksjonen ved enhver feil. */
export async function fetchMyCups(): Promise<MyCupsResult> {
  const call = await callWebRoute('/api/cup', 'GET');
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: loadFailureFor(call.status) };
  const cups = (call.body as Partial<AppCupListResponse>).cups;
  return Array.isArray(cups) ? { ok: true, cups } : { ok: false, reason: 'load_failed' };
}

/** Cup-rommet. */
export async function fetchCup(cupId: string): Promise<CupResult> {
  const call = await callWebRoute(`/api/cup/${encodeURIComponent(cupId)}`, 'GET');
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: loadFailureFor(call.status) };
  const view = call.body as Partial<AppCupView>;
  // En 200 uten cup eller kamper er ikke en cup å tegne.
  return view.id && Array.isArray(view.matches)
    ? { ok: true, view: view as AppCupView }
    : { ok: false, reason: 'load_failed' };
}
