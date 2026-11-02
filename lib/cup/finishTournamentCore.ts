import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { allSettledInBatches } from '@/lib/async/allSettledInBatches';
import { endGameCore } from '@/lib/games/endGameCore';
import { sendCupFinishedNotification } from '@/lib/mail/cupFinishedNotification';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { notifyParticipantsCupFinished } from '@/lib/notifications/events';
import { cupWinnerFromPoints } from './cupWinner';
import { getCupSnapshot } from './getCupSnapshot';
import { matchBlocksOneTapFinish } from './matchSubmissionStatus';
import { allSideAwardsRegistered } from './sideAwardsRegistered';
import { loadTournamentParticipantEmails } from './tournamentParticipants';

/**
 * Avslutningen av en cup, delt av nettets `finishTournament` og appens rute
 * (#2752). Kjernen leser ingen cookie og redirecter aldri: kalleren har gjort gaten
 * og sier hvem som avslutter.
 *
 * `admin` skriver kampene (en klubb-styrer er ikke games-creator), `writer` flipper
 * cupen under `tournaments`-policyen, som på nettet.
 */

export type FinishTournamentError =
  | 'not_found'
  | 'side_awards_missing'
  | 'matches_not_submitted'
  | 'match_finish_failed'
  | 'finish_failed';

/** `alreadyFinished`: et nytt forsøk, og ingen ny skriving eller nytt varsel. */
export type FinishTournamentResult =
  | { ok: true; alreadyFinished: boolean }
  | { ok: false; error: FinishTournamentError };

