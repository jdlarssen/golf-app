'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getCupSnapshot } from './getCupSnapshot';
import { sendCupStartedNotification } from '@/lib/mail/cupStartedNotification';
import { sendCupFinishedNotification } from '@/lib/mail/cupFinishedNotification';
import { notifyParticipantsCupFinished } from '@/lib/notifications/events';

// Form-felt-keyene matcher hidden inputs i cup-create-formet + admin-detalj-
// formene. Holdt eksplisitt for å gjøre call-sites lesbare.

const NAME_RE = /^.{1,80}$/;
const TEAM_NAME_RE = /^.{1,40}$/;

function parsePointsToWin(raw: string): number | null {
  // Norske form-er kan komme med komma. Aksepter både.
  const cleaned = raw.replace(',', '.').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Parser fourball_allowance_pct fra cup-create/edit-form (#217).
 *
 * Range 0..100 (heltall). 0 = brutto, 1..100 = netto med den prosenten. Tom
 * string defaulter til 85 (WHS-default) — UI-toggle skal alltid sende eksplisitt
 * verdi (0 ved brutto-modus, eller pct fra netto-input), så tom string betyr
 * at form ble submittet med stale state og default er det trygge valget.
 */
function parseFourballAllowancePct(raw: string): number | null {
  const cleaned = raw.trim();
  if (cleaned === '') return 85;
  const n = Number(cleaned);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Parser foursomes_allowance_pct fra cup-create/edit-form (#218).
 *
 * Speiler fourball-helperen strukturelt — eneste forskjell er default 50
 * (WHS-standard for foursomes matchplay; diff-basert formel der lavlaget
 * får 0 strokes og høylaget får round(|combined_diff| × pct/100) via SI).
 */
function parseFoursomesAllowancePct(raw: string): number | null {
  const cleaned = raw.trim();
  if (cleaned === '') return 50;
  const n = Number(cleaned);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

async function loadTournamentParticipantEmails(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  tournamentId: string,
): Promise<Array<{ user_id: string; email: string; name: string | null }>> {
  // Hent alle distinct user_ids via game_players-joine på games med
  // tournament_id = id, deretter email via users-tabellen.
  const { data: gameRows } = await supabase
    .from('games')
    .select('id')
    .eq('tournament_id', tournamentId);
  const gameIds = (gameRows ?? []).map((g) => g.id);
  if (gameIds.length === 0) return [];

  const { data: playerRows } = await supabase
    .from('game_players')
    .select('user_id, users!game_players_user_id_fkey(email, name)')
    .in('game_id', gameIds);

  const seen = new Set<string>();
  const out: Array<{ user_id: string; email: string; name: string | null }> = [];
  // Supabase JS typer FK-joins som array selv på many-to-one. Normaliser med
  // unknown-cast og array-håndtering.
  const rows = (playerRows ?? []) as unknown as Array<{
    user_id: string;
    users: { email: string; name: string | null } | { email: string; name: string | null }[] | null;
  }>;
  for (const row of rows) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    const userRel = Array.isArray(row.users) ? row.users[0] : row.users;
    const email = userRel?.email;
    if (!email) continue;
    out.push({ user_id: row.user_id, email, name: userRel?.name ?? null });
  }
  return out;
}

export async function createTournamentDraft(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const team1 = String(formData.get('team_1_name') ?? '').trim();
  const team2 = String(formData.get('team_2_name') ?? '').trim();
  const pointsRaw = String(formData.get('points_to_win') ?? '');
  const allowanceRaw = String(formData.get('fourball_allowance_pct') ?? '');
  const foursomesAllowanceRaw = String(
    formData.get('foursomes_allowance_pct') ?? '',
  );

  // F2 (#272): valideringsfeil bouncer tilbake til wizard-en med
  // ?intent=cup så CupSetup re-rendres. /admin/cup/new er fjernet.
  // Error-koder prefiks-et med `cup_` for å unngå kollisjon med
  // game-validerings-koder som flyter gjennom samme route.
  if (!NAME_RE.test(name)) redirect('/admin/games/new?intent=cup&error=cup_name');
  if (!TEAM_NAME_RE.test(team1)) redirect('/admin/games/new?intent=cup&error=cup_team_1');
  if (!TEAM_NAME_RE.test(team2)) redirect('/admin/games/new?intent=cup&error=cup_team_2');
  if (team1.toLowerCase() === team2.toLowerCase())
    redirect('/admin/games/new?intent=cup&error=cup_team_dup');
  const points = parsePointsToWin(pointsRaw);
  if (points === null) redirect('/admin/games/new?intent=cup&error=cup_points');
  const fourballAllowance = parseFourballAllowancePct(allowanceRaw);
  if (fourballAllowance === null) redirect('/admin/games/new?intent=cup&error=cup_allowance');
  const foursomesAllowance = parseFoursomesAllowancePct(foursomesAllowanceRaw);
  if (foursomesAllowance === null)
    redirect('/admin/games/new?intent=cup&error=cup_foursomes_allowance');

  const supabase = await getServerClient();
  const admin = await requireAdmin(supabase);

  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      team_1_name: team1,
      team_2_name: team2,
      points_to_win: points as number,
      fourball_allowance_pct: fourballAllowance as number,
      foursomes_allowance_pct: foursomesAllowance as number,
      created_by: admin.userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[cup] createTournamentDraft failed', { error });
    redirect('/admin/games/new?intent=cup&error=cup_insert_failed');
  }

  redirect(`/admin/cup/${data.id}?status=created`);
}

export async function updateTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const name = String(formData.get('name') ?? '').trim();
  const team1 = String(formData.get('team_1_name') ?? '').trim();
  const team2 = String(formData.get('team_2_name') ?? '').trim();
  const pointsRaw = String(formData.get('points_to_win') ?? '');
  const allowanceRaw = String(formData.get('fourball_allowance_pct') ?? '');
  const foursomesAllowanceRaw = String(
    formData.get('foursomes_allowance_pct') ?? '',
  );

  if (!NAME_RE.test(name)) redirect(`/admin/cup/${id}?error=name`);
  if (!TEAM_NAME_RE.test(team1)) redirect(`/admin/cup/${id}?error=team_1`);
  if (!TEAM_NAME_RE.test(team2)) redirect(`/admin/cup/${id}?error=team_2`);
  if (team1.toLowerCase() === team2.toLowerCase())
    redirect(`/admin/cup/${id}?error=team_dup`);
  const points = parsePointsToWin(pointsRaw);
  if (points === null) redirect(`/admin/cup/${id}?error=points`);
  const fourballAllowance = parseFourballAllowancePct(allowanceRaw);
  if (fourballAllowance === null) redirect(`/admin/cup/${id}?error=allowance`);
  const foursomesAllowance = parseFoursomesAllowancePct(foursomesAllowanceRaw);
  if (foursomesAllowance === null)
    redirect(`/admin/cup/${id}?error=foursomes_allowance`);

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { error } = await supabase
    .from('tournaments')
    .update({
      name,
      team_1_name: team1,
      team_2_name: team2,
      points_to_win: points as number,
      fourball_allowance_pct: fourballAllowance as number,
      foursomes_allowance_pct: foursomesAllowance as number,
    })
    .eq('id', id);

  if (error) {
    console.error('[cup] updateTournament failed', { id, error });
    redirect(`/admin/cup/${id}?error=update_failed`);
  }

  revalidateTag(`tournament-${id}`, 'max');
  revalidatePath(`/admin/cup/${id}`);
  revalidatePath(`/cup/${id}`);
  redirect(`/admin/cup/${id}?status=updated`);
}

export async function startTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  // Krev minst 2 matches før start (per kontrakt-success-kriterium).
  const { count } = await supabase
    .from('games')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', id);
  if ((count ?? 0) < 2) {
    redirect(`/admin/cup/${id}?error=too_few_matches`);
  }

  const { data: current } = await supabase
    .from('tournaments')
    .select('id, name, status, team_1_name, team_2_name, points_to_win')
    .eq('id', id)
    .maybeSingle();
  if (!current) redirect(`/admin/cup?error=not_found`);
  if (current.status !== 'draft') {
    redirect(`/admin/cup/${id}?error=wrong_status`);
  }

  const { error } = await supabase
    .from('tournaments')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('[cup] startTournament failed', { id, error });
    redirect(`/admin/cup/${id}?error=start_failed`);
  }

  // Best-effort mail-notifikasjon til alle deltakere.
  try {
    const recipients = await loadTournamentParticipantEmails(supabase, id);
    const results = await Promise.allSettled(
      recipients.map((r) =>
        sendCupStartedNotification({
          to: r.email,
          playerFirstName: r.name?.split(' ')[0] ?? null,
          tournamentName: current.name,
          tournamentId: id,
          team1Name: current.team_1_name,
          team2Name: current.team_2_name,
          pointsToWin: current.points_to_win,
        }),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[cup] cupStartedNotification failed', r.reason);
      }
    }
  } catch (e) {
    console.error('[cup] startTournament mail-fan-out failed', e);
  }

  revalidateTag(`tournament-${id}`, 'max');
  revalidatePath(`/admin/cup/${id}`);
  revalidatePath(`/cup/${id}`);
  redirect(`/admin/cup/${id}?status=started`);
}

