// #2894 PR 2: Æreslista hentet fra webben, og banneret på Hjem som leser den samme lista.
//
// Som Topplista (`aeresbrett.ts`): klienten ser bare spillene brukeren selv var med i
// (RLS, #1542), og lista teller hele Tørny. `GET /api/aeresliste`
// (`app/api/aeresliste/route.ts`) leser med service-rollen bak innloggingen og sender
// bare kortnavn, hull, bane, dag og en ugjennomsiktig `key` per slag. De nyeste står først.
//
// Utfallet er en typet kode (`webApi.ts`); skjermen leser aldri et statusnummer.
//
// **Lukket banner hører til telefonen** (AsyncStorage, som spørsmålet om varsler):
// nøkkelen er `key` til slaget som ble lukket. Et nytt nyeste slag har en annen `key`,
// og da står banneret igjen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AereslisteView } from '../../../../lib/stats/aeresliste';
import { callWebRoute } from './webApi';

export type AereslisteLoad =
  | { ok: true; view: AereslisteView }
  | { ok: false; reason: 'offline' | 'failed' };

export const RARE_SHOT_CLOSED_KEY = 'torny-rare-shot-banner-closed';

function isRow(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    (r.kind === 'hole_in_one' || r.kind === 'albatross') &&
    typeof r.name === 'string' &&
    typeof r.initials === 'string' &&
    typeof r.isViewer === 'boolean' &&
    typeof r.hole === 'number' &&
    (r.courseName === null || typeof r.courseName === 'string') &&
    typeof r.playedOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.playedOn) &&
    typeof r.key === 'string' &&
    r.key.length > 0
  );
}

/** Svaret har formen skjermen leser: ellers er det en feil, aldri en halv liste. */
function isView(body: Record<string, unknown>): boolean {
  return Array.isArray(body.rows) && body.rows.every(isRow);
}

export async function fetchAeresliste(): Promise<AereslisteLoad> {
  const call = await callWebRoute('/api/aeresliste', 'GET');
  if (!call.ok) return { ok: false, reason: call.reason === 'offline' ? 'offline' : 'failed' };
  if (call.status === 200 && isView(call.body)) {
    return { ok: true, view: call.body as unknown as AereslisteView };
  }
  console.error('[aeresliste] henting feilet', call.status, call.body.error);
  return { ok: false, reason: 'failed' };
}

/** `key` til slaget banneret sist ble lukket for, eller `null`. Kaster aldri. */
export async function readClosedRareShot(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(RARE_SHOT_CLOSED_KEY);
  } catch (err) {
    console.error('[aeresliste] fikk ikke lest det lukkede banneret', err);
    return null;
  }
}

/** Husker at banneret for slaget er lukket. Kaster aldri. */
export async function closeRareShot(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(RARE_SHOT_CLOSED_KEY, key);
  } catch (err) {
    console.error('[aeresliste] fikk ikke lagret det lukkede banneret', err);
  }
}
