// Native N2 (#1823): speil av webbens `lib/sync/syncWorker.ts`.
//
// Selve avgjørelsene er IKKE speilet — de importeres fra repo-kilden, samme
// filer webben kjører på: `syncRetryDecision` (#668), `resolveConflict` (#688)
// og `conflictRecordFor` (#1611). Det som er speilet her er rekkefølgen rundt
// dem: kø i createdAt-orden, karantene-hopp, RPC, ferskhets-sjekk (#1457) og
// dequeue.
import { syncRetryDecision } from '../../../../lib/sync/classifyError';
import {
  conflictRecordFor,
  resolveConflict,
} from '../../../../lib/sync/conflict';
import { currentDeviceUserId, supabase } from '../supabase';
import {
  deleteQueueItem,
  getDb,
  getScore,
  listQueue,
  markQueueAbandoned,
  markQueueRetry,
  putConflict,
  putScore,
  withTxn,
} from './db';

export interface DrainResult {
  pushed: number;
  rejected: number;
  errored: number;
  abandoned: number;
}

/** Siste faktiske drain — statuslinja i Sync-laben leser denne. */
export interface DrainLog extends DrainResult {
  at: string;
  reason: string;
  queued: number;
}

const EMPTY: DrainResult = { pushed: 0, rejected: 0, errored: 0, abandoned: 0 };

let inFlight = false;
let lastDrain: DrainLog | null = null;

export function getLastDrain(): DrainLog | null {
  return lastDrain;
}

/**
 * Tøm køen mot staging. `reason` er ren N2-diagnostikk (hvilken trigger fyrte)
 * og påvirker ingen beslutning — webbens `drainQueue` tar ingen argumenter.
 */
export async function drainQueue(reason = 'manuell'): Promise<DrainResult> {
  // `inFlight`-vakten: to parallelle drains ville sendt samme kø-element to
  // ganger og kjempet om de samme radene.
  if (inFlight) return EMPTY;
  inFlight = true;
  try {
    const db = await getDb();
    const queue = await listQueue(db);

    // #1368: hvem er innlogget på DENNE enheten. Leses én gang per drain —
    // konflikt-porten under trenger den for hvert element.
    const currentUserId = await currentDeviceUserId();

    let pushed = 0;
    let rejected = 0;
    let errored = 0;
    let abandoned = 0;

    for (const item of queue) {
      // Karantene (#668): et permanent feilende element vi allerede har gitt
      // opp. Hopp over det, så det aldri går inn i retry-løkka igjen; raden
      // blir stående som spor av feilen.
      if (item.abandonedAt) continue;

      const score = await getScore(db, item.scoreId);
      if (!score) {
        await withTxn((txn) => deleteQueueItem(txn, item.id));
        continue;
      }

      const { data, error } = await supabase.rpc('upsert_score_if_newer', {
        p_game_id: score.gameId,
        p_user_id: score.userId,
        p_hole_number: score.holeNumber,
        // scores.strokes er en nullbar kolonne; null er en gyldig «nullstill
        // slaget»-verdi. Den genererte RPC-arg-typen er non-null, derav castet.
        p_strokes: score.strokes as number,
        p_entered_by: score.enteredBy,
        p_client_updated_at: score.clientUpdatedAt,
        // #939: putts rir på samme LWW-rad. Send alltid gjeldende verdi, ellers
        // ville en slag-only-tasting nullet et lagret putte-tall.
        p_putts: (score.putts ?? null) as number,
      });

      if (error) {
        // #668: bare EKSPLISITT permanente feil (RLS / constraint / malformed)
        // teller mot taket. Nettverk, auth-utløp og rate-limit prøver videre i
        // det uendelige — et ekte slag skal aldri forsvinne fordi spilleren var
        // offline. Et tilbaketrukket/levert kort feiler ikke her i det hele
        // tatt: RPC-en svarer med et rolig no-op (was_applied=false).
        const decision = syncRetryDecision({
          attemptCount: item.attemptCount,
          errorMessage: error.message,
        });
        if (decision === 'abandon') {
          await withTxn((txn) =>
            markQueueAbandoned(txn, item.id, {
              attemptCount: item.attemptCount + 1,
              lastError: error.message,
              abandonedAt: new Date().toISOString(),
            }),
          );
          abandoned++;
        } else {
          await withTxn((txn) =>
            markQueueRetry(txn, item.id, {
              attemptCount: item.attemptCount + 1,
              lastError: error.message,
            }),
          );
          errored++;
        }
        continue;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const wasApplied = row?.was_applied ?? false;

      // #1457: alt etter RPC-en skjer i én transaksjon MED ferskhets-sjekk.
      // Spilleren kan ha tastet videre på samme felt mens RPC-en var i lufta —
      // da har writeScore re-putt kø-elementet (samme id) for den NYERE
      // verdien. Uten sjekken slettet dequeue-en det nye elementet ubetinget,
      // køen så tom ut, og databasen beholdt mellomverdien til neste tasting.
      // Endret rad → rør ingenting; neste drain laster opp sluttverdien.
      const outcome = await withTxn(async (txn) => {
        const current = await getScore(txn, item.scoreId);
        if (!current || current.clientUpdatedAt !== score.clientUpdatedAt) {
          return 'edited-mid-flight' as const;
        }

        if (wasApplied && row) {
          await putScore(txn, { ...current, serverUpdatedAt: row.updated_at });
          await deleteQueueItem(txn, item.id);
          return 'applied' as const;
        }

        // Serveren hadde en nyere-eller-lik rad. LWW avgjør hva som skjer:
        //
        // - 'server-wins': skriv server-raden over den lokale (ekte LWW).
        // - 'equal': umulig etter #688 (writeScore garanterer strengt økende
        //   tidsstempler), men beholdt defensivt — behandles som behold-lokal.
        // - 'local-wins': skal ikke kunne skje (RPC-en avviser bare når server
        //   >= lokal), men skjer det, beholder vi lokal.
        //
        // Når serveren faktisk vinner, avgjør `conflictRecordFor` om
        // overskrivingen fortjener et varsel — samme regel som realtime-mergen
        // bruker, én definisjon (#1611).
        const resolution = resolveConflict({
          localClientUpdatedAt: score.clientUpdatedAt,
          serverClientUpdatedAt: row?.client_updated_at ?? score.clientUpdatedAt,
        });

        if (resolution === 'server-wins' && row) {
          const conflict = conflictRecordFor({
            existing: score,
            incomingStrokes: row.strokes,
            currentUserId,
          });
          if (conflict) await putConflict(txn, conflict);

          await putScore(txn, {
            ...current,
            strokes: row.strokes,
            // #939: hold putts i takt med den vinnende server-raden, ellers
            // ville en senere lokal endring merget et foreldet putte-tall.
            putts: row.putts ?? null,
            enteredBy: row.entered_by,
            clientUpdatedAt: row.client_updated_at,
            serverUpdatedAt: row.updated_at,
          });
          await deleteQueueItem(txn, item.id);
          return 'server-wins' as const;
        }

        // 'equal' eller 'local-wins': behold lokale data, bare ta den ut av køen.
        await deleteQueueItem(txn, item.id);
        return 'kept-local' as const;
      });

      if (outcome === 'edited-mid-flight') continue;
      if (outcome === 'applied') pushed++;
      else if (outcome === 'server-wins') rejected++;
    }

    const result: DrainResult = { pushed, rejected, errored, abandoned };
    lastDrain = {
      ...result,
      at: new Date().toISOString(),
      reason,
      queued: queue.length,
    };
    return result;
  } finally {
    inFlight = false;
  }
}
