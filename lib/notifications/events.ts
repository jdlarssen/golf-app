import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify, shouldSendMailFallback } from './notify';

/**
 * Partisjonér spillere i off-app (skal ha varselet) og on-app (kan droppe det)
 * ut fra deres `last_seen_at`, målt med samme terskel som push/mail-gaten
 * (`shouldSendMailFallback`) — så «on-app» aldri drifter fra push-definisjonen.
 *
 * Fail-open (#1134): en spiller som mangler rad i `lastSeenById` (ukjent
 * `last_seen_at`) regnes som off-app. Et varsel droppes ALDRI på usikkerhet —
 * den eneste aksepterte feilretningen er «en redundant rad for mye», aldri
 * «en manglende rad for en off-app-spiller».
 */
export function partitionByAppPresence<T extends { user_id: string }>(
  players: T[],
  lastSeenById: Map<string, string | null>,
): { offApp: T[]; onApp: T[] } {
  const offApp: T[] = [];
  const onApp: T[] = [];
  for (const p of players) {
    // Manglende rad → `?? null` → shouldSendMailFallback(null) = true = off-app.
    if (shouldSendMailFallback(lastSeenById.get(p.user_id) ?? null)) {
      offApp.push(p);
    } else {
      onApp.push(p);
    }
  }
  return { offApp, onApp };
}

/**
 * Best-effort `game_finished`-varsel til alle spillere i ett spill.
 *
 * Brukes både av `endGame` (uten sideturnering) og `endGameWithSideWinners`
 * (med sideturnering). Returnerer per-spiller `shouldAlsoSendMail`-flagget
 * som en Map, slik at caller kan filtrere mail-mottakerlisten på det samme
 * off-app-gating-resultatet.
 *
 * `logPrefix` brukes som console.error-prefix når en notify-rejection
 * loggføres — typisk `'endGame'` eller `'endGameWithSideWinners'` så feilen
 * kan spores tilbake til hvilken action den kom fra i Vercel-logs.
 */
export async function notifyPlayersGameFinished(
  players: Array<{ user_id: string }>,
  game: { id: string; name: string },
  logPrefix: string,
): Promise<Map<string, boolean>> {
  const results = await Promise.allSettled(
    players.map((p) =>
      notify({
        userId: p.user_id,
        kind: 'game_finished',
        payload: {
          game_id: game.id,
          game_name: game.name,
        },
      }).then((r) => ({ userId: p.user_id, sendMail: r.shouldAlsoSendMail })),
    ),
  );

  const sendMailByUserId = new Map<string, boolean>();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      sendMailByUserId.set(r.value.userId, r.value.sendMail);
    } else {
      console.error(`[${logPrefix}] game_finished notify failed`, r.reason);
    }
  }
  return sendMailByUserId;
}

/**
 * Best-effort `game_started`-varsel til spillere når et planlagt spill
 * flippes til aktivt (#502). Start-søsteren til `notifyPlayersGameFinished`,
 * men bevisst KUN in-app — ingen mail-backup: start-øyeblikket er
 * tidskritisk på minutt-nivå, og mail-latens gjør backup-en verdiløs.
 * Kindene blir push-kandidater når Web Push (#24) bygges.
 *
 * Caller-kontrakt:
 *  - kall kun når `startScheduledGame` returnerte `started: true`
 *    (flip-vinneren) — ellers dobles varslene i kappløp cron/E1/admin
 *  - filtrer bort trukkede spillere og evt. aktøren som selv utløste
 *    starten før kallet
 *
 * #1134: en spiller som allerede er i appen når spillet flippes, får INGEN
 * in-app-rad — venterommet refresher via realtime og spilleren ser starten
 * uansett. Kun off-app-spillere (målt på `last_seen_at`, samme terskel som
 * push) beholder raden, så de får varselet ved retur. Gaten ligger her, i den
 * ene fan-out-helperen alle tre start-veier kaller, ikke i den hot-path-delte
 * `notify()`-primitiven.
 */
