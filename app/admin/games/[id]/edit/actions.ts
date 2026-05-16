'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
} from '@/lib/games/gamePayload';
import { findPendingPlayers } from '@/lib/games/pendingPlayers';
import { parseSideTournamentFromFormData } from '@/lib/games/sideTournamentPayload';

type UpdateMode = 'save_draft' | 'publish' | 'update_scheduled';

export async function saveDraftAction(gameId: string, formData: FormData) {
  await updateGameInternal(gameId, formData, 'save_draft');
}

export async function publishFromDraftAction(
  gameId: string,
  formData: FormData,
) {
  await updateGameInternal(gameId, formData, 'publish');
}

export async function updateScheduledAction(
  gameId: string,
  formData: FormData,
) {
  await updateGameInternal(gameId, formData, 'update_scheduled');
}

async function updateGameInternal(
  gameId: string,
  formData: FormData,
  mode: UpdateMode,
) {
  const payloadMode = mode === 'save_draft' ? 'draft' : 'publish';
  const payload = buildGameInsertPayload(formData, payloadMode);

  if (payload.errorCode) {
    redirect(`/admin/games/${gameId}/edit?error=${payload.errorCode}`);
  }

  // Tee-off is required when publishing or editing a scheduled game (you
  // can't have a scheduled game without a tee-off). For save_draft it's
  // optional — drafts tolerate partial data.
  let scheduledTeeOffAt: string | null = null;
  const rawTeeOff = String(formData.get('scheduled_tee_off_at') ?? '').trim();
  if (rawTeeOff) {
    try {
      scheduledTeeOffAt = parseOsloDateTimeLocal(rawTeeOff);
    } catch {
      if (mode !== 'save_draft') {
        redirect(`/admin/games/${gameId}/edit?error=tee_off_required`);
      }
      scheduledTeeOffAt = null;
    }
  } else if (mode !== 'save_draft') {
    redirect(`/admin/games/${gameId}/edit?error=tee_off_required`);
  }

  // Side-tournament config (parsed up front; persisted below only if the row
  // is still in an editable state).
  const sideResult = parseSideTournamentFromFormData(formData);
  if (!sideResult.ok) {
    redirect(`/admin/games/${gameId}/edit?error=${sideResult.errorCode}`);
  }
  const {
    enabled: sideEnabled,
    ldCount: sideLdCount,
    ctpCount: sideCtpCount,
  } = sideResult.payload;

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/');

  if (mode === 'publish' || mode === 'update_scheduled') {
    const { data: rosterUsers, error: rosterErr } = await supabase
      .from('users')
      .select('id, email, profile_completed_at')
      .in('id', payload.players.map((p) => p.user_id));

    if (rosterErr || !rosterUsers) {
      redirect(`/admin/games/${gameId}/edit?error=db_roster`);
    }

    const pending = findPendingPlayers(rosterUsers);
    if (pending.length > 0) {
      const qs = new URLSearchParams({
        error: 'pending_players',
        emails: pending.map((p) => p.email).join(', '),
      });
      redirect(`/admin/games/${gameId}/edit?${qs.toString()}`);
    }
  }

  // Optimistic lock: only update if the row's current status matches the
  // mode's allowed starting state. Prevents accidental status transitions
  // when admin has another tab open (e.g. draft was already published).
  const allowedFromStatus = mode === 'update_scheduled' ? 'scheduled' : 'draft';
  const nextStatus = mode === 'publish' ? 'scheduled' : allowedFromStatus;

  const { data: updated, error: updateError } = await supabase
    .from('games')
    .update({
      name: payload.name,
      course_id: payload.course_id,
      tee_box_id: payload.tee_box_id,
      scheduled_tee_off_at: scheduledTeeOffAt,
      hcp_allowance_pct: payload.hcp_allowance_pct,
      require_peer_approval: payload.require_peer_approval,
      // score_visibility is implicitly gated by the .eq('status', allowedFromStatus)
      // filter below — it only writes when the row is still draft/scheduled.
      // If status flipped to active/finished between form-render and submit,
      // the entire update is rejected by the optimistic-lock, so the field
      // can't be silently overwritten post-start.
      score_visibility: payload.score_visibility,
      // Side-tournament fields use the same gating: the .eq('status',
      // allowedFromStatus) filter below blocks writes once the game has
      // started, matching the lock-mønster used for score_visibility.
      side_tournament_enabled: sideEnabled,
      side_ld_count: sideLdCount,
      side_ctp_count: sideCtpCount,
      status: nextStatus,
      // started_at is intentionally not touched — only D5's "Start runden nå"
      // flow transitions out of 'scheduled'.
    })
    .eq('id', gameId)
    .eq('status', allowedFromStatus)
    .select('id')
    .single();

  if (updateError || !updated) {
    // Either the optimistic-lock filter excluded the row (status flipped) or
    // a real DB error. In both cases we bounce to the detail page; the user
    // will see the current state and (if applicable) the not_editable banner.
    redirect(`/admin/games/${gameId}?error=not_editable`);
  }

  // Replace the roster wholesale. For both 'draft' and 'scheduled' starting
  // states no `scores` rows exist yet (handicaps haven't been frozen — that
  // happens at "Start runden nå"), making delete+insert safe. A diff-based
  // approach would shave a few writes but adds material complexity for an
  // 8-row table; not worth it.
  const { error: deleteError } = await supabase
    .from('game_players')
    .delete()
    .eq('game_id', gameId);
  if (deleteError) {
    redirect(`/admin/games/${gameId}/edit?error=db_players`);
  }

  if (payload.players.length > 0) {
    const rows = payload.players.map((p) => ({
      game_id: gameId,
      user_id: p.user_id,
      team_number: p.team_number,
      flight_number: p.flight_number,
      // Same rule as the publish path: handicaps are frozen at D5
      // (Start runden nå), not at edit-time.
      course_handicap: null,
    }));
    const { error: insertError } = await supabase
      .from('game_players')
      .insert(rows);
    if (insertError) {
      redirect(`/admin/games/${gameId}/edit?error=db_players`);
    }
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect(
    `/admin/games/${gameId}?status=${
      mode === 'publish' ? 'scheduled' : 'updated'
    }`,
  );
}
