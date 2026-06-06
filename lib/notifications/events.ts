import 'server-only';
import { notify } from './notify';

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
