'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { notify } from '@/lib/notifications/notify';
import { sendRegistrationApprovedMail } from '@/lib/mail/registrationApproved';
import { sendRegistrationRejectedMail } from '@/lib/mail/registrationRejected';

/**
 * Approve/reject server-actions for game-registration-requests (issue #199).
 *
 * Authz: `requireAdmin` — these flows are admin-only. We mutate via the
 * admin-client to avoid RLS-recursion on the `is_game_creator_or_admin`
 * UPDATE policy (migrasjon 0041), so the requireAdmin gate in the action
 * code above is the authz boundary.
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
  const locale = await getLocale();
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);

  // Admin-client bypass — RLS-policy `admin updates request` gater på
  // `is_game_creator_or_admin(game_id)` som krever auth-context på samme
  // forbindelse. Vi har allerede auth-gated via requireAdmin
  // i action-koden over; admin-client gjør at vi unngår å bygge to parallelle
  // klient-forbindelser for selve mutasjonen.
  const admin = getAdminClient();

  const { data: request, error: requestError } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, status, is_team_captain, team_name, team_request_id')
    .eq('id', requestId)
    .single<RequestSnapshot>();

  if (requestError || !request) {
    redirect({ href: `/admin/games?error=request_not_found`, locale });
  }

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, name, status, created_by')
    .eq('id', request!.game_id)
    .single<GameSnapshot>();

  if (gameError || !game) {
    redirect({ href: `/admin/games?error=game_not_found`, locale });
  }

  // Approve/reject gir bare mening pre-active. Etter at runden er startet
  // er rosteret låst.
  if (game!.status === 'active' || game!.status === 'finished') {
    redirect({ href: `/admin/games/${game!.id}/signups?error=game_locked`, locale });
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
  const locale = await getLocale();
  const { request, game, actorId } = await loadDecisionContext(requestId);
  const detailPath = `/admin/games/${game.id}/signups`;

  if (request.status !== 'pending') {
    redirect({ href: `${detailPath}?error=not_pending`, locale });
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
      redirect({ href: `${detailPath}?error=db_cascade`, locale });
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
      redirect({ href: `${detailPath}?error=db_team_slot`, locale });
    }
    const taken = new Set((existing ?? []).map((r) => r.team_number));
    // Match the public self-reg cap (teamActions.ts) and the widened
    // game_players_team_number_check (0101): clubs can run more than 4 teams.
    for (let slot = 1; slot <= 50; slot += 1) {
      if (!taken.has(slot)) {
        teamNumber = slot;
        break;
      }
    }
    if (teamNumber == null) {
      redirect({ href: `${detailPath}?error=no_team_slot`, locale });
    }
  }

  const decidedAt = new Date().toISOString();

  // UPDATE status først — hvis denne feiler, ikke insert i game_players.
  // #712: expectAffected catches both DB errors (throws Error) and silent
  // 0-row no-ops (throws NoRowsAffectedError). 0 rows means all requests
  // were already decided (race between two admin tabs) — redirect to error
  // rather than proceeding to insert game_players + fire notifications for
  // a write that never happened.
  const idsToUpdate = allRows.map((r) => r.id);
  try {
    expectAffected(
      await admin
        .from('game_registration_requests')
        .update({
          status: 'approved',
          decided_at: decidedAt,
          decided_by_user_id: actorId,
        })
        .in('id', idsToUpdate)
        .eq('status', 'pending')
        .select('id'),
      'approveRequest',
    );
  } catch (err) {
    console.error('[approveRequest] status update failed', err);
    redirect({ href: `${detailPath}?error=db_update`, locale });
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
    redirect({ href: `${detailPath}?error=db_players`, locale });
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
      .select('id, email, locale')
      .in('id', userIdsForMail)
      .returns<{ id: string; email: string; locale: string | null }[]>();
    await Promise.allSettled(
      (emailRows ?? []).map((u) =>
        sendRegistrationApprovedMail({
          to: u.email,
          gameName: game.name,
          gameId: game.id,
          locale: u.locale,
        }).catch((err) =>
          console.error('[approveRequest] mail failed', err),
        ),
      ),
    );
  }

  revalidateTag(`game-${game.id}`, 'max');
  redirect({ href: `${detailPath}?status=approved`, locale });
}

/**
 * Reject a pending registration request with an optional reason. Cascades
 * to team-children if the rejected row is a team captain.
 */
export async function rejectRequest(
  requestId: string,
  formData: FormData,
): Promise<void> {
  const locale = await getLocale();
  const { request, game, actorId } = await loadDecisionContext(requestId);
  const detailPath = `/admin/games/${game.id}/signups`;

  // Honeypot — felt skjult fra ekte admins, populated kun av bots.
  // Silent-reject med suksess-redirect så bot ikke kan probe forskjell.
  const honeypot = String(formData.get('website') ?? '').trim();
  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'rejectRequest' });
    redirect({ href: `${detailPath}?status=rejected`, locale });
  }

  if (request.status !== 'pending') {
    redirect({ href: `${detailPath}?error=not_pending`, locale });
  }

  const rawReason = String(formData.get('reason') ?? '').trim();
  if (rawReason.length > REJECTION_REASON_MAX) {
    redirect({ href: `${detailPath}?error=reason_too_long`, locale });
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
      redirect({ href: `${detailPath}?error=db_cascade`, locale });
    }
    cascadeRows = children ?? [];
  }

  const allRows: CascadeRow[] = [
    { id: request.id, user_id: request.user_id },
    ...cascadeRows,
  ];

  // #712: same 0-row trap as approveRequest. If all requests were already
  // rejected (race), 0 rows returns error==null — without this guard
  // notifications would fire for a write that never happened.
  const decidedAt = new Date().toISOString();
  try {
    expectAffected(
      await admin
        .from('game_registration_requests')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          decided_at: decidedAt,
          decided_by_user_id: actorId,
        })
        .in('id', allRows.map((r) => r.id))
        .eq('status', 'pending')
        .select('id'),
      'rejectRequest',
    );
  } catch (updateErr) {
    console.error('[rejectRequest] status update failed', updateErr);
    redirect({ href: `${detailPath}?error=db_update`, locale });
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
      .select('id, email, locale')
      .in('id', userIdsForMail)
      .returns<{ id: string; email: string; locale: string | null }[]>();
    await Promise.allSettled(
      (emailRows ?? []).map((u) =>
        sendRegistrationRejectedMail({
          to: u.email,
          gameName: game.name,
          ...(reason ? { reason } : {}),
          locale: u.locale,
        }).catch((err) =>
          console.error('[rejectRequest] mail failed', err),
        ),
      ),
    );
  }

  revalidateTag(`game-${game.id}`, 'max');
  redirect({ href: `${detailPath}?status=rejected`, locale });
}
