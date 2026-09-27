// Native N2 (#1823): speil av webbens `lib/sync/syncWorker.ts`.
//
// Selve avgjørelsene er IKKE speilet — de importeres fra repo-kilden, samme
// filer webben kjører på: `syncRetryDecision` og `isLockedCardError` (#668,
// #2211), `interpretUpsertReply` (#2211) og `conflictRecordFor` (#1611). Det
// som er speilet her er rekkefølgen rundt dem: kø i createdAt-orden,
// karantene-hopp, RPC, ferskhets-sjekk (#1457), oppgjør av låste avslag og
// dequeue.
import {
  isLockedCardError,
  REFUSED_WRITE_ERROR,
  syncRetryDecision,
} from '../../../../lib/sync/classifyError';
import { conflictRecordFor } from '../../../../lib/sync/conflict';
import { interpretUpsertReply } from '../../../../lib/sync/upsertReply';
import { currentDeviceUserId, supabase } from '../supabase';
import {
  deleteQueueItem,
  deleteScore,
  getDb,
  getScore,
  listQueue,
  markQueueAbandoned,
  markQueueRetry,
  putConflict,
  putScore,
  withTxn,
  type LocalScore,
  type SyncQueueItem,
} from './db';
import { isOwnerWipeBlocked } from './ownerWipeBlock';

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
// #2211: et kall som kom mens en drain pågikk, returnerte tomt og lot
// elementet vente på neste utløser. Husk det og kjør én gang til.
let rerunRequested = false;
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
  // ganger og kjempet om de samme radene. Kallet huskes (#2211), og drainen
  // kjører én gang til når den som pågår, er ferdig.
  if (inFlight) {
    rerunRequested = true;
    return EMPTY;
  }
  // #1959: eierbytte-wipen kastet — køen tilhører forrige bruker.
  if (isOwnerWipeBlocked()) return EMPTY;
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
        // offline.
        const decision = syncRetryDecision({
          attemptCount: item.attemptCount,
          errorMessage: error.message,
        });
        // #2211: et låst kort (RLS-bruddet ved innsetting, eller 0148-vakta på
        // en oppdatering i en avsluttet runde) gjøres opp, ikke bare parkeres.
        if (decision === 'abandon' && isLockedCardError(error.message)) {
          const settled = await settleLockedRefusal(
            item,
            score,
            error.message,
            currentUserId,
          );
          if (settled === 'abandoned') abandoned++;
          else if (settled === 'errored') errored++;
          continue;
        }
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
      const reply = interpretUpsertReply(row, score.clientUpdatedAt);

      // #2211: kortet er låst (levert / trukket / runden ikke aktiv). RLS
      // filtrerte UPDATE-en til 0 rader, og RPC-en svarte med en NULL-rad uten
      // feil. Før ble den tatt ut av køen som om alt gikk bra, og telefonen
      // beholdt et tall serveren aldri tok imot.
      if (reply === 'refused') {
        const settled = await settleLockedRefusal(
          item,
          score,
          REFUSED_WRITE_ERROR,
          currentUserId,
        );
        if (settled === 'abandoned') abandoned++;
        else if (settled === 'errored') errored++;
        continue;
      }

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

        if (reply === 'applied' && row) {
          await putScore(txn, { ...current, serverUpdatedAt: row.updated_at });
          await deleteQueueItem(txn, item.id);
          return 'applied' as const;
        }

        // Serveren beholdt en nyere-eller-lik rad (`interpretUpsertReply`):
        //
        // - 'server-wins': skriv server-raden over den lokale (ekte LWW).
        // - 'kept-local': samme øyeblikk — ekkoet av en skriving som alt er
        //   lagret, men der svaret gikk tapt. Behold lokal, ta den ut av køen.
        //
        // Når serveren faktisk vinner, avgjør `conflictRecordFor` om
        // overskrivingen fortjener et varsel — samme regel som realtime-mergen
        // bruker, én definisjon (#1611).
        if (reply === 'server-wins' && row) {
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

        // 'kept-local': behold lokale data, bare ta den ut av køen.
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
    if (rerunRequested) {
      rerunRequested = false;
      void drainQueue('etter pågående drain');
    }
  }
}

/**
 * #2211: gjør opp en skriving serveren avviste fordi kortet er låst. Et låst
 * kort viser det kortet faktisk har, og varselet forklarer hvorfor endringen
 * ikke kom med. Speiler webbens `settleLockedRefusal` i `lib/sync/syncWorker.ts`.
 *
 * - Uten sesjon: en tapt sesjon gir nøyaktig samme RLS-feil som et låst kort.
 *   Å slette på det ville brutt kjerne-invarianten i `classifyError.ts` (en
 *   utløpt sesjon sletter aldri slag), så bare tell opp forsøket.
 * - Feiler serverlesingen: tell opp, la elementet stå. Et avslag går aldri i
 *   karantene før telefonen har rettet seg etter serveren.
 * - Raden er redigert mens RPC-en var i lufta (#1457): rør ingenting.
 * - Ellers: lokal rad ← serverens rad (eller slettet når serveren ikke har
 *   noen), og elementet settes i karantene med `lastError`. Ingen konfliktpost;
 *   karantenebanneret er varselet.
 */
async function settleLockedRefusal(
  item: SyncQueueItem,
  score: LocalScore,
  lastError: string,
  currentUserId: string | null,
): Promise<'abandoned' | 'errored' | 'edited-mid-flight'> {
  const keepForRetry = async () => {
    await withTxn((txn) =>
      markQueueRetry(txn, item.id, {
        attemptCount: item.attemptCount + 1,
        lastError,
      }),
    );
    return 'errored' as const;
  };

  if (currentUserId == null) return keepForRetry();

  let serverRow: {
    strokes: number | null;
    putts: number | null;
    entered_by: string;
    client_updated_at: string;
    updated_at: string;
  } | null;
  try {
    const { data, error } = await supabase
      .from('scores')
      .select('strokes, putts, entered_by, client_updated_at, updated_at')
      .eq('game_id', score.gameId)
      .eq('user_id', score.userId)
      .eq('hole_number', score.holeNumber)
      .maybeSingle();
    if (error) return keepForRetry();
    serverRow = data;
  } catch {
    return keepForRetry();
  }

  return withTxn(async (txn) => {
    const current = await getScore(txn, item.scoreId);
    if (!current || current.clientUpdatedAt !== score.clientUpdatedAt) {
      return 'edited-mid-flight' as const;
    }
    if (serverRow) {
      await putScore(txn, {
        ...current,
        strokes: serverRow.strokes,
        putts: serverRow.putts ?? null,
        enteredBy: serverRow.entered_by,
        clientUpdatedAt: serverRow.client_updated_at,
        serverUpdatedAt: serverRow.updated_at,
      });
    } else {
      await deleteScore(txn, item.scoreId);
    }
    await markQueueAbandoned(txn, item.id, {
      attemptCount: item.attemptCount + 1,
      lastError,
      abandonedAt: new Date().toISOString(),
    });
    return 'abandoned' as const;
  });
}
