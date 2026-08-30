// Native N2 (#1823): speil av webbens `lib/sync/realtime.ts` +
// `realtimeChannel.ts` + server→lokal-mergen i `mergeServerScore.ts`.
//
// De to første er navigator/window-bundet og kan ikke deles; #1366-disiplinen
// er derfor speilet som kode her og som kontraktskrav i #1823. Selve
// konflikt-regelen deles: `conflictRecordFor` importeres fra repo-kilden, så
// realtime og drainen svarer likt på «fortjener denne overskrivingen et
// varsel?» — én definisjon, aldri to (#1611).
import type { RealtimeChannel } from '@supabase/supabase-js';
import { conflictRecordFor } from '../../../../lib/sync/conflict';
import type {
  MergeOutcome,
  ServerScoreRow,
} from '../../../../lib/sync/mergeServerScore';
import { currentDeviceUserId, supabase } from '../supabase';
import {
  deleteQueueItem,
  getScore,
  putConflict,
  putScore,
  scoreKey,
  withTxn,
} from './db';
import { addOnlineListener, isDeviceOnline } from './syncTriggers';

export type { MergeOutcome, ServerScoreRow };

/**
 * Antall `CHANNEL_ERROR`/`TIMED_OUT` på rad før kanalen bygges på nytt. Phoenix
 * re-joiner selv (1s/2s/5s/10s i realtime-js) og fyrer statuscallbacken på hvert
 * forsøk, så noe lavere ville kjempet mot bibliotekets egen retry.
 */
const REBUILD_AFTER_CONSECUTIVE_FAILURES = 3;

/** Backoff før hver gjenoppbygging; siste verdi gjentas. */
const REBUILD_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000];

let nextSubscriptionId = 0;

export type RealtimeStatus =
  | 'kobler til'
  | 'tilkoblet'
  | 'feil'
  | 'bygger på nytt'
  | 'avsluttet';

/**
 * Én rad fra `public.scores` slik den kommer inn i en postgres_changes-payload.
 */
type ScoreRowFromDb = {
  game_id: string;
  user_id: string;
  hole_number: number;
  strokes: number | null;
  putts: number | null;
  entered_by: string;
  client_updated_at: string;
  updated_at: string;
};

/**
 * Den ene veien en server-verdi kan erstatte en lokal utenfor drainen — speil
 * av `mergeServerScore` (#1611).
 *
 * `currentUserId` slås opp av KALLEREN, aldri her inne: avgjørelsen og
 * skrivingen skal ligge i én transaksjon, og en auth-tur midt i den er
 * nettopp det webben måtte unngå.
 */
export async function mergeServerScore(
  incoming: ServerScoreRow,
  currentUserId: string | null,
): Promise<MergeOutcome> {
  const id = scoreKey(incoming.gameId, incoming.userId, incoming.holeNumber);

  return withTxn(async (txn) => {
    const existing = await getScore(txn, id);

    // Last-write-wins på clientUpdatedAt. Eldre eventer er foreldet, og en LIK
    // er ekkoet av denne enhetens egen skriving på vei tilbake — at den droppes
    // her er hele grunnen til at ekkoet aldri ser ut som en konflikt.
    if (existing && existing.clientUpdatedAt >= incoming.clientUpdatedAt) {
      return 'kept-local' as const;
    }

    const conflict = existing
      ? conflictRecordFor({
          existing,
          incomingStrokes: incoming.strokes,
          currentUserId,
        })
      : null;
    if (conflict) await putConflict(txn, conflict);

    await putScore(txn, {
      id,
      gameId: incoming.gameId,
      userId: incoming.userId,
      holeNumber: incoming.holeNumber,
      strokes: incoming.strokes,
      putts: incoming.putts ?? null,
      enteredBy: incoming.enteredBy,
      clientUpdatedAt: incoming.clientUpdatedAt,
      serverUpdatedAt: incoming.serverUpdatedAt,
    });

    // En ventende opplasting for denne raden (karantene inkludert) gjaldt en
    // verdi som nettopp tapte LWW. Å la den stå ville enten brent en RPC som
    // kommer rett tilbake som no-op, eller latt et «kunne ikke lagres»-varsel
    // stå for en rad som faktisk er i synk.
    await deleteQueueItem(txn, id);

    return conflict
      ? ('applied-with-conflict' as const)
      : ('applied' as const);
  });
}

