'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';
import { notify } from '@/lib/notifications/notify';
import { sendRegistrationApprovedMail } from '@/lib/mail/registrationApproved';
import { sendRegistrationRejectedMail } from '@/lib/mail/registrationRejected';

/**
 * Approve/reject server-actions for game-registration-requests (issue #199).
 *
 * Authz: `requireAdminOrTrustedCreator` is the primary gate — trusted creators
 * may approve påmeldinger on spill de selv har laget. Defense-in-depth:
 * the SQL helper `is_game_creator_or_admin` (migrasjon 0041) gates the
 * UPDATE via RLS uansett, men siden vi bruker admin-client her for å unngå
 * RLS-rekursjon, sjekker vi `games.created_by` manuelt for ikke-admin-trusted
 * creators før vi muterer.
 *
 * Cascade for team-requests: når kapteinens rad approve-es/reject-es,
 * cascade-er vi automatisk alle medspiller-rader (`team_request_id` =
 * captain.id) i samme status. Lag-formasjon-UI (chunk 8) sørger for at
 * raden-strukturen er konsistent — admin behøver ikke håndtere lag-medlemmer
 * manuelt.
 */

const REJECTION_REASON_MAX = 200;

type GameSnapshot = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  created_by: string | null;
};

type RequestSnapshot = {
  id: string;
  game_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  is_team_captain: boolean;
  team_name: string | null;
  team_request_id: string | null;
};

type CascadeRow = { id: string; user_id: string };

/**
 * Load request + verify auth + verify game is in a state where approval
 * makes sense. Redirects on any failure with appropriate ?error= code.
 * Returns the loaded request and game snapshots for the caller.
 */
async function loadDecisionContext(requestId: string): Promise<{
  request: RequestSnapshot;
  game: GameSnapshot;
  actorId: string;
  actorName: string;
}> {
  const supabase = await getServerClient();
  const role = await requireAdminOrTrustedCreator(supabase);

  // Admin-client bypass — RLS-policy `admin updates request` gater på
  // `is_game_creator_or_admin(game_id)` som krever auth-context på samme
  // forbindelse. Vi har allerede auth-gated via requireAdminOrTrustedCreator
  // i action-koden over; admin-client gjør at vi unngår å bygge to parallelle
  // klient-forbindelser for selve mutasjonen.
  const admin = getAdminClient();

  const { data: request, error: requestError } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, status, is_team_captain, team_name, team_request_id')
    .eq('id', requestId)
    .single<RequestSnapshot>();

  if (requestError || !request) {
    redirect(`/admin/games?error=request_not_found`);
  }

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, name, status, created_by')
    .eq('id', request!.game_id)
    .single<GameSnapshot>();

  if (gameError || !game) {
    redirect(`/admin/games?error=game_not_found`);
  }

  // Defense-in-depth for trusted creators: kun spill-creator (eller admin)
  // kan godkjenne påmeldinger til et spesifikt spill.
  if (!role.isAdmin && game!.created_by !== role.userId) {
    redirect(`/admin/games/${game!.id}?error=not_authorized`);
  }

  // Approve/reject gir bare mening pre-active. Etter at runden er startet
  // er rosteret låst.
  if (game!.status === 'active' || game!.status === 'finished') {
    redirect(`/admin/games/${game!.id}/signups?error=game_locked`);
  }

  return {
    request: request!,
    game: game!,
    actorId: role.userId,
    actorName: role.name?.trim() || 'Admin',
  };
}

/**
 * Approve a pending registration request. Cascades to team-children if the
 * approved row is a team captain. Inserts game_players rows for the approved
 * user(s) and fires registration_approved notifications.
 */
