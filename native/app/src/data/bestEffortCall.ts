// native/app/src/data/bestEffortCall.ts
// #2215: ett hjem for «spør serveren om noe etter en skriving som alt har
// lyktes, men la aldri svaret stoppe skjermen».
//
// To kall har den formen: cache-tømmingen (`refreshWebCache.ts`) og
// invitasjonsvarslene etter en publisering (`createGame.ts`). Begge kommer ETTER
// at raden er lagret, begge awaites, og svaret endrer aldri utfallet. Står
// tidsgrensen bare i det ene, holder en nettside som henger fortsatt det andre
// fast. Derfor bor den her.
import { callWebRoute } from './webApi';

/**
 * Hvor lenge skjermen venter på svaret. `callWebRoute` har ingen tidsgrense, så
 * uten denne ville en nettside som henger holdt knappen fast til telefonens
 * nett-timeout, lenge etter at skrivingen var lagret. Kallet får gå ferdig i
 * bakgrunnen; vi slutter bare å vente.
 */
export const BEST_EFFORT_WAIT_MS = 5_000;

/**
 * `POST` mot en app→server-rute der alt annet enn 200 bare logges.
 *
 * Kaster aldri: løftet til kallerne er at en lagret skriving aldri blir vist som
 * en feil. `try` står selv om `callWebRoute` fanger alt, av samme grunn.
 *
 * @param path stien på web-deployen, allerede kodet.
 * @param logPrefix søkestrengen i loggen, f.eks. `[refreshWebCache]`.
 * @param gameId spillet, bare for loggen.
 */
export async function bestEffortCall(
  path: string,
  logPrefix: string,
  gameId: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), BEST_EFFORT_WAIT_MS);
  });
  try {
    const call = await Promise.race([callWebRoute(path, 'POST'), timedOut]);
    if (call === 'timeout') {
      console.error(`${logPrefix} ga opp etter`, BEST_EFFORT_WAIT_MS, 'ms', gameId);
      return;
    }
    if (call.ok && call.status === 200) return;
    console.error(`${logPrefix} fikk ikke svar 200`, gameId, call.ok ? call.status : call.reason);
  } catch (err: unknown) {
    console.error(`${logPrefix} kastet`, gameId, err);
  } finally {
    clearTimeout(timer);
  }
}
