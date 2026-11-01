// #2752: den andre halvdelen av en delt cup-dag, fra serveren.
//
// Bare serveren kan svare: `findSegmentSibling` leser med admin-klienten, fordi
// spilleren ikke kan lese alle halvdelene i cupen. Svaret legges i spill-bundelen
// (`gameBundle.ts`), så broen virker uten nett.
//
// **Wire-kontrakten** (ruta og denne fila endres i samme PR):
//   GET /api/games/{id}/segment-sibling
//       200 SegmentSiblingResponse · 401 · 404 · 500
import type {
  SegmentSibling,
  SegmentSiblingResponse,
} from '../../../../lib/games/segmentSiblingRules';
import { callWebRoute } from './webApi';

/**
 * Søskenet, eller `null` når det ikke finnes noe. 404 er et svar, ikke en feil:
 * en arrangør som ikke spiller selv, har ingen halvdeler å bla mellom.
 *
 * Alt annet kaster, så kalleren kan beholde det den har. Et `null` her ville
 * gjort «Lever» synlig på første halvdel bare fordi nettet svarte dårlig.
 */
export async function fetchSegmentSibling(gameId: string): Promise<SegmentSibling | null> {
  const call = await callWebRoute(`/api/games/${encodeURIComponent(gameId)}/segment-sibling`, 'GET');
  if (!call.ok) throw new Error(`Fant ikke den andre halvdelen: ${call.reason}`);
  if (call.status === 404) return null;
  if (call.status !== 200) throw new Error(`Fant ikke den andre halvdelen: ${call.status}`);
  return (call.body as Partial<SegmentSiblingResponse>).sibling ?? null;
}
