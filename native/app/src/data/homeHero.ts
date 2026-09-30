// #2254: det heltekortet og billetten på Hjem leser om ett spill.
//
// Ingen ny henting: spill-bundelen (`gameBundle.ts`) og de lokale slagene
// (`listScoresForGame`, fylt av `seedGameScores`) er de samme spillets side
// leser. Derfor kan Hjem tegne heltekortet i flymodus når spillet har vært
// åpnet på telefonen før.
//
// Hjem v2 (#2385): «Forrige runde» leser det samme for runden som ble
// avsluttet sist, og for wolf og bingo bango bongo også valgene tavla regner
// med (`fetchCardExtras`, de samme hentingene som tavla gjør).
//
// Alle funksjonene er best-effort og kaster aldri. Hjem har alt lista si; en
// feil her skal la det som ligger i cachen stå, ikke gi en feiltekst.
import { choiceSourceFor } from '../lib/choiceSource';
import type { ScoringExtras } from '../lib/scoringContext';
import { fetchBingoBangoBongoHoles, fetchWolfChoices } from './choices';
import { getDb, listScoresForGame, type LocalScore } from './db';
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
 * to formatene. Feiler hentingen, blir svaret tomt, ikke en tom liste: da sier
 * motoren at valgene mangler, og raden viser brutto i stedet for poeng regnet
 * uten valgene.
 */
export async function fetchCardExtras(gameId: string, gameMode: string): Promise<ScoringExtras> {
  try {
    const source = choiceSourceFor(gameMode);
    if (source === 'wolf') return { wolfChoices: await fetchWolfChoices(gameId) };
    if (source === 'bingo_bango_bongo') {
      return { bingoBangoBongoHoles: await fetchBingoBangoBongoHoles(gameId) };
    }
  } catch {
    // Best-effort, som resten av fila.
  }
  return {};
}
