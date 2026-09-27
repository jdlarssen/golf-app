import { localDb, type LocalScore, type SyncQueueItem } from './db';
import { getBrowserClient } from '@/lib/supabase/client';
import {
  isLockedCardError,
  REFUSED_WRITE_ERROR,
  syncRetryDecision,
} from './classifyError';
import { conflictRecordFor } from './conflict';
import { currentDeviceUserId } from './currentUser';
import { isOwnerWipeBlocked } from './ownerWipeBlock';
import { interpretUpsertReply } from './upsertReply';

let inFlight = false;
// #2211: a call that lands while a drain is running used to return empty and
// leave its item to the next 30 s tick. Remember it and run once more.
let rerunRequested = false;

export async function drainQueue(): Promise<{
  pushed: number;
  rejected: number;
  errored: number;
  abandoned: number;
}> {
  if (inFlight) {
    rerunRequested = true;
    return { pushed: 0, rejected: 0, errored: 0, abandoned: 0 };
  }
  // #1959: the owner-switch wipe failed — the queue is the previous user's.
  if (isOwnerWipeBlocked()) {
    return { pushed: 0, rejected: 0, errored: 0, abandoned: 0 };
  }
  inFlight = true;
  try {
    const queue = await localDb.syncQueue.orderBy('createdAt').toArray();
    if (queue.length === 0)
      return { pushed: 0, rejected: 0, errored: 0, abandoned: 0 };

    const supabase = getBrowserClient();

    // #1368: who is logged in on THIS device. Read once per drain — the
    // conflict gate below needs it for every item.
    const currentUserId = await currentDeviceUserId();

    let pushed = 0;
    let rejected = 0;
    let errored = 0;
    let abandoned = 0;

    for (const item of queue) {
      // Quarantined (#668): a permanently-failing item we already gave up on.
      // Skip it so it never re-enters the retry loop; it stays in the queue as
      // a record of failure that SyncBanner surfaces to the player.
      if (item.abandonedAt) continue;

      const score = await localDb.scores.get(item.scoreId);
      if (!score) {
        await localDb.syncQueue.delete(item.id);
        continue;
      }

      const { data, error } = await supabase.rpc('upsert_score_if_newer', {
        p_game_id: score.gameId,
        p_user_id: score.userId,
        p_hole_number: score.holeNumber,
        // scores.strokes is a nullable column; null is a valid score-clear value.
        // Generated RPC arg type is non-null so we cast.
        p_strokes: score.strokes as number,
        p_entered_by: score.enteredBy,
        p_client_updated_at: score.clientUpdatedAt,
        // #939: putts rides the same LWW row. Cast like p_strokes — null/undefined
        // are both valid (the RPC param defaults to null). Always send the current
        // value so a stroke-only edit never nulls a stored putt count.
        p_putts: (score.putts ?? null) as number,
      });

      if (error) {
        // #668: a stuck item used to retry forever. Cap ONLY explicitly
        // permanent failures (RLS / constraint / malformed) — transient
        // network / auth / rate-limit / unknown errors keep retrying so a
        // genuinely-entered stroke is never dropped because the player was
        // offline.
        const decision = syncRetryDecision({
          attemptCount: item.attemptCount,
          errorMessage: error.message,
        });
        // #2211: a locked card (the INSERT's RLS violation, or the 0148
        // finished-game guard on an UPDATE) settles instead of just parking.
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
          await localDb.syncQueue.update(item.id, {
            attemptCount: item.attemptCount + 1,
            lastError: error.message,
            abandonedAt: new Date().toISOString(),
          });
          abandoned++;
        } else {
          await localDb.syncQueue.update(item.id, {
            attemptCount: item.attemptCount + 1,
            lastError: error.message,
          });
          errored++;
        }
        continue;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const reply = interpretUpsertReply(row, score.clientUpdatedAt);

      // #2211: the card is locked (submitted / withdrawn / round not active).
      // RLS filtered the UPDATE to 0 rows and the RPC answered an all-NULL
      // row with no error — this used to be dequeued as success, and the
      // phone kept a number the server never took.
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
      const outcome = await localDb.transaction(
        'rw',
        localDb.scores,
        localDb.syncQueue,
        localDb.conflicts,
        async () => {
          const current = await localDb.scores.get(item.scoreId);
          if (!current || current.clientUpdatedAt !== score.clientUpdatedAt) {
            return 'edited-mid-flight' as const;
          }

          if (reply === 'applied') {
            await localDb.scores.update(item.scoreId, {
              serverUpdatedAt: row.updated_at,
            });
            await localDb.syncQueue.delete(item.id);
            return 'applied' as const;
          }

          // The server kept a newer-or-equal entry (`interpretUpsertReply`):
          //
          // - 'server-wins': overwrite local with the server row (genuine LWW).
          // - 'kept-local': the same instant — the echo of a write that already
          //   landed but whose reply was lost, or a second tab draining the
          //   same item. Keep local, just dequeue.
          //
          // When server genuinely wins AND the local score was entered on this
          // device AND strokes actually differ, write a ConflictRecord so
          // SyncBanner can surface the silent overwrite (#688 Part 2).
          if (reply === 'server-wins') {
            // Surface the overwrite as a ConflictRecord when the rule says so.
            // The rule itself lives in `conflictRecordFor` (#1611) because the
            // realtime/catch-up merge needs the very same test; `score` is the
            // local row read above — no extra DB call needed.
            const conflict = conflictRecordFor({
              existing: score,
              incomingStrokes: row.strokes,
              currentUserId,
            });
            if (conflict) await localDb.conflicts.put(conflict);

            await localDb.scores.update(item.scoreId, {
              strokes: row.strokes,
              // #939: keep putts in sync with the server-wins row so a later
              // local edit merges the authoritative putt count, not a stale one.
              putts: row.putts ?? null,
              enteredBy: row.entered_by,
              clientUpdatedAt: row.client_updated_at,
              serverUpdatedAt: row.updated_at,
            });
            await localDb.syncQueue.delete(item.id);
            return 'server-wins' as const;
          }

          // 'kept-local': keep local data as-is, just dequeue.
          await localDb.syncQueue.delete(item.id);
          return 'kept-local' as const;
        },
      );

      if (outcome === 'edited-mid-flight') continue;
      if (outcome === 'applied') pushed++;
      else if (outcome === 'server-wins') rejected++;
    }

    return { pushed, rejected, errored, abandoned };
  } finally {
    inFlight = false;
    if (rerunRequested) {
      rerunRequested = false;
      void drainQueue();
    }
  }
}