export async function finishTournamentCore(
  admin: SupabaseClient<Database>,
  writer: SupabaseClient<Database>,
  args: {
    tournamentId: string;
    actor: { id: string; name: string };
    /** «Avslutt likevel» (#1501/#375). Peer-godkjenningen slakkes aldri (#360). */
    allowMissing: boolean;
    unknownLabel: string;
  },
): Promise<FinishTournamentResult> {
  const { tournamentId: id, actor, allowMissing, unknownLabel } = args;

  const snapshot = await getCupSnapshot(id, unknownLabel);
  if (!snapshot) return { ok: false, error: 'not_found' };
  if (snapshot.tournament.status === 'finished') return { ok: true, alreadyFinished: true };

  // 1. Sidepoeng-gate (#1501): cupen kan ikke avsluttes før alle konfigurerte
  // sidepoeng har en registrering (ctp/ld → vinner; gir → begge tellere, 0
  // gyldig). Server-side re-validering av det CupManagement allerede disabler.
  if (!allSideAwardsRegistered(snapshot.sideAwards)) {
    return { ok: false, error: 'side_awards_missing' };
  }

  // 2. Host-kamper endes eksplisitt (source_game_id IS NULL); avledede følger
  // via `finishDerivedGames` i pipelinen. Vi arbeider på ACTIVE host-kamper —
  // allerede finished hopper over (idempotent re-trykk), og scheduled/draft
  // ble aldri spilt (dagens flip rørte uansett aldri kampene).
  const activeHostMatches = snapshot.leaderboard.matches.filter(
    (m) => (m.sourceGameId ?? null) === null && m.status === 'active',
  );

  // 3. Leverings-gate (#1501/#375/#1488 K5): med mindre «Avslutt likevel», må
  // hver active host-kamp enten ha alle ikke-trukne kort levert ELLER være helt
  // trukket (den avsluttes da via WD-skip). Delt predikat med CupManagement-
  // banneret. Mangler noen → stopp med kampliste + «Avslutt likevel»-valg.
  if (!allowMissing) {
    const blocking = activeHostMatches.filter(matchBlocksOneTapFinish);
    if (blocking.length > 0) return { ok: false, error: 'matches_not_submitted' };
  }

  // 4. Løpet: end hver active host-kamp via den EKTE endGame-pipelinen
  // (resultatsammendrag, differensialer, bragder, rundereferat; avledede følger
  // via finishDerivedGames). Skriver via admin-client — en klubb-styrer er ikke
  // games-creator, så creator-RLS-en (0071) dekker ikke stien; authz er alt
  // gjort av `requireAdminOrClubAdminOfCup` over (AGENTS.md trap #3). Per-kamp-
  // varsler undertrykkes — cup-mailen under er reveal-signalet. Feil samles;
  // feiler NOEN kamp → cupen avsluttes IKKE (ingen stille halvferdig tilstand;
  // allerede-avsluttede kamper står, re-trykk er trygt/idempotent).
  const finishFailures: string[] = [];
  for (const m of activeHostMatches) {
    const result = await endGameCore(admin, m.gameId, actor, {
      allowMissing,
      suppressPerGameNotifications: true,
    });
    if (!result.ok) {
      finishFailures.push(m.gameId);
      console.error('[cup] finishTournament match finish failed', {
        id,
        gameId: m.gameId,
        reason: result.reason,
      });
    }
  }
  if (finishFailures.length > 0) return { ok: false, error: 'match_finish_failed' };

  // 5. Re-les snapshotet etter at kampene er avsluttet — vinneren regnes på den
  // ferske stillingen (match-poeng teller kun for `finished` kamper).
  const finalSnapshot = await getCupSnapshot(id, unknownLabel);
  if (!finalSnapshot) return { ok: false, error: 'not_found' };
  const finalLeaderboard = finalSnapshot.leaderboard;
  const finalTournament = finalSnapshot.tournament;

  // Vinner bestemmes av point-status ved avslutning. Hvis ingen lag leder →
  // vinner-team forblir NULL (uavgjort cup avsluttes uten vinner-deklarering).
  // Samme regel som når et sidepoeng rettes etter avslutningen (#2214).
  const winnerTeam = cupWinnerFromPoints(
    finalLeaderboard.team1Points,
    finalLeaderboard.team2Points,
  );

  // #727: assert the finish update touched a row (bug-prevention #2). `writer`,
  // for the update policy on `tournaments` is the backstop here. #2752: only a
  // cup that is not finished yet flips, so two calls at once give one result and
  // one notification. The one that loses finds the cup finished.
  try {
    expectAffected(
      await writer
        .from('tournaments')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
          winner_team: winnerTeam,
        })
        .eq('id', id)
        .neq('status', 'finished')
        .select('id'),
      'finishTournament',
    );
  } catch (err) {
    const { data: after } = await admin.from('tournaments').select('status').eq('id', id).maybeSingle();
    if (after?.status === 'finished') return { ok: true, alreadyFinished: true };
    console.error('[cup] finishTournament failed', { id, err });
    return { ok: false, error: 'finish_failed' };
  }

  // Best-effort avslutnings-varsel: in-app til ALLE deltakere først, mail kun
  // til off-app-deltakere (#377). Samme in-app-først-prinsipp som enkeltspill-
  // avslutningen — ingen egen blanket-mail til alle. Dette er cupens ENESTE
  // reveal-signal (#1501): per-kamp-mailene ble undertrykt i løpet over.
  //
  // Mottakerlista slås opp med admin-klienten inne i helperen (#1540) — med den
  // request-scopede klienten kollapset den til arrangørens egen flight når
  // arrangøren ikke var global admin, og de øvrige deltakerne mistet cupens
  // eneste reveal-signal. Deltakere uten e-post droppes, men Tørny-auth er
  // e-post-OTP, så alle brukere HAR e-post — lista er dermed hele
  // deltaker-settet, og in-app fyrer for alle reelle deltakere.
  const recipients = await loadTournamentParticipantEmails(id);
  const sendMailByUserId = await notifyParticipantsCupFinished(
    recipients,
    { id, name: finalTournament.name },
    'finishTournament',
  );

  // Mail går KUN til off-app-deltakere (shouldAlsoSendMail === true). Aktive
  // deltakere ble nettopp varslet in-app og trenger ingen mail.
  try {
    const mailRecipients = recipients.filter(
      (r) => sendMailByUserId.get(r.user_id) === true,
    );
    // Pulje-kjørt (#1544), samme grunn som i starten av cupen.
    const results = await allSettledInBatches(mailRecipients, (r) =>
      // #1499: mailen teaser bare — vinner/stilling sendes ikke med;
      // fasiten avsløres først på resultatsiden.
      sendCupFinishedNotification({
        to: r.email,
        playerFirstName: r.name?.split(' ')[0] ?? null,
        tournamentName: finalTournament.name,
        tournamentId: id,
        locale: r.locale,
      }),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[cup] cupFinishedNotification failed', r.reason);
      }
    }
  } catch (e) {
    console.error('[cup] finishTournament mail-fan-out failed', e);
  }

  return { ok: true, alreadyFinished: false };
}
