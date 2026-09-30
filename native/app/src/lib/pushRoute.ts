// #2256 PR 4: hvor et trykk på et varsel tar deg.
//
// Serveren legger stien i APNs-payloaden (`url`, fra
// `notificationDestination` i lib/notifications/deeplink.ts): `/games/{id}`,
// `/games/{id}/approve`, `/games/{id}/leaderboard` og andre. Alt som gjelder et
// spill åpner spillets side (`GameHome`). Resten åpner Hjem, også
// arrangørsidene under `/admin/…`, som appen ikke har.
//
// **Hvor `url` ligger.** For et fjernvarsel på iOS legger expo-notifications
// bare `userInfo["body"]` i `content.data` (Expos egen push-konvensjon).
// Vår payload er `{ aps, url, kind }`, så `url` står i
// `request.trigger.payload`, som er hele `userInfo`. `content.data` leses som
// reserve.
//
// Ren og I/O-fri (Type A).

export type PushTarget = { name: 'GameHome'; params: { gameId: string } } | { name: 'Home' };

/** Den delen av et varsel funksjonen leser, løst typet: payloaden kan være hva som helst. */
export type PushRequestLike = {
  content?: { data?: Record<string, unknown> | null } | null;
  trigger?: { type?: string; payload?: Record<string, unknown> | null } | null;
};

const GAME_PATH = /^\/(?:[a-z]{2}\/)?games\/([^/?#]+)/;

/** Stien et varsel peker på, eller `null` når det ikke har noen. */
export function pushUrl(request: PushRequestLike | null | undefined): string | null {
  const fromPayload = request?.trigger?.payload?.url;
  if (typeof fromPayload === 'string') return fromPayload;
  const fromData = request?.content?.data?.url;
  return typeof fromData === 'string' ? fromData : null;
}

/** Skjermen et trykk på varselet skal åpne. */
export function pushTarget(url: string | null): PushTarget {
  const match = url ? GAME_PATH.exec(url) : null;
  if (match) {
    const gameId = decodeURIComponent(match[1]);
    if (gameId) return { name: 'GameHome', params: { gameId } };
  }
  return { name: 'Home' };
}
