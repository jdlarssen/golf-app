// #2265: poengene dine i en avsluttet runde, til dagboka i Rundedagboka.
//
// Ingen ny regel og ingen ny henting: det er det «Forrige runde» på Hjem gjør
// (Hjem v2, #2385). Bundelen og alle slagene hentes én gang etter at runden er
// avsluttet (`refreshFinishedRound`, merket på telefonen), tavlas motor regner
// (`lastRoundPoints`), og wolf og bingo bango bongo får valgene sine fra nettet
// (`fetchCardExtras`). Neste gang dagboka åpnes, står poengene uten nett for de
// rundene som alt er hentet.
//
// Best-effort og kaster aldri: uten poeng står raden med bane og format.
import { countsPoints, lastRoundPoints } from '../lib/lastRound';
import { fetchCardExtras, loadFinishedRound, refreshFinishedRound } from './homeHero';

/**
 * Dine poeng i runden, eller `null` når formatet ikke teller poeng, runden
 * ikke kunne hentes komplett, eller tavla ikke gir deg poeng.
 */
export async function fetchRoundPoints(
  gameId: string,
  gameMode: string,
  userId: string,
): Promise<number | null> {
  if (!countsPoints(gameMode)) return null;
  try {
    await refreshFinishedRound(gameId);
    const data = await loadFinishedRound(gameId);
    if (!data) return null;
    const extras = await fetchCardExtras(gameId, gameMode);
    return lastRoundPoints(data.bundle, data.scores, userId, extras ?? {});
  } catch {
    return null;
  }
}
