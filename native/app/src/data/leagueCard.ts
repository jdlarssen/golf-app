// native/app/src/data/leagueCard.ts
// #2815: kortet bak et resultat i sesongtabellen, via leseruta på serveren.
//
// Hvem som får se kortet, og hva som står på det, avgjøres på serveren
// (`lib/league/leagueCardAccess.ts`): kalleren må få se ligaen, og kortet må
// telle i tabellen. Serveren regner også kortet (netto eller poeng per hull og
// summene); appen viser det ruta sender og regner ingenting selv.
//
// **Wire-kontrakten** (ruta og denne fila endres i samme PR):
//   GET /api/liga/{id}/kort/{gameId}/{userId}
//       200 LeagueCardResponse · 401 · 404 · 500
//
// Utfallene er typede koder, aldri bruker-tekst.
import type { LeagueCardResponse } from '../../../../lib/league/appLeagueView';
import { callWebRoute, type WebApiFailure } from './webApi';

export type LeagueCardFailure = WebApiFailure | 'not_found' | 'load_failed';

export type LeagueCardResult =
  | { ok: true; card: LeagueCardResponse }
  | { ok: false; reason: LeagueCardFailure };

function failureFor(status: number): LeagueCardFailure {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  return 'load_failed';
}

/** Kortet til `userId` i flighten `gameId`, slik tabellen i ligaen teller det. */
export async function fetchLeagueCard(
  leagueId: string,
  gameId: string,
  userId: string,
): Promise<LeagueCardResult> {
  const call = await callWebRoute(
    `/api/liga/${encodeURIComponent(leagueId)}/kort/${encodeURIComponent(gameId)}/${encodeURIComponent(userId)}`,
    'GET',
  );
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: failureFor(call.status) };
  const card = call.body as Partial<LeagueCardResponse>;
  return card.player && card.grid && Array.isArray(card.grid.halves) && typeof card.value === 'number'
    ? { ok: true, card: card as LeagueCardResponse }
    : { ok: false, reason: 'load_failed' };
}