export async function approveRequest(requestId: string): Promise<void> {
  const { request, game, actorId } = await loadDecisionContext(requestId);
  const detailPath = `/admin/games/${game.id}/signups`;

  if (request.status !== 'pending') {
    redirect(`${detailPath}?error=not_pending`);
  }

  const admin = getAdminClient();

  // Samle alle request-rader vi vil approve. For kaptein: kaptein + alle
  // team-children. For solo eller team-medlem (sjelden — admin approve-er
  // typisk hele lag samtidig via kapteinens rad): bare den ene raden.
  let cascadeRows: CascadeRow[] = [];
  if (request.is_team_captain) {
    const { data: children, error: childrenError } = await admin
      .from('game_registration_requests')
      .select('id, user_id')
      .eq('team_request_id', request.id)
      .eq('status', 'pending')
      .returns<CascadeRow[]>();
    if (childrenError) {
      console.error('[approveRequest] team children fetch failed', childrenError);
      redirect(`${detailPath}?error=db_cascade`);
    }
    cascadeRows = children ?? [];
  }

  const allRows: CascadeRow[] = [
    { id: request.id, user_id: request.user_id },
    ...cascadeRows,
  ];

  // Bestem team_number for lag-påmelding: laveste ledige slot (1..). For solo
  // setter vi null på både team_number og flight_number (matcher CHECK i 0030).
  let teamNumber: number | null = null;
  if (request.is_team_captain) {
    const { data: existing, error: existingErr } = await admin
      .from('game_players')
      .select('team_number')
      .eq('game_id', game.id)
      .not('team_number', 'is', null)
      .returns<{ team_number: number }[]>();
    if (existingErr) {
      console.error('[approveRequest] team-slot lookup failed', existingErr);
      redirect(`${detailPath}?error=db_team_slot`);
    }
    const taken = new Set((existing ?? []).map((r) => r.team_number));
    for (let slot = 1; slot <= 4; slot += 1) {
      if (!taken.has(slot)) {
        teamNumber = slot;
        break;
      }
    }
    if (teamNumber == null) {
      redirect(`${detailPath}?error=no_team_slot`);
    }
  }

  const decidedAt = new Date().toISOString();

  // UPDATE status først — hvis denne feiler, ikke insert i game_players.
  const idsToUpdate = allRows.map((r) => r.id);
  const { error: updateError } = await admin
    .from('game_registration_requests')
    .update({
      status: 'approved',
      decided_at: decidedAt,
      decided_by_user_id: actorId,
    })
    .in('id', idsToUpdate)
    .eq('status', 'pending');
  if (updateError) {
    console.error('[approveRequest] status update failed', updateError);
    redirect(`${detailPath}?error=db_update`);
  }

  // INSERT game_players-rader. Bruker upsert med ignore-duplicates for å
  // tåle re-trigger (race mellom to admin-tabs).
  const playerRows = allRows.map((r) => ({
    game_id: game.id,
    user_id: r.user_id,
    team_number: teamNumber,
    // Per kontrakt §5.6: flight_number speiler team_number ved auto-tildeling.
    // For solo (teamNumber=null) blir også flight null — CHECK 0030 krever
    // at de er begge null eller begge satt.
    flight_number: teamNumber,
    course_handicap: null,
  }));
  const { error: insertError } = await admin
    .from('game_players')
    .upsert(playerRows, { onConflict: 'game_id,user_id', ignoreDuplicates: true });
  if (insertError) {
    console.error('[approveRequest] game_players insert failed', insertError);
    redirect(`${detailPath}?error=db_players`);
  }

  // Best-effort notifications + mail. Notify-feil swallow-es slik at
  // approval-flyten ikke ruller tilbake — admin har allerede bestemt seg.
  // Vi venter på alle notify()-callene i parallell og bruker
  // shouldAlsoSendMail-flagget per recipient for å gate mail-utsendelse.
  const notifyResults = await Promise.allSettled(
    allRows.map((r) =>
      notify({
        userId: r.user_id,
        kind: 'registration_approved',
        payload: { game_id: game.id, game_name: game.name },
      }),
    ),
  );

  // Mail-backup for off-app-mottakere. Hent e-poster for alle godkjente
  // brukere i én batch så vi unngår N round-trips.
  const userIdsForMail: string[] = [];
  notifyResults.forEach((res, idx) => {
    if (res.status === 'fulfilled' && res.value.shouldAlsoSendMail) {
      const row = allRows[idx];
      if (row) userIdsForMail.push(row.user_id);
    } else if (res.status === 'rejected') {
      console.error('[approveRequest] notify failed', res.reason);
    }
  });

  if (userIdsForMail.length > 0) {
    const { data: emailRows } = await admin
      .from('users')
      .select('id, email')
      .in('id', userIdsForMail)
      .returns<{ id: string; email: string }[]>();
    await Promise.allSettled(
      (emailRows ?? []).map((u) =>
        sendRegistrationApprovedMail({
          to: u.email,
          gameName: game.name,
          gameId: game.id,
        }).catch((err) =>
          console.error('[approveRequest] mail failed', err),
        ),
      ),
    );
  }

  revalidateTag(`game-${game.id}`, 'max');
  redirect(`${detailPath}?status=approved`);
}

