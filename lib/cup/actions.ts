'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { expectAffected } from '@/lib/supabase/affectedRows';
import {
  getRoleContext,
  requireAdminOrClubAdmin,
  requireAdminOrClubAdminOfCup,
} from '@/lib/admin/auth';
import { getCupSnapshot } from './getCupSnapshot';
import { ALLOWANCE_DEFAULTS, parseAllowancePct } from './allowance';
import { sendCupStartedNotification } from '@/lib/mail/cupStartedNotification';
import { sendCupFinishedNotification } from '@/lib/mail/cupFinishedNotification';
import {
  notifyParticipantsCupFinished,
  notifyParticipantsCupStarted,
} from '@/lib/notifications/events';

// Form-felt-keyene matcher hidden inputs i cup-create-formet + admin-detalj-
// formene. Holdt eksplisitt for å gjøre call-sites lesbare.

const NAME_RE = /^.{1,80}$/;
const TEAM_NAME_RE = /^.{1,40}$/;

// Poengmålet for en cup: halvparten av de tilgjengelige poengene + 0,5, dvs.
// det laveste antallet motstanderen ikke kan møte. Utledes ved start (#1142)
// fordi match-antallet ikke finnes før matchene er generert i /generer.
// Lokal (ikke eksportert): 'use server' tillater kun async exports.
function derivePointsToWin(matchCount: number): number {
  return matchCount / 2 + 0.5;
}

// Allowance parsers are consolidated in ./allowance.ts (#809).
// Use parseAllowancePct(raw, ALLOWANCE_DEFAULTS.<format>) at call-sites.

async function loadTournamentParticipantEmails(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  tournamentId: string,
): Promise<Array<{ user_id: string; email: string; name: string | null; locale: string | null }>> {
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
    .select('user_id, users!game_players_user_id_fkey(email, name, locale)')
    .in('game_id', gameIds);

  const seen = new Set<string>();
  const out: Array<{ user_id: string; email: string; name: string | null; locale: string | null }> = [];
  // Supabase JS typer FK-joins som array selv på many-to-one. Normaliser med
  // unknown-cast og array-håndtering.
  const rows = (playerRows ?? []) as unknown as Array<{
    user_id: string;
    users: { email: string; name: string | null; locale: string | null } | { email: string; name: string | null; locale: string | null }[] | null;
  }>;
  for (const row of rows) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    const userRel = Array.isArray(row.users) ? row.users[0] : row.users;
    const email = userRel?.email;
    if (!email) continue;
    out.push({ user_id: row.user_id, email, name: userRel?.name ?? null, locale: userRel?.locale ?? null });
  }
  return out;
}

/**
 * Felles redirect/revalidate-mål for cup-styringshandlinger (#524). Klubb-cup
 * (group_id satt) holder seg i klubb-chrome; frittstående går til admin-cup.
 * Leses via request-scoped klient — kalleren er allerede gatet, så en klubb-cup
 * er synlig (medlem/admin via scoped-select RLS 0089).
 */
async function cupRedirectBase(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  id: string,
): Promise<{ path: string; groupId: string | null; revalidate: () => void }> {
  const { data } = await supabase
    .from('tournaments')
    .select('group_id')
    .eq('id', id)
    .maybeSingle();
  const groupId = (data?.group_id as string | null | undefined) ?? null;
  const path = groupId ? `/klubber/${groupId}/cup/${id}` : `/admin/cup/${id}`;
  return {
    path,
    groupId,
    revalidate: () => {
      revalidatePath(`/admin/cup/${id}`);
      if (groupId) revalidatePath(`/klubber/${groupId}/cup/${id}`);
    },
  };
}

