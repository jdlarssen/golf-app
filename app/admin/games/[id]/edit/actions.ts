'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
} from '@/lib/games/gamePayload';
import { findPendingPlayers } from '@/lib/games/pendingPlayers';
import { parseSideTournamentFromFormData } from '@/lib/games/sideTournamentPayload';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';

type UpdateMode = 'save_draft' | 'publish' | 'update_scheduled';

function uiGenderToDb(ui: string): 'mens' | 'ladies' | 'juniors' {
  return ui === 'D' ? 'ladies' : ui === 'J' ? 'juniors' : 'mens';
}

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
    disabledCategories: sideDisabledCategories,
  } = sideResult.payload;

  const supabase = await getServerClient();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Replaces the
  // previously-inlined auth.getUser + users.is_admin check.
  const { userId } = await requireAdmin(supabase);

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

  // Mode-lock: spillmodusen kan ikke endres etter at spillet har forlatt
  // 'draft'. Vi leser eksisterende rad og sammenligner game_mode før vi
  // går i gang med oppdateringen — en publisert/scheduled rad har allerede
  // game_players-tildelinger som matcher modusen, og admin-brukeren skal
  // se en eksplisitt feilmelding (ikke det generelle not_editable-flowet).
  const { data: existing, error: existingError } = await supabase
    .from('games')
    .select('status, game_mode')
    .eq('id', gameId)
    .single();
  if (existingError || !existing) {
    redirect(`/admin/games/${gameId}?error=not_editable`);
  }
  if (
    existing.status !== 'draft' &&
    existing.game_mode !== payload.game_mode
  ) {
    redirect(
      `/admin/games/${gameId}/edit?error=mode_locked_after_publish`,
    );
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
      // game_mode + mode_config skrives med samme optimistic-lock-mønster
      // (status-eq under) som de andre feltene. Mode-lock-guarden over har
      // allerede avvist mode-bytte for ikke-draft spill, så denne raden
      // skriver kun samme verdi når status er scheduled — best-ball-rader
      // beholder sin config og draft-rader kan fritt veksle mode.
      game_mode: payload.game_mode,
      mode_config: payload.mode_config,
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
      // v1.2.0 — side_disabled_categories følger samme lock-mønster: write
      // bare når status fortsatt er draft/scheduled (optimistic-lock under).
      // Parseren garanterer tomt array når sideEnabled er false.
      side_disabled_categories: sideDisabledCategories,
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

  // Snapshot eksisterende roster FØR delete + insert. Brukes til å regne
  // ut hvilke spillere som faktisk er nye i diff-en, slik at notify kun
  // fyres for dem (ikke for spillere som var på rosteren fra før og ble
  // re-insertet av wholesale-replace-strategien under).
  const { data: priorRoster } = await supabase
    .from('game_players')
    .select('user_id')
    .eq('game_id', gameId)
    .returns<{ user_id: string }[]>();
  const priorRosterIds = new Set((priorRoster ?? []).map((r) => r.user_id));

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
    const rows = payload.players.map((p) => {
      const playerGenderUi = String(formData.get(`player_${p.user_id}_gender`) ?? 'M');
      return {
        game_id: gameId,
        user_id: p.user_id,
        team_number: p.team_number,
        flight_number: p.flight_number,
        tee_gender: uiGenderToDb(playerGenderUi),
        // Same rule as the publish path: handicaps are frozen at D5
        // (Start runden nå), not at edit-time.
        course_handicap: null,
      };
    });
    const { error: insertError } = await supabase
      .from('game_players')
      .insert(rows);
    if (insertError) {
      redirect(`/admin/games/${gameId}/edit?error=db_players`);
    }
  }

  // Best-effort notify for spillere som ER NYE i diff-en (var ikke på
  // rosteren før denne edit-en). Skipper inviter selv. Eksisterende
  // spillere som beholdes får ingen ny varsel — den fyrte allerede da de
  // ble lagt til første gang. Promise.allSettled gjør at én feilet notify
  // ikke påvirker action-redirecten.
  const newPlayerIds = payload.players
    .map((p) => p.user_id)
    .filter((id) => !priorRosterIds.has(id) && id !== userId);
  if (newPlayerIds.length > 0) {
    await Promise.allSettled(
      newPlayerIds.map((recipientUserId) =>
        notifyInvitedToGame({
          recipientUserId,
          gameId,
          inviterUserId: userId,
        }),
      ),
    );
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect(
    `/admin/games/${gameId}?status=${
      mode === 'publish' ? 'scheduled' : 'updated'
    }`,
  );
}