/**
 * #2211: settle a write the server refused because the card is locked. A
 * locked card shows what the card actually holds, and the notice explains why
 * the change did not make it.
 *
 * - No session: a lost session produces exactly the same RLS error as a
 *   locked card (the RPC sees no row as anon and falls through to the INSERT).
 *   Deleting on that would break the core invariant in `classifyError.ts` —
 *   an expired session never deletes strokes — so only count the attempt and
 *   retry after the next login.
 * - The server read fails: count the attempt, keep the item. A refusal is
 *   never quarantined before the phone has matched the server.
 * - The row was edited while the RPC was in the air (#1457): touch nothing.
 *   `writeScore` already re-queued it for the newer value.
 * - Otherwise: local row ← server row (or deleted when the server has none,
 *   a refused first stroke), and the item is quarantined with `lastError`,
 *   which `summarizeQuarantine` recognises as locked. No ConflictRecord — the
 *   quarantine banner is the notice.
 */
async function settleLockedRefusal(
  item: SyncQueueItem,
  score: LocalScore,
  lastError: string,
  currentUserId: string | null,
): Promise<'abandoned' | 'errored' | 'edited-mid-flight'> {
  const keepForRetry = async () => {
    await localDb.syncQueue.update(item.id, {
      attemptCount: item.attemptCount + 1,
      lastError,
    });
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
    const { data, error } = await getBrowserClient()
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

  return localDb.transaction(
    'rw',
    localDb.scores,
    localDb.syncQueue,
    async () => {
      const current = await localDb.scores.get(item.scoreId);
      if (!current || current.clientUpdatedAt !== score.clientUpdatedAt) {
        return 'edited-mid-flight' as const;
      }
      if (serverRow) {
        await localDb.scores.update(item.scoreId, {
          strokes: serverRow.strokes,
          putts: serverRow.putts ?? null,
          enteredBy: serverRow.entered_by,
          clientUpdatedAt: serverRow.client_updated_at,
          serverUpdatedAt: serverRow.updated_at,
        });
      } else {
        await localDb.scores.delete(item.scoreId);
      }
      await localDb.syncQueue.update(item.id, {
        attemptCount: item.attemptCount + 1,
        lastError,
        abandonedAt: new Date().toISOString(),
      });
      return 'abandoned' as const;
    },
  );
}

// Client-side bootstrap: start listening to online events and a fallback interval.
let started = false;
export function startSyncListener() {
  if (typeof window === 'undefined' || started) return;
  started = true;
  window.addEventListener('online', () => {
    void drainQueue();
  });
  window.addEventListener('focus', () => {
    void drainQueue();
  });
  setInterval(() => {
    void drainQueue();
  }, 30_000);
  // Try once on bootstrap.
  void drainQueue();
}