export async function createTournamentDraft(formData: FormData) {
  // #524: group_id binder cupen til en klubb. Tom = frittstående (uendret
  // admin-flyt). Lest først så validerings-feil bouncer til riktig form.
  const rawGroupId = String(formData.get('group_id') ?? '').trim();
  const groupId = rawGroupId || null;
  // Klubb-sti: feil tilbake til klubb-opprett-formen. Frittstående: tilbake til
  // wizard-en med ?intent=cup (F2 #272 — /admin/cup/new er fjernet). Error-koder
  // prefiks-et med `cup_` for å unngå kollisjon med game-koder på samme route.
  const errBase = groupId
    ? `/klubber/${groupId}/cup/ny?error=`
    : '/admin/games/new?intent=cup&error=';

  const name = String(formData.get('name') ?? '').trim();
  const team1 = String(formData.get('team_1_name') ?? '').trim();
  const team2 = String(formData.get('team_2_name') ?? '').trim();
  const allowanceRaw = String(formData.get('fourball_allowance_pct') ?? '');
  const foursomesAllowanceRaw = String(
    formData.get('foursomes_allowance_pct') ?? '',
  );
  const greensomeAllowanceRaw = String(formData.get('greensome_allowance_pct') ?? '');
  const chapmanAllowanceRaw = String(formData.get('chapman_allowance_pct') ?? '');
  const gruesomeAllowanceRaw = String(formData.get('gruesome_allowance_pct') ?? '');

  if (!NAME_RE.test(name)) redirect(`${errBase}cup_name`);
  if (!TEAM_NAME_RE.test(team1)) redirect(`${errBase}cup_team_1`);
  if (!TEAM_NAME_RE.test(team2)) redirect(`${errBase}cup_team_2`);
  if (team1.toLowerCase() === team2.toLowerCase())
    redirect(`${errBase}cup_team_dup`);
  const fourballAllowance = parseAllowancePct(allowanceRaw, ALLOWANCE_DEFAULTS.fourball);
  if (fourballAllowance === null) redirect(`${errBase}cup_allowance`);
  const foursomesAllowance = parseAllowancePct(foursomesAllowanceRaw, ALLOWANCE_DEFAULTS.foursomes);
  if (foursomesAllowance === null) redirect(`${errBase}cup_foursomes_allowance`);
  const greensomeAllowance = parseAllowancePct(greensomeAllowanceRaw, ALLOWANCE_DEFAULTS.greensome);
  if (greensomeAllowance === null) redirect(`${errBase}cup_greensome_allowance`);
  const chapmanAllowance = parseAllowancePct(chapmanAllowanceRaw, ALLOWANCE_DEFAULTS.chapman);
  if (chapmanAllowance === null) redirect(`${errBase}cup_chapman_allowance`);
  const gruesomeAllowance = parseAllowancePct(gruesomeAllowanceRaw, ALLOWANCE_DEFAULTS.gruesome);
  if (gruesomeAllowance === null) redirect(`${errBase}cup_gruesome_allowance`);

  const supabase = await getServerClient();
  // Klubb-cup: klubb-eier/-admin (eller global admin) oppretter. Personlig
  // (frittstående) cup: enhver innlogget bruker oppretter sin egen (#526);
  // created_by settes til brukeren og caps håndheves når matcher genereres.
  // RLS er backstop på begge (0089 admin/klubb-admin, 0090 skaper).
  const { userId } = groupId
    ? await requireAdminOrClubAdmin(supabase, groupId)
    : await getRoleContext(supabase);

  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      team_1_name: team1,
      team_2_name: team2,
      // points_to_win utelates med vilje: en draft vet ikke hvor mange matcher
      // den får ennå. startTournament utleder målet fra det reelle antallet.
      fourball_allowance_pct: fourballAllowance as number,
      foursomes_allowance_pct: foursomesAllowance as number,
      greensome_allowance_pct: greensomeAllowance as number,
      chapman_allowance_pct: chapmanAllowance as number,
      gruesome_allowance_pct: gruesomeAllowance as number,
      created_by: userId,
      group_id: groupId,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[cup] createTournamentDraft failed', { error });
    redirect(`${errBase}cup_insert_failed`);
  }

  // Klubb-sti: fortsett i klubb-chrome (generer kamper der). Frittstående:
  // admin-cup-detalj som før.
  redirect(
    groupId
      ? `/klubber/${groupId}/cup/${data.id}`
      : `/admin/cup/${data.id}?status=created`,
  );
}

