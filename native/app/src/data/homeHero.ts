// #2254: det heltekortet og billetten på Hjem leser om ett spill.
//
// Ingen ny henting: spill-bundelen (`gameBundle.ts`) og de lokale slagene
// (`listScoresForGame`, fylt av `seedGameScores`) er de samme spillets side
// leser. Derfor kan Hjem tegne heltekortet i flymodus når spillet har vært
// åpnet på telefonen før.
//
// Hjem v2 (#2385): «Forrige runde» leser det samme for runden som ble
// avsluttet sist, men henter den bare én gang (`refreshFinishedRound`): et
// avsluttet klubbspill kan være flere tusen slag, og det endrer seg nesten
// aldri. For wolf og bingo bango bongo henter Hjem også valgene tavla regner
// med (`fetchCardExtras`, de samme hentingene som tavla gjør).
//
// Alle funksjonene er best-effort og kaster aldri. Hjem har alt lista si; en
// feil her skal la det som ligger i cachen stå, ikke gi en feiltekst.
import { choiceSourceFor } from '../lib/choiceSource';
import type { ScoringExtras } from '../lib/scoringContext';
import { fetchBingoBangoBongoHoles, fetchWolfChoices } from './choices';
import { getCacheEntry, getDb, listScoresForGame, putCacheEntry, type LocalScore } from './db';
import { loadGameBundle, refreshGameBundle, type GameBundle } from './gameBundle';
import { seedGameScores } from './seedScores';

export interface CardBundle {
  bundle: GameBundle;
  scores: LocalScore[];
}

/** Bundelen og slagene som ligger på enheten, eller `null` uten bundel. */
export async function loadCardBundle(gameId: string): Promise<CardBundle | null> {
  try {
    const bundle = await loadGameBundle(gameId);
    if (!bundle) return null;
    const scores = await listScoresForGame(await getDb(), gameId);
    return { bundle, scores };
  } catch {
    return null;
  }
}

/**
 * Hent bundelen på nytt, og for heltekortet også slagene. Plassen regnes på
 * alle spillernes slag, og RLS slipper dem gjennom for en deltaker i et
 * live-spill. Billetten trenger bare bundelen (flighten).
 */
export async function refreshCardBundle(
  gameId: string,
  opts: { withScores?: boolean } = {},
): Promise<void> {
  await Promise.allSettled([
    refreshGameBundle(gameId),
    opts.withScores ? seedGameScores(gameId) : Promise.resolve(0),
  ]);
}

/**
 * Valgene wolf og bingo bango bongo regner poengene med, for «Forrige runde»
 * (Hjem v2, #2385). De bor bare på serveren, så de hentes her, og bare for de
 * to formatene (et tomt objekt for de andre). Feiler hentingen, blir svaret
 * `null`, aldri en tom liste: da beholder Hjem valgene fra forrige henting,
 * og uten dem sier motoren at valgene mangler, så raden viser brutto i stedet
 * for poeng regnet uten valgene.
 */
export async function fetchCardExtras(
  gameId: string,
  gameMode: string,
): Promise<ScoringExtras | null> {
  try {
    const source = choiceSourceFor(gameMode);
    if (source === 'wolf') return { wolfChoices: await fetchWolfChoices(gameId) };
    if (source === 'bingo_bango_bongo') {
      return { bingoBangoBongoHoles: await fetchBingoBangoBongoHoles(gameId) };
    }
    return {};
  } catch {
    return null;
  }
}

/** Merket som sier at en avsluttet runde ligger komplett på telefonen. */
function finishedRoundKey(gameId: string): string {
  return `last-round:${gameId}`;
}

/**
 * Hent forrige runde, bundelen og alle slagene, én gang etter at den er
 * avsluttet. Merket settes bare når begge hentingene lyktes og bundelen sier
 * at runden er avsluttet, så en halv henting prøves igjen ved neste besøk. En
 * retting etter avslutningen kommer inn når tavla for runden åpnes (den henter
 * slagene hver gang), og merket forsvinner med resten av basen ved utlogging.
 * Kan bundelen ikke leses lenger (ny app-versjon), hentes runden på nytt.
 */
export async function refreshFinishedRound(gameId: string): Promise<void> {
  try {
    const db = await getDb();
    // Merket gjelder bare så lenge bundelen kan leses: en ny app-versjon med
    // ny `BUNDLE_PAYLOAD_VERSION` leser den gamle som «ingen cache».
    if ((await getCacheEntry(db, finishedRoundKey(gameId))) && (await loadGameBundle(gameId))) {
      return;
    }
    const [bundle] = await Promise.all([refreshGameBundle(gameId), seedGameScores(gameId)]);
    if (bundle.game.status !== 'finished') return;
    await putCacheEntry(db, {
      key: finishedRoundKey(gameId),
      payload: '1',
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    // Best-effort, som resten av fila: neste besøk prøver igjen.
  }
}

/**
 * Forrige runde fra enheten, men bare når den er hentet komplett. Før det kan
 * slagene på telefonen være bare dine egne (eller ingen, om en annen førte
 * kortet ditt), og en sum av dem ville sett ut som sluttresultatet.
 */
export async function loadFinishedRound(gameId: string): Promise<CardBundle | null> {
  try {
    if (!(await getCacheEntry(await getDb(), finishedRoundKey(gameId)))) return null;
  } catch {
    return null;
  }
  return loadCardBundle(gameId);
}