/**
 * Abonner på en realtime-kanal med lekkasje-sikker opprydding og en
 * selvhelbredende resubscribe-løkke.
 *
 * **Auth-priming, så hands off (#1366).** `await realtime.setAuth()` — UTEN
 * argument — kjører før hver kanal bygges. `subscribe()` snapshotter
 * join-payloaden synkront og fester bare et `access_token` hvis
 * `socket.accessTokenValue` alt er fylt; på en kald klient er den tom, så uten
 * primingen joiner første kanal etter oppstart helt uten token. Det argument-
 * løse kallet henter tokenet via bibliotekets egen `accessToken`-callback og
 * lar `_manuallySetToken` stå `false`.
 *
 * Send ALDRI tokenet som argument: `setAuth(token)` skrur AV bibliotekets eget
 * vedlikehold (`_setAuthSafely` no-op-er på connect og heartbeat, join-ok
 * hopper over `socket.setAuth()`). En runde varer 4–5 timer og et access-token
 * omtrent én — det er nettopp det som drepte kanaler midt i runden. supabase-js
 * kaller selv `setAuth(token)` på hver `TOKEN_REFRESHED`, så primingen skjer
 * per kanalbygg, ikke én gang ved appstart.
 *
 * **Resubscribe.** Bare `CHANNEL_ERROR`/`TIMED_OUT` teller; gjenoppbygging skjer
 * etter tre på rad, med backoff. `SUBSCRIBED` nullstiller begge tellerne.
 * `CLOSED` bygger aldri på nytt — den fyres av vår egen opprydding, og en
 * gjenoppbygging der ville født en zombie-kanal ved unmount. Retries parkeres
 * mens enheten er offline og tas opp igjen når nettet er tilbake. Den nye
 * kanalen subscribes FØR den gamle fjernes, fordi `removeChannel` på den siste
 * kanalen river hele socketen.
 */
