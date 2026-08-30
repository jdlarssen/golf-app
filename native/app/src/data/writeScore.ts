// Native N2 (#1823): speil av webbens `lib/sync/writeScore.ts`.
//
// Samme tre regler, ord for ord:
//  1. Merge — et UTELATT felt (`undefined`) beholder verdien som ligger der,
//     en eksplisitt `null` nuller den. Slag-tasting og putt-tasting kan dermed
//     skrive hvert sitt felt uten å vaske ut det andre, og RPC-en får alltid
//     hele det gjeldende paret (LWW gjelder hele raden).
//  2. Strengt økende `clientUpdatedAt` per (spill, spiller, hull).
//  3. Score + kø-rad i ÉN transaksjon — aldri en rad uten kø-element.
import {
  getScore,
  putQueueItem,
  putScore,
  scoreKey,
  withTxn,
  type LocalScore,
} from './db';

interface WriteScoreArgs {
  gameId: string;
  userId: string;
  holeNumber: number;
  strokes?: number | null;
  putts?: number | null;
  enteredBy: string;
}

/**
 * Strengt økende `clientUpdatedAt` for denne (gameId, userId, holeNumber).
 *
 * Serveren applyer bare på strict `>`. To tastinger på samme millisekund ville
 * derfor fått den andre RPC-en avvist, og drainen ville skrevet den ELDRE
 * server-raden over den lokale — spillerens siste trykk forsvant stille.
 *
 * Tar raden som allerede er lest (writeScore leser den én gang for mergen), så
 * dette er ren aritmetikk uten ekstra DB-tur.
 */
function strictlyIncreasingTimestamp(
  existing: LocalScore | undefined,
  nowIso: string,
): string {
  if (!existing) return nowIso;
  if (nowIso > existing.clientUpdatedAt) return nowIso;
  // nowIso er <= lagret → bump lagret med 1 ms for å garantere strict >.
  return new Date(
    new Date(existing.clientUpdatedAt).getTime() + 1,
  ).toISOString();
}

export async function writeScore(args: WriteScoreArgs): Promise<LocalScore> {
  const id = scoreKey(args.gameId, args.userId, args.holeNumber);
  const nowIso = new Date().toISOString();

  // Lesingen skjer INNE i transaksjonen (webben leser rett utenfor sin Dexie-
  // transaksjon). Samme resultat, men les-endre-skriv blir atomisk også når en
  // drain rører den samme raden samtidig.
  return withTxn(async (txn) => {
    const existing = await getScore(txn, id);
    const clientUpdatedAt = strictlyIncreasingTimestamp(existing, nowIso);

    const row: LocalScore = {
      id,
      gameId: args.gameId,
      userId: args.userId,
      holeNumber: args.holeNumber,
      strokes:
        args.strokes !== undefined ? args.strokes : (existing?.strokes ?? null),
      putts: args.putts !== undefined ? args.putts : (existing?.putts ?? null),
      enteredBy: args.enteredBy,
      clientUpdatedAt,
      serverUpdatedAt: null,
    };

    await putScore(txn, row);
    // Kø-id = score-id: en ny tasting på samme hull erstatter det ventende
    // elementet i stedet for å legge på et til. `createdAt = clientUpdatedAt`
    // gir køen samme rekkefølge som tastingene.
    await putQueueItem(txn, {
      id,
      scoreId: id,
      attemptCount: 0,
      lastError: null,
      createdAt: clientUpdatedAt,
    });

    return row;
  });
}