/**
 * Reject a pending registration request with an optional reason. Cascades
 * to team-children if the rejected row is a team captain.
 */
export async function rejectRequest(
  requestId: string,
  formData: FormData,
): Promise<void> {
  const { request, game, actorId } = await loadDecisionContext(requestId);
  const detailPath = `/admin/games/${game.id}/signups`;

  // Honeypot — felt skjult fra ekte admins, populated kun av bots.
  // Silent-reject med suksess-redirect så bot ikke kan probe forskjell.
  const honeypot = String(formData.get('website') ?? '').trim();
  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'rejectRequest' });
    redirect(`${detailPath}?status=rejected`);
  }

  if (request.status !== 'pending') {
    redirect(`${detailPath}?error=not_pending`);
  }

  const rawReason = String(formData.get('reason') ?? '').trim();
  if (rawReason.length > REJECTION_REASON_MAX) {
    redirect(`${detailPath}?error=reason_too_long`);
  }
  const reason = rawReason.length > 0 ? rawReason : null;

  const admin = getAdminClient();

  let cascadeRows: CascadeRow[] = [];
  if (request.is_team_captain) {
    const { data: children, error: childrenError } = await admin
      .from('game_registration_requests')
      .select('id, user_id')
      .eq('team_request_id', request.id)
      .eq('status', 'pending')
      .returns<CascadeRow[]>();
    if (childrenError) {
      console.error('[rejectRequest] team children fetch failed', childrenError);
      redirect(`${detailPath}?error=db_cascade`);
    }
    cascadeRows = children ?? [];
  }

  const allRows: CascadeRow[] = [
    { id: request.id, user_id: request.user_id },
    ...cascadeRows,
  ];

  const decidedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from('game_registration_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      decided_at: decidedAt,
      decided_by_user_id: actorId,
    })
    .in('id', allRows.map((r) => r.id))
    .eq('status', 'pending');

  if (updateError) {
    console.error('[rejectRequest] status update failed', updateError);
    redirect(`${detailPath}?error=db_update`);
  }

  const notifyResults = await Promise.allSettled(
    allRows.map((r) =>
      notify({
        userId: r.user_id,
        kind: 'registration_rejected',
        payload: {
          game_id: game.id,
          game_name: game.name,
          ...(reason ? { reason } : {}),
        },
      }),
    ),
  );

  const userIdsForMail: string[] = [];
  notifyResults.forEach((res, idx) => {
    if (res.status === 'fulfilled' && res.value.shouldAlsoSendMail) {
      const row = allRows[idx];
      if (row) userIdsForMail.push(row.user_id);
    } else if (res.status === 'rejected') {
      console.error('[rejectRequest] notify failed', res.reason);
    }
  });

  if (userIdsForMail.length > 0) {
    const { data: emailRows } = await admin
      .from('users')
      .select('id, email')
      .in('id', userIdsForMail)
      .returns<{ id: string; email: string }[]>();
    await Promise.allSettled(
      (emailRows ?? []).map((u) =>
        sendRegistrationRejectedMail({
          to: u.email,
          gameName: game.name,
          ...(reason ? { reason } : {}),
        }).catch((err) =>
          console.error('[rejectRequest] mail failed', err),
        ),
      ),
    );
  }

  revalidateTag(`game-${game.id}`, 'max');
  redirect(`${detailPath}?status=rejected`);
}