function subscribeRealtimeChannel(
  topic: string,
  configure: (channel: RealtimeChannel) => RealtimeChannel,
  onStatus?: (status: RealtimeStatus) => void,
): () => void {
  let unsubscribed = false;
  let channelRef: RealtimeChannel | null = null;
  /** Feilede statuser siden siste `SUBSCRIBED` (eller siste gjenoppbygging). */
  let consecutiveFailures = 0;
  /** Gjenoppbygginger siden siste `SUBSCRIBED` — indekserer backoff-stigen. */
  let rebuildAttempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let parkedUntilOnline = false;
  /** True fra `openChannel` starter til kallet har landet. */
  let rebuildInProgress = false;

  const report = (status: RealtimeStatus) => onStatus?.(status);

  async function openChannel(): Promise<void> {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    // Blindvinduet: byttet under skjer først ETTER await-en, så den UTGÅENDE
    // kanalen er fortsatt `channelRef` og passerer identitets-sjekken i
    // `handleStatus` — mens feilbudsjettet er brukt opp og `retryTimer` er null.
    // Uten flagget kunne én CHANNEL_ERROR fra den døde generasjonen armet en
    // foreldreløs timer som senere river den friske erstatteren.
    rebuildInProgress = true;
    report('kobler til');
    try {
      // Prim realtime-auth FØR kanalen bygges — subscribe() leser
      // `socket.accessTokenValue` slik den står akkurat da. Ingen argument.
      await supabase.realtime.setAuth();
      if (unsubscribed) return;
      const channel = configure(
        supabase.channel(`${topic}#${++nextSubscriptionId}`),
      );
      const previous = channelRef;
      channelRef = channel;
      // Ny generasjon får friskt budsjett: det den utgående ropte i backoff-
      // vinduet er ikke denne kanalens gjeld.
      consecutiveFailures = 0;
      channel.subscribe((status) => handleStatus(status, channel));
      if (previous) {
        // Først nå — å fjerne den siste kanalen først ville koblet ned socketen
        // den nye skal joine på.
        void supabase.removeChannel(previous);
      }
    } finally {
      // `finally`, ikke en hale-tilordning: på reject-veien må dette kjøre FØR
      // `.catch` når `scheduleRebuild`, ellers låser en feilet gjenoppbygging seg.
      rebuildInProgress = false;
    }
  }

  function scheduleRebuild(): void {
    if (unsubscribed || retryTimer || rebuildInProgress) return;
    if (!isDeviceOnline()) {
      // Ingen vits i å brenne backoff-steg mens enheten er offline;
      // online-lytteren tar den opp igjen.
      parkedUntilOnline = true;
      return;
    }
    const delay =
      REBUILD_BACKOFF_MS[
        Math.min(rebuildAttempts, REBUILD_BACKOFF_MS.length - 1)
      ]!;
    rebuildAttempts += 1;
    report('bygger på nytt');
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (unsubscribed) return;
      openChannel().catch((err: unknown) => {
        console.error('[realtime] gjenoppbygging feilet', err);
        scheduleRebuild();
      });
    }, delay);
  }

  function handleStatus(status: string, channel: RealtimeChannel): void {
    // Statuser fra en kanal vi alt har erstattet teller ikke — den henger på
    // denne handleren til leave-turen er ferdig.
    if (unsubscribed || channel !== channelRef) return;
    if (status === 'SUBSCRIBED') {
      consecutiveFailures = 0;
      rebuildAttempts = 0;
      // Phoenix kom seg selv; ingenting venter på nett lenger.
      parkedUntilOnline = false;
      report('tilkoblet');
      return;
    }
    // Alt annet som ikke er en feil — særlig CLOSED, som vår egen
    // removeChannel fyrer — lar vi ligge.
    if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
    report('feil');
    consecutiveFailures += 1;
    if (consecutiveFailures < REBUILD_AFTER_CONSECUTIVE_FAILURES) return;
    scheduleRebuild();
  }

  const removeOnlineListener = addOnlineListener(() => {
    if (unsubscribed || !parkedUntilOnline) return;
    parkedUntilOnline = false;
    scheduleRebuild();
  });

  openChannel().catch((err: unknown) => {
    console.error('[realtime] gjenoppbygging feilet', err);
    scheduleRebuild();
  });

  return () => {
    unsubscribed = true;
    removeOnlineListener();
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (channelRef) {
      void supabase.removeChannel(channelRef);
      channelRef = null;
    }
    report('avsluttet');
  };
}

async function mergeIncoming(
  row: ScoreRowFromDb,
  onMerge?: (outcome: MergeOutcome) => void,
): Promise<void> {
  const currentUserId = await currentDeviceUserId();
  const outcome = await mergeServerScore(
    {
      gameId: row.game_id,
      userId: row.user_id,
      holeNumber: row.hole_number,
      strokes: row.strokes,
      putts: row.putts ?? null,
      enteredBy: row.entered_by,
      clientUpdatedAt: row.client_updated_at,
      serverUpdatedAt: row.updated_at,
    },
    currentUserId,
  );
  onMerge?.(outcome);
}

/** Abonner på score-endringer for ett spill. */
export function subscribeGameScores(
  gameId: string,
  handlers: {
    onStatus?: (status: RealtimeStatus) => void;
    onMerge?: (outcome: MergeOutcome) => void;
  } = {},
): () => void {
  return subscribeRealtimeChannel(
    `scores:${gameId}`,
    (channel) =>
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scores',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Partial<ScoreRowFromDb>;
          if (!row || !row.game_id || !row.user_id || row.hole_number == null)
            return;
          void mergeIncoming(row as ScoreRowFromDb, handlers.onMerge);
        },
      ),
    handlers.onStatus,
  );
}