export async function startTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);
  const base = await cupRedirectBase(supabase, id);

  // Krev minst 2 matches før start (per kontrakt-success-kriterium).
  const { count } = await supabase
    .from('games')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', id);
  if ((count ?? 0) < 2) {
    redirect(`${base.path}?error=too_few_matches`);
  }

  // #1142: dette er første punktet der det ekte match-antallet finnes — matcher
  // genereres i /generer mens status='draft', og start er siste gate før cupen
  // blir aktiv. Draft-raden bar NULL fram til nå.
  const pointsToWin = derivePointsToWin(count ?? 0);

  const { data: current } = await supabase
    .from('tournaments')
    .select('id, name, status, team_1_name, team_2_name')
    .eq('id', id)
    .maybeSingle();
  if (!current) redirect(`/admin/cup?error=not_found`);
  if (current.status !== 'draft') {
    redirect(`${base.path}?error=wrong_status`);
  }

  // #727: assert the status flip touched a row (bug-prevention #2).
  try {
    expectAffected(
      await supabase
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
    redirect(`${base.path}?error=start_failed`);
  }

  // Best-effort start-varsel: in-app til ALLE deltakere først, mail kun til
  // off-app-deltakere (#417). Symmetrisk søster av cup-avslutningen (#377) —
  // samme in-app-først-prinsipp som enkeltspill, ingen blanket-mail til alle.
  //
  // loadTournamentParticipantEmails dropper deltakere uten e-post, men
  // Tørny-auth er e-post-OTP, så alle brukere HAR e-post — denne lista er
  // dermed hele deltaker-settet, og in-app fyrer for alle reelle deltakere.
  const recipients = await loadTournamentParticipantEmails(supabase, id);
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
    const results = await Promise.allSettled(
      mailRecipients.map((r) =>
        sendCupStartedNotification({
          to: r.email,
          playerFirstName: r.name?.split(' ')[0] ?? null,
          tournamentName: current.name,
          tournamentId: id,
          team1Name: current.team_1_name,
          team2Name: current.team_2_name,
          // Den nettopp utledede verdien — `current` ble lest før update-en og
          // bærer fortsatt NULL.
          pointsToWin,
          locale: r.locale,
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
  base.revalidate();
  revalidatePath(`/cup/${id}`);
  redirect(`${base.path}?status=started`);
}

export async function finishTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);
  const base = await cupRedirectBase(supabase, id);

  const snapshot = await getCupSnapshot(id);
  if (!snapshot) redirect('/admin/cup?error=not_found');
  if (snapshot.tournament.status === 'finished') {
    redirect(`${base.path}?error=already_finished`);
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

  // #727: assert the finish update touched a row (bug-prevention #2).
  try {
    expectAffected(
      await supabase
        .from('tournaments')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
          winner_team: winnerTeam,
        })
        .eq('id', id)
        .select('id'),
      'finishTournament',
    );
  } catch (err) {
    console.error('[cup] finishTournament failed', { id, err });
    redirect(`${base.path}?error=finish_failed`);
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
          locale: r.locale,
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
  base.revalidate();
  revalidatePath(`/cup/${id}`);
  redirect(`${base.path}?status=finished`);
}

export async function deleteTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);

  const { data: cup } = await supabase
    .from('tournaments')
    .select('id, name, group_id')
    .eq('id', id)
    .maybeSingle();
  if (!cup) redirect('/admin/cup?error=not_found');
  const groupId = (cup.group_id as string | null | undefined) ?? null;

  // FK på games.tournament_id er ON DELETE SET NULL — historiske matches
  // blir frittstående spill, ikke slettet.
  const { error } = await supabase.from('tournaments').delete().eq('id', id);
  if (error) {
    console.error('[cup] deleteTournament failed', { id, error });
    redirect(
      groupId
        ? `/klubber/${groupId}/cup/${id}/slett?error=delete_failed`
        : `/admin/cup/${id}/slett?error=delete_failed`,
    );
  }

  revalidateTag(`tournament-${id}`, 'max');
  // Klubb-cup: tilbake til klubb-siden (Klubbens cuper). Frittstående: admin-lista.
  if (groupId) {
    revalidatePath(`/klubber/${groupId}`);
    redirect(`/klubber/${groupId}?status=cup_deleted&name=${encodeURIComponent(cup.name)}`);
  }
  const qs = new URLSearchParams({ status: 'deleted', name: cup.name });
  redirect(`/admin/cup?${qs.toString()}`);
}
