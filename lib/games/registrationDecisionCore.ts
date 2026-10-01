import 'server-only';
import { getRoleContext } from '@/lib/admin/auth';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { joinTeeGenders } from '@/lib/games/joinTeeGenders';
import { REJECTION_REASON_MAX } from '@/lib/games/registration';
import { sendRegistrationApprovedMail } from '@/lib/mail/registrationApproved';
import { sendRegistrationRejectedMail } from '@/lib/mail/registrationRejected';
import { notify } from '@/lib/notifications/notify';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import type { getServerClient } from '@/lib/supabase/server';

/**
 * Answering a registration request (#199), without the redirects (#2263).
 *
 * Moved out of `admin/games/[id]/signups/actions.ts` so the inbox can answer a
 * request too («Godta» / «Avslå»). The signup page's actions wrap these
 * functions and redirect exactly as before; the inbox's `decideRegistration`
 * turns the same result into a status line.
 *
 * Authz is unchanged and lives here now: only a global admin may answer
 * (`getRoleContext().isAdmin`, the check `requireAdmin` made). The writes go
 * through the admin client to avoid RLS recursion on the
 * `is_game_creator_or_admin` UPDATE policy (0041), so this role check is the
 * boundary in front of them — it runs before any read or write, and a
 * non-admin gets `forbidden` instead of a redirect.
 *
 * Cascade for team requests: deciding a captain's row decides every teammate
 * row (`team_request_id` = captain.id) the same way.
 */

type ServerSupabase = Awaited<ReturnType<typeof getServerClient>>;

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

type CascadeRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved';
};

/**
 * #2061: a teammate who accepts the team invitation before the organiser has
 * approved the captain gets status 'approved' but no game_players row — they
 * wait for the team. The cascades therefore read both statuses.
 */
const CASCADE_STATUSES = ['pending', 'approved'] as const;

export type RegistrationDecisionContext = {
  request: RequestSnapshot;
  game: GameSnapshot;
  actorId: string;
};

/** Why loading a decision stopped. The codes are the signup page's `?error=`. */
export type LoadFailure = 'forbidden' | 'request_not_found' | 'game_not_found' | 'game_locked';

export type DecisionFailure =
  | LoadFailure
  | 'not_pending'
  | 'reason_too_long'
  | 'no_team_slot'
  | 'db_cascade'
  | 'db_team_slot'
  | 'db_update'
  | 'db_players';

export type DecisionResult =
  | {
      ok: true;
      outcome: 'approved' | 'rejected';
      gameId: string;
      gameName: string;
      /** Set when a captain's request was decided — the whole team went with it. */
      teamName: string | null;
    }
  | { ok: false; reason: DecisionFailure; gameId: string | null };

/**
 * Role check, then the request and its game, then the game-state gate. Read
 * failures throw (#1445): a transient error is retryable at the error
 * boundary, not a claim that the request is gone. Only a genuine 0-row result
 * gives `request_not_found` / `game_not_found`.
 */
export async function loadRegistrationDecision(
  supabase: ServerSupabase,
  requestId: string,
): Promise<
  { ok: true; ctx: RegistrationDecisionContext } | { ok: false; reason: LoadFailure; gameId: string | null }
> {
  const role = await getRoleContext(supabase);
  if (!role.isAdmin) return { ok: false, reason: 'forbidden', gameId: null };

  const admin = getAdminClient();

  const { data: request, error: requestError } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, status, is_team_captain, team_name, team_request_id')
    .eq('id', requestId)
    .maybeSingle<RequestSnapshot>();
  if (requestError) {
    console.error('[loadDecisionContext] request fetch failed', {
      requestId,
      error: requestError,
    });
    throw requestError;
  }
  if (!request) return { ok: false, reason: 'request_not_found', gameId: null };

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, name, status, created_by')
    .eq('id', request.game_id)
    .maybeSingle<GameSnapshot>();
  if (gameError) {
    console.error('[loadDecisionContext] game fetch failed', {
      gameId: request.game_id,
      error: gameError,
    });
    throw gameError;
  }
  if (!game) return { ok: false, reason: 'game_not_found', gameId: null };

  // Approve/reject only makes sense before the round starts; after that the
  // roster is locked.
  if (game.status === 'active' || game.status === 'finished') {
    return { ok: false, reason: 'game_locked', gameId: game.id };
  }

  return { ok: true, ctx: { request, game, actorId: role.userId } };
}

