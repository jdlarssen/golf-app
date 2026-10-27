// native/app/src/data/marker.ts
// #2661: markøren i en simulatorliga, via de to leserutene på serveren.
//
// Hvem som kan velges som markør, og hvem som får se og svare på et kort,
// avgjøres på serveren (`lib/league/leagueMarker.ts` bak `loadMarkerChoice` og
// `markerReviewAccess`). Appen viser det rutene sender og regner ingen av
// delene selv. Selve svaret (godkjenn, send tilbake) går gjennom den vanlige
// scorekort-ruta (`data/playerActions.ts`), der den samme porten sitter.
//
// **Wire-kontrakten** (rutene og denne fila endres i samme PR):
//   GET /api/games/{id}/marker-options?alsoFor=a,b
//       200 MarkerOptionsResponse · 400 · 401 · 404 · 500
//   GET /api/liga/{id}/godkjenn/{gameId}/{userId}
//       200 MarkerCardResponse · 401 · 404 · 500
//
// Utfallene er typede koder, aldri bruker-tekst.
import type {
  MarkerCardResponse,
  MarkerOptionsResponse,
} from '../../../../lib/league/appLeagueView';
import { callWebRoute, type WebApiFailure } from './webApi';

export type MarkerLoadFailure = WebApiFailure | 'not_found' | 'load_failed';

export type MarkerOptionsResult =
  | { ok: true; options: MarkerOptionsResponse }
  | { ok: false; reason: MarkerLoadFailure };

export type MarkerCardResult =
  | { ok: true; card: MarkerCardResponse }
  | { ok: false; reason: MarkerLoadFailure };

function loadFailureFor(status: number): MarkerLoadFailure {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  return 'load_failed';
}

/**
 * Hvem i ligaen som kan godkjenne kortene i denne leveringen, eller
 * `required: false` utenfor en simulatorliga. `alsoFor` er makkerkortene som
 * leveres med mitt eget; de er ikke valgbare.
 */
export async function fetchMarkerOptions(
  gameId: string,
  alsoFor: readonly string[] = [],
): Promise<MarkerOptionsResult> {
  const query = alsoFor.length > 0 ? `?alsoFor=${alsoFor.map(encodeURIComponent).join(',')}` : '';
  const call = await callWebRoute(
    `/api/games/${encodeURIComponent(gameId)}/marker-options${query}`,
    'GET',
  );
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: loadFailureFor(call.status) };
  const body = call.body as Partial<{ required: boolean; options: unknown }>;
  if (body.required === false) return { ok: true, options: { required: false } };
  return body.required === true && Array.isArray(body.options)
    ? { ok: true, options: body as MarkerOptionsResponse }
    : { ok: false, reason: 'load_failed' };
}

/** Markørens kort: hullene, slagene og hvor kortet står. */
export async function fetchMarkerCard(
  leagueId: string,
  gameId: string,
  playerUserId: string,
): Promise<MarkerCardResult> {
  const call = await callWebRoute(
    `/api/liga/${encodeURIComponent(leagueId)}/godkjenn/${encodeURIComponent(gameId)}/${encodeURIComponent(playerUserId)}`,
    'GET',
  );
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: loadFailureFor(call.status) };
  const card = call.body as Partial<MarkerCardResponse>;
  return card.player && Array.isArray(card.holes) && typeof card.state === 'string'
    ? { ok: true, card: card as MarkerCardResponse }
    : { ok: false, reason: 'load_failed' };
}