export async function notifyPlayersGameStarted(
  players: Array<{ user_id: string }>,
  game: { id: string; name: string },
  logPrefix: string,
): Promise<void> {
  if (players.length === 0) return;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, last_seen_at')
    .in(
      'id',
      players.map((p) => p.user_id),
    )
    .returns<{ id: string; last_seen_at: string | null }[]>();

  const lastSeenById = new Map<string, string | null>();
  if (error) {
    // Fail-open: uten last_seen_at kan vi ikke skille on- fra off-app, så vi
    // beholder raden for ALLE (tom map → alle regnes off-app). En redundant
    // rad er akseptabelt; en tapt rad for en off-app-spiller er ikke.
    console.error(`[${logPrefix}] game_started last_seen_at lookup failed`, error);
  } else {
    for (const row of data ?? []) {
      lastSeenById.set(row.id, row.last_seen_at);
    }
  }

  const { offApp } = partitionByAppPresence(players, lastSeenById);

  const results = await Promise.allSettled(
    offApp.map((p) =>
      notify({
        userId: p.user_id,
        kind: 'game_started',
        payload: {
          game_id: game.id,
          game_name: game.name,
        },
      }),
    ),
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error(`[${logPrefix}] game_started notify failed`, r.reason);
    }
  }
}

/**
 * Best-effort `cup_finished`-varsel til alle deltakere i en cup (tournament
 * av matcher). Cup-analogen til `notifyPlayersGameFinished` — samme
 * in-app-først + off-app-mail-prinsipp: `notify()` inserter alltid in-app,
 * og returnert `shouldAlsoSendMail`-Map lar caller filtrere mail-mottakerne
 * til kun off-app-deltakere (#377).
 *
 * `logPrefix` brukes som console.error-prefix ved notify-rejection — typisk
 * `'finishTournament'` så feilen kan spores i Vercel-logs.
 */
export async function notifyParticipantsCupFinished(
  participants: Array<{ user_id: string }>,
  tournament: { id: string; name: string },
  logPrefix: string,
): Promise<Map<string, boolean>> {
  const results = await Promise.allSettled(
    participants.map((p) =>
      notify({
        userId: p.user_id,
        kind: 'cup_finished',
        payload: {
          tournament_id: tournament.id,
          tournament_name: tournament.name,
        },
      }).then((r) => ({ userId: p.user_id, sendMail: r.shouldAlsoSendMail })),
    ),
  );

  const sendMailByUserId = new Map<string, boolean>();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      sendMailByUserId.set(r.value.userId, r.value.sendMail);
    } else {
      console.error(`[${logPrefix}] cup_finished notify failed`, r.reason);
    }
  }
  return sendMailByUserId;
}

/**
 * Best-effort `cup_started`-varsel til alle deltakere i en cup (tournament
 * av matcher). Symmetrisk søster av `notifyParticipantsCupFinished` — samme
 * in-app-først + off-app-mail-prinsipp: `notify()` inserter alltid in-app,
 * og returnert `shouldAlsoSendMail`-Map lar caller filtrere mail-mottakerne
 * til kun off-app-deltakere (#417). Ekstra relevant ved start, der flere
 * deltakere er reelt off-app før de har engasjert seg i appen.
 *
 * `logPrefix` brukes som console.error-prefix ved notify-rejection — typisk
 * `'startTournament'` så feilen kan spores i Vercel-logs.
 */
export async function notifyParticipantsCupStarted(
  participants: Array<{ user_id: string }>,
  tournament: { id: string; name: string },
  logPrefix: string,
): Promise<Map<string, boolean>> {
  const results = await Promise.allSettled(
    participants.map((p) =>
      notify({
        userId: p.user_id,
        kind: 'cup_started',
        payload: {
          tournament_id: tournament.id,
          tournament_name: tournament.name,
        },
      }).then((r) => ({ userId: p.user_id, sendMail: r.shouldAlsoSendMail })),
    ),
  );

  const sendMailByUserId = new Map<string, boolean>();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      sendMailByUserId.set(r.value.userId, r.value.sendMail);
    } else {
      console.error(`[${logPrefix}] cup_started notify failed`, r.reason);
    }
  }
  return sendMailByUserId;
}
