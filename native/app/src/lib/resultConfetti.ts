// #2756: når konfettien skal fyre. Første gang spilleren åpner resultatet, og
// bare mens runden er ny: den skal ikke komme når du blar i gamle runder. Husket
// i telefonens lokale lager, så den ikke kommer igjen etter en omstart.
import { getCacheEntry, getDb, putCacheEntry } from '../data/db';

/** Eldre enn dette er en gammel runde. */
const NEW_ROUND_MS = 48 * 60 * 60 * 1000;

export function isNewRound(endedAt: string | null, now: number): boolean {
  if (!endedAt) return false;
  const ended = Date.parse(endedAt);
  return Number.isFinite(ended) && now - ended <= NEW_ROUND_MS;
}

/** Innenfor økta, også før lagringen har svart, og om lagringen feiler. */
const seenThisSession = new Set<string>();

/** Bare for testene. */
export function resetConfettiSession(): void {
  seenThisSession.clear();
}

/** `true` én gang per spill; svaret er også merket som brukt. Kaster aldri. */
export async function claimConfetti(gameId: string, endedAt: string | null, now = Date.now()): Promise<boolean> {
  if (!isNewRound(endedAt, now) || seenThisSession.has(gameId)) return false;
  seenThisSession.add(gameId);
  const key = `result-confetti:${gameId}`;
  try {
    const db = await getDb();
    if (await getCacheEntry(db, key)) return false;
    await putCacheEntry(db, { key, payload: '1', fetchedAt: new Date(now).toISOString() });
  } catch {
    // Uten lager gjelder økta: en feiring for mye er bedre enn en feil.
  }
  return true;
}