export async function finishTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const snapshot = await getCupSnapshot(id);
  if (!snapshot) redirect('/admin/cup?error=not_found');
  if (snapshot.tournament.status === 'finished') {
    redirect(`/admin/cup/${id}?error=already_finished`);
  }

  // Vinner bestemmes av point-status ved avslutning. Hvis ingen lag har nådd
  // point-mål → vinner-team forblir NULL (uavgjort cup avsluttes med
  // 'finished'-status uten vinner-deklarering).
  let winnerTeam: 1 | 2 | null = null;
  if (snapshot.leaderboard.team1Points > snapshot.leaderboard.team2Points) {
    winnerTeam = 1;
  } else if (snapshot.leaderboard.team2Points > snapshot.leaderboard.team1Points) {
    winnerTeam = 2;
  }

  const { error } = await supabase
    .from('tournaments')
    .update({
      status: 'finished',
      finished_at: new Date().toISOString(),
      winner_team: winnerTeam,
    })
    .eq('id', id);
  if (error) {
    console.error('[cup] finishTournament failed', { id, error });
    redirect(`/admin/cup/${id}?error=finish_failed`);
  }

  // Best-effort avslutnings-varsel: in-app til ALLE deltakere først, mail kun
  // til off-app-deltakere (#377). Samme in-app-først-prinsipp som enkeltspill-
  // avslutningen — ingen egen blanket-mail til alle.
  //
  // loadTournamentParticipantEmails dropper deltakere uten e-post, men
  // Tørny-auth er e-post-OTP, så alle brukere HAR e-post — denne lista er
  // dermed hele deltaker-settet, og in-app fyrer for alle reelle deltakere.
  const recipients = await loadTournamentParticipantEmails(supabase, id);
  const sendMailByUserId = await notifyParticipantsCupFinished(
    recipients,
    { id, name: snapshot.tournament.name },
    'finishTournament',
  );

  // Mail går KUN til off-app-deltakere (shouldAlsoSendMail === true). Aktive
  // deltakere ble nettopp varslet in-app og trenger ingen mail.
  try {
    const winnerName =
      winnerTeam === 1
        ? snapshot.tournament.team_1_name
        : winnerTeam === 2
          ? snapshot.tournament.team_2_name
          : null;
    const mailRecipients = recipients.filter(
      (r) => sendMailByUserId.get(r.user_id) === true,
    );
    const results = await Promise.allSettled(
      mailRecipients.map((r) =>
        sendCupFinishedNotification({
          to: r.email,
          playerFirstName: r.name?.split(' ')[0] ?? null,
          tournamentName: snapshot.tournament.name,
          tournamentId: id,
          team1Name: snapshot.tournament.team_1_name,
          team2Name: snapshot.tournament.team_2_name,
          team1Points: snapshot.leaderboard.team1Points,
          team2Points: snapshot.leaderboard.team2Points,
          winnerTeamName: winnerName,
        }),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[cup] cupFinishedNotification failed', r.reason);
      }
    }
  } catch (e) {
    console.error('[cup] finishTournament mail-fan-out failed', e);
  }

  revalidateTag(`tournament-${id}`, 'max');
  revalidatePath(`/admin/cup/${id}`);
  revalidatePath(`/cup/${id}`);
  redirect(`/admin/cup/${id}?status=finished`);
}

export async function deleteTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { data: cup } = await supabase
    .from('tournaments')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!cup) redirect('/admin/cup?error=not_found');

  // FK på games.tournament_id er ON DELETE SET NULL — historiske matches
  // blir frittstående spill, ikke slettet.
  const { error } = await supabase.from('tournaments').delete().eq('id', id);
  if (error) {
    console.error('[cup] deleteTournament failed', { id, error });
    redirect(`/admin/cup/${id}/slett?error=delete_failed`);
  }

  revalidateTag(`tournament-${id}`, 'max');
  const qs = new URLSearchParams({ status: 'deleted', name: cup.name });
  redirect(`/admin/cup?${qs.toString()}`);
}
