// #2256 PR 4: hvor et trykk på et varsel tar deg.
//
// Serveren legger stien i APNs-payloaden (`url`, fra
// `notificationDestination` i lib/notifications/deeplink.ts): `/games/{id}`,
// `/games/{id}/approve`, `/games/{id}/leaderboard` og andre. Alt som gjelder et
// spill åpner spillets side (`GameHome`). Resten åpner Hjem, også
// arrangørsidene under `/admin/…`, som appen ikke har. Unntaket er
// `/games/{id}/holes/{n}` (#2268, påminnelsen om et hull uten slag): den åpner
// hullet (`Hole`).
//
// **Hvor `url` ligger.** For et fjernvarsel på iOS legger expo-notifications
// bare `userInfo["body"]` i `content.data` (Expos egen push-konvensjon).
// Vår payload er `{ aps, url, kind }`, så `url` står i
// `request.trigger.payload`, som er hele `userInfo`. `content.data` leses som
// reserve.
//
// **Hvilket varsel** (#2201): serveren legger `?varsel=<id>` på lenka, så et
// trykk kan merke akkurat det varselet som lest. Markøren endrer ikke hvor
// trykket går; `pushNotificationId` leser den med webbens egen
// `readMarkerFrom`, så regelen for hva som er en gyldig id har ett hjem.
//
// Ren og I/O-fri (Type A).
import { readMarkerFrom } from '../../../../lib/notifications/readMarker';

export type PushTarget =
  | { name: 'GameHome'; params: { gameId: string } }
  | { name: 'Hole'; params: { gameId: string; holeNumber: number } }
  | { name: 'Home' };

/** Den delen av et varsel funksjonen leser, løst typet: payloaden kan være hva som helst. */
export type PushRequestLike = {
  content?: { data?: Record<string, unknown> | null } | null;
  trigger?: { type?: string; payload?: Record<string, unknown> | null } | null;
};

const GAME_PATH = /^\/(?:[a-z]{2}\/)?games\/([^/?#]+)/;
const HOLE_SUFFIX = /^\/holes\/(\d{1,2})(?:[/?#]|$)/;

/** Stien et varsel peker på, eller `null` når det ikke har noen. */
export function pushUrl(request: PushRequestLike | null | undefined): string | null {
  const fromPayload = request?.trigger?.payload?.url;
  if (typeof fromPayload === 'string') return fromPayload;
  const fromData = request?.content?.data?.url;
  return typeof fromData === 'string' ? fromData : null;
}

/** `decodeURIComponent` kaster på en ødelagt `%`-sekvens; da går trykket til Hjem. */
function decodedOrNull(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Skjermen et trykk på varselet skal åpne. */
export function pushTarget(url: string | null): PushTarget {
  const match = url ? GAME_PATH.exec(url) : null;
  if (match) {
    const gameId = decodedOrNull(match[1]);
    if (gameId) {
      const hole = HOLE_SUFFIX.exec(url!.slice(match[0].length));
      const holeNumber = hole ? Number(hole[1]) : NaN;
      if (holeNumber >= 1 && holeNumber <= 18) {
        return { name: 'Hole', params: { gameId, holeNumber } };
      }
      return { name: 'GameHome', params: { gameId } };
    }
  }
  return { name: 'Home' };
}

/** Id-en til varselet lenka gjelder (`?varsel=<id>`), eller `null`. */
export function pushNotificationId(url: string | null): string | null {
  if (!url) return null;
  const query = url.indexOf('?');
  if (query === -1) return null;
  const hash = url.indexOf('#', query);
  return readMarkerFrom(url.slice(query, hash === -1 ? undefined : hash));
}