async function loadCascade(
  request: RequestSnapshot,
  logPrefix: string,
): Promise<CascadeRow[] | null> {
  if (!request.is_team_captain) return [];
  const { data: children, error } = await getAdminClient()
    .from('game_registration_requests')
    .select('id, user_id, status')
    .eq('team_request_id', request.id)
    .in('status', [...CASCADE_STATUSES])
    .returns<CascadeRow[]>();
  if (error) {
    console.error(`[${logPrefix}] team children fetch failed`, error);
    return null;
  }
  return children ?? [];
}

function fail(reason: DecisionFailure, ctx: RegistrationDecisionContext): DecisionResult {
  return { ok: false, reason, gameId: ctx.game.id };
}

function done(outcome: 'approved' | 'rejected', ctx: RegistrationDecisionContext): DecisionResult {
  return {
    ok: true,
    outcome,
    gameId: ctx.game.id,
    gameName: ctx.game.name,
    teamName: ctx.request.is_team_captain ? ctx.request.team_name : null,
  };
}

/**
 * Approve a pending request. Cascades to the team if the row is a captain's,
 * inserts game_players rows and fires registration_approved notifications.
 */
export async function approveRegistrationCore(
  ctx: RegistrationDecisionContext,
): Promise<DecisionResult> {
  const { request, game, actorId } = ctx;
  if (request.status !== 'pending') return fail('not_pending', ctx);

  const admin = getAdminClient();

  // Every request row to approve. Captain: captain + all team children. Solo
  // or a single team member: just the one row.
  const cascadeRows = await loadCascade(request, 'approveRequest');
  if (cascadeRows === null) return fail('db_cascade', ctx);

  const allRows: CascadeRow[] = [
    { id: request.id, user_id: request.user_id, status: 'pending' },
    ...cascadeRows,
  ];
  // The captain passed the not_pending gate above, so it is always here.
  const pendingRows = allRows.filter((r) => r.status === 'pending');

  // team_number for a team signup: the lowest free slot (1..). Solo sets null
  // on both team_number and flight_number (matches the CHECK in 0030).
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
      return fail('db_team_slot', ctx);
    }
    const taken = new Set((existing ?? []).map((r) => r.team_number));
    // Deliberately wider than the grid (#662): the organiser's approval keeps an
    // escape hatch past maxTeamsForSize, while open self-registration stops at it
    // (teamActions.ts, #2011). The widened game_players_team_number_check
    // (0101) allows it.
    for (let slot = 1; slot <= 50; slot += 1) {
      if (!taken.has(slot)) {
        teamNumber = slot;
        break;
      }
    }
    if (teamNumber == null) return fail('no_team_slot', ctx);
  }

  const decidedAt = new Date().toISOString();

  // UPDATE status first — if it fails, no game_players insert.
  // #712: expectAffected catches both DB errors (throws Error) and silent
  // 0-row no-ops (throws NoRowsAffectedError). 0 rows means all requests
  // were already decided (race between two admin tabs) — stop rather than
  // insert game_players + fire notifications for a write that never happened.
  // Only pending rows: a teammate who already accepted keeps their decision.
  try {
    expectAffected(
      await admin
        .from('game_registration_requests')
        .update({
          status: 'approved',
          decided_at: decidedAt,
          decided_by_user_id: actorId,
        })
        .in('id', pendingRows.map((r) => r.id))
        .eq('status', 'pending')
        .select('id'),
      'approveRequest',
    );
  } catch (err) {
    console.error('[approveRequest] status update failed', err);
    return fail('db_update', ctx);
  }

  // INSERT game_players rows for the whole team — captain, pending and early
  // accepted teammates — with the same team number (#2061). Upsert with
  // ignore-duplicates tolerates a re-trigger (two admin tabs racing);
  // `.select()` returns only the rows actually inserted.
  // #2209: each member's tee category from the profile, clamped to the tee.
  const teeGenders = await joinTeeGenders(
    game.id,
    allRows.map((r) => r.user_id),
  );
  const playerRows = allRows.map((r) => ({
    game_id: game.id,
    user_id: r.user_id,
    team_number: teamNumber,
    // Contract §5.6: flight_number mirrors team_number on auto-assignment.
    // Solo (teamNumber=null) also gets a null flight — CHECK 0030 needs both
    // null or both set.
    flight_number: teamNumber,
    course_handicap: null,
    tee_gender: teeGenders[r.user_id],
  }));
  const { data: insertedPlayers, error: insertError } = await admin
    .from('game_players')
    .upsert(playerRows, { onConflict: 'game_id,user_id', ignoreDuplicates: true })
    .select('user_id')
    .returns<{ user_id: string }[]>();
  if (insertError) {
    console.error('[approveRequest] game_players insert failed', insertError);
    return fail('db_players', ctx);
  }
  const placedUserIds = new Set((insertedPlayers ?? []).map((r) => r.user_id));

  // #2072: a team member already on the roster without a team (added by the
  // organiser) keeps their row through the upsert above, so give that row the
  // team's number. Rows that already have a number are left alone — the
  // organiser may have moved them on purpose.
  if (teamNumber !== null) {
    const { data: numberedPlayers, error: numberError } = await admin
      .from('game_players')
      .update({ team_number: teamNumber, flight_number: teamNumber })
      .eq('game_id', game.id)
      .in('user_id', allRows.map((r) => r.user_id))
      .is('team_number', null)
      .select('user_id')
      .returns<{ user_id: string }[]>();
    if (numberError) {
      console.error('[approveRequest] team number update failed', numberError);
      return fail('db_players', ctx);
    }
    for (const row of numberedPlayers ?? []) placedUserIds.add(row.user_id);
  }

  // Notify those approved now, and early-accepted teammates who got onto the
  // roster in this operation. Each user once.
  const notifyRows = allRows.filter(
    (r) => r.status === 'pending' || placedUserIds.has(r.user_id),
  );

  // Best-effort notifications + mail. A notify failure is swallowed so the
  // approval does not roll back — the admin has decided.
  const notifyResults = await Promise.allSettled(
    notifyRows.map((r) =>
      notify({
        userId: r.user_id,
        kind: 'registration_approved',
        payload: { game_id: game.id, game_name: game.name },
      }),
    ),
  );

  // Mail backup for off-app recipients, one batched address lookup.
  const userIdsForMail: string[] = [];
  notifyResults.forEach((res, idx) => {
    if (res.status === 'fulfilled' && res.value.shouldAlsoSendMail) {
      const row = notifyRows[idx];
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

  expireGameCache(game.id);
  return done('approved', ctx);
}

/**
 * Reject a pending request with an optional reason (the inbox sends none).
 * Cascades to the team if the row is a captain's.
 */
export async function rejectRegistrationCore(
  ctx: RegistrationDecisionContext,
  rawReason: string,
): Promise<DecisionResult> {
  const { request, game, actorId } = ctx;
  if (request.status !== 'pending') return fail('not_pending', ctx);

  const trimmed = rawReason.trim();
  if (trimmed.length > REJECTION_REASON_MAX) return fail('reason_too_long', ctx);
  const reason = trimmed.length > 0 ? trimmed : null;

  const admin = getAdminClient();

  const cascadeRows = await loadCascade(request, 'rejectRequest');
  if (cascadeRows === null) return fail('db_cascade', ctx);

  const allRows: CascadeRow[] = [
    { id: request.id, user_id: request.user_id, status: 'pending' },
    ...cascadeRows,
  ];
  // The captain passed the not_pending gate above, so it is always here.
  const pendingRows = allRows.filter((r) => r.status === 'pending');

  // #712: same 0-row trap as approve. If all requests were already rejected
  // (race), 0 rows returns error==null — without this guard notifications
  // would fire for a write that never happened.
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
        .in('id', pendingRows.map((r) => r.id))
        .eq('status', 'pending')
        .select('id'),
      'rejectRequest',
    );
  } catch (updateErr) {
    console.error('[rejectRequest] status update failed', updateErr);
    return fail('db_update', ctx);
  }

  // #2061: teammates who accepted before the team was decided go down with it,
  // so none is left standing as approved in a rejected team. A separate update
  // filtered on 'approved', run only after the pending update above proved the
  // captain was still pending — widening that one would let a reject racing an
  // approval flip rows the other tab just approved. It covers every teammate,
  // not just those read as approved above, so one who accepts between that
  // read and now is caught too. Their accept wrote no game_players row, so
  // there is nothing to remove; 0 rows here is the normal case.
  if (cascadeRows.length > 0) {
    const { error: acceptedError } = await admin
      .from('game_registration_requests')
      .update({
        status: 'rejected',
        rejection_reason: reason,
        decided_at: decidedAt,
        decided_by_user_id: actorId,
      })
      .in('id', cascadeRows.map((r) => r.id))
      .eq('status', 'approved')
      .select('id');
    if (acceptedError) {
      console.error('[rejectRequest] accepted teammates update failed', acceptedError);
      return fail('db_update', ctx);
    }
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

  expireGameCache(game.id);
  return done('rejected', ctx);
}
