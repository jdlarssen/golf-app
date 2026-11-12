// native/app/src/data/terminliste.ts
// #2838: «Finn turneringer» i appen, via `GET /api/terminliste`.
//
// Fila er med vilje tynn. Hvilke runder som står der, knappen på hver og
// setene regnes på serveren, med nettsidens regler (`buildTerminEntries`).
// Dagene og filtrene regner appen selv på telefonens klokke
// (`groupTerminByDate`, `filterTermin`), så et bytte av brikke henter ikke på
// nytt. Lista er ingen offline-flate: uten nett står feilen, og ingenting
// legges i sync-køen.
//
// **Wire-kontrakten** (ruta og denne fila endres i samme PR, typene står i
// `lib/games/appTerminView.ts`):
//   GET /api/terminliste   200 AppTerminView { entries, pendingRequests } · 401 · 500
//
// Utfallene er TYPEDE koder, aldri bruker-tekst. HTTP-status oversettes én gang,
// her. Teksten bor i `lib/terminlisteCopy.ts`.
import type { AppTerminView } from '../../../../lib/games/appTerminView';
import { callWebRoute, type WebApiFailure } from './webApi';

/** Hvorfor lista ikke kunne hentes. */
export type TerminlisteLoadFailure = WebApiFailure | 'load_failed';

export type TerminlisteResult =
  | { ok: true; view: AppTerminView }
  | { ok: false; reason: TerminlisteLoadFailure };

export async function fetchTerminliste(): Promise<TerminlisteResult> {
  const call = await callWebRoute('/api/terminliste', 'GET');
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status !== 200) return { ok: false, reason: 'load_failed' };
  const view = call.body as Partial<AppTerminView>;
  // En 200 uten rader er ikke en liste å tegne.
  return Array.isArray(view.entries) && Array.isArray(view.pendingRequests)
    ? { ok: true, view: view as AppTerminView }
    : { ok: false, reason: 'load_failed' };
}
