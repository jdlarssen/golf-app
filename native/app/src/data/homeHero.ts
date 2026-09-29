// #2254: det heltekortet og billetten på Hjem leser om ett spill.
//
// Ingen ny henting: spill-bundelen (`gameBundle.ts`) og de lokale slagene
// (`listScoresForGame`, fylt av `seedGameScores`) er de samme spillets side
// leser. Derfor kan Hjem tegne heltekortet i flymodus når spillet har vært
// åpnet på telefonen før.
//
// Begge funksjonene er best-effort og kaster aldri. Hjem har alt lista si; en
// feil her skal la det som ligger i cachen stå, ikke gi en feiltekst.
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
