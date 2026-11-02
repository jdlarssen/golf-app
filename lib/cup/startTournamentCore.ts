import type { SupabaseClient } from '@supabase/supabase-js';
import { allSettledInBatches } from '@/lib/async/allSettledInBatches';
import type { Database } from '@/lib/database.types';
import { expireTournamentCache } from '@/lib/games/expireGameCache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { sendCupStartedNotification } from '@/lib/mail/cupStartedNotification';
import { notifyParticipantsCupStarted } from '@/lib/notifications/events';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  DEFAULT_TIE_POINTS,
  DEFAULT_WIN_POINTS,
  derivePointsToWinWeighted,
  resolveCupMatchTotal,
} from './pointsToWin';
import { loadTournamentParticipantEmails } from './tournamentParticipants';

export type StartTournamentResult =
  | { ok: true }
  | { ok: false; error: 'too_few_matches' | 'not_found' | 'wrong_status' | 'start_failed' };

/**
 * Starter en cup etter kallerens egen gate (#2752): nettets `startTournament` og
 * appens rute `POST /api/cup/{id}/start` deler den. `caller` er arrangørens klient.
 */
export async function startTournamentCore(
  caller: SupabaseClient<Database>,
  id: string,
): Promise<StartTournamentResult> {
  // Krev minst 2 matches før start (per kontrakt-success-kriterium).
  // #2214: tellingen går på admin-klienten. Kampene eies av den som genererte
  // dem, og games-RLS lar bare oppretteren (eller en global admin) se dem: en
  // annen klubbadmin så 0 og fikk too_few_matches. Gaten over har kjørt
  // (samme grunn som finishTournament og slettingen).
  const { count } = await getAdminClient()
    .from('games')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', id);
  if ((count ?? 0) < 2) return { ok: false, error: 'too_few_matches' };

  const { data: current } = await caller
    .from('tournaments')
    .select(
      'id, name, status, team_1_name, team_2_name, win_points, tie_points, planned_match_count',
    )
    .eq('id', id)
    .maybeSingle();
  if (!current) return { ok: false, error: 'not_found' };
  if (current.status !== 'draft') return { ok: false, error: 'wrong_status' };

  // #1142: dette er første punktet der det ekte match-antallet finnes — matcher
  // genereres i /generer mens status='draft', og start er siste gate før cupen
  // blir aktiv. Draft-raden bar NULL fram til nå.
  //
  // #1441 (D8): vektbar variant — når cupens win_points/tie_points avviker
  // fra default 1/0,5, settes points_to_win til NULL i stedet («først til
  // X»-UI-en skjules; vinneren avgjøres ved finishTournament, som allerede
  // takler NULL, #1142). Med default-vektene er dette bit for bit
  // `derivePointsToWin(count)` som før.
  // #1902: målet regnes av PLANLAGT antall kamper når arrangøren har oppgitt
  // det, ikke av de kampene som tilfeldigvis finnes akkurat nå. Uttaks-økter
  // (#1884) legger til kamper etter start, og uten dette ville en Ryder Cup
  // som starter med 8 av 28 fått målet 4,5 — kronet etter dag 1. Planlagt er
  // et gulv: blir det flere kamper enn planlagt, vinner faktisk antall.
  // NULL planlagt → `count`, bit for bit som før.
  const pointsToWin = derivePointsToWinWeighted(
    resolveCupMatchTotal(
      count ?? 0,
      (current.planned_match_count as number | null) ?? null,
    ),
    (current.win_points as number | null) ?? DEFAULT_WIN_POINTS,
    (current.tie_points as number | null) ?? DEFAULT_TIE_POINTS,
  );

  // #727: assert the status flip touched a row (bug-prevention #2).
  try {
    expectAffected(
      await caller
        .from('tournaments')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
          points_to_win: pointsToWin,
        })
        .eq('id', id)
        .select('id'),
      'startTournament',
    );
  } catch (err) {
    console.error('[cup] startTournament failed', { id, err });
    return { ok: false, error: 'start_failed' };
  }

  // Best-effort start-varsel: in-app til ALLE deltakere først, mail kun til
  // off-app-deltakere (#417). Symmetrisk søster av cup-avslutningen (#377) —
  // samme in-app-først-prinsipp som enkeltspill, ingen blanket-mail til alle.
  //
  // Mottakerlista slås opp med admin-klienten inne i helperen (#1540) — med den
  // request-scopede klienten kollapset den til arrangørens egen flight når
  // arrangøren ikke var global admin. Deltakere uten e-post droppes, men
  // Tørny-auth er e-post-OTP, så alle brukere HAR e-post — lista er dermed hele
  // deltaker-settet, og in-app fyrer for alle reelle deltakere.
  const recipients = await loadTournamentParticipantEmails(id);
  const sendMailByUserId = await notifyParticipantsCupStarted(
    recipients,
    { id, name: current.name },
    'startTournament',
  );

  // Mail går KUN til off-app-deltakere (shouldAlsoSendMail === true). Aktive
  // deltakere ble nettopp varslet in-app og trenger ingen mail.
  try {
    const mailRecipients = recipients.filter(
      (r) => sendMailByUserId.get(r.user_id) === true,
    );
    // Pulje-kjørt (#1544): en klubb-cup kan ha ~150 off-app-mottakere, og
    // Resend-kallene skal ikke fyre i én burst midt i en Vercel-request.
    const results = await allSettledInBatches(mailRecipients, (r) =>
      sendCupStartedNotification({
        to: r.email,
        playerFirstName: r.name?.split(' ')[0] ?? null,
        tournamentName: current.name,
        tournamentId: id,
        team1Name: current.team_1_name,
        team2Name: current.team_2_name,
        // Den nettopp utledede verdien — `current` ble lest før update-en
        // og bærer fortsatt NULL. NULL = vektet cup (#1441 D8); malen
        // brancher selv til weighted-copyen (#1444).
        pointsToWin,
        locale: r.locale,
      }),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[cup] cupStartedNotification failed', r.reason);
      }
    }
  } catch (e) {
    console.error('[cup] startTournament mail-fan-out failed', e);
  }

  return { ok: true };
}

/** Cup-sidene etter en start fra appen. Nettets handling revaliderer de samme. */
export function revalidateCupStarted(id: string, groupId: string | null): void {
  expireTournamentCache(id);
  revalidatePath(`/admin/cup/${id}`);
  revalidatePath(`/admin/cup/${id}/spillere`);
  if (groupId) {
    revalidatePath(`/klubber/${groupId}/cup/${id}`);
    revalidatePath(`/klubber/${groupId}/cup/${id}/spillere`);
  }
  revalidatePath(`/cup/${id}`);
}
