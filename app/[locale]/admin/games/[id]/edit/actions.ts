'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { findGuestIds } from '@/lib/games/createGuestPlayer';
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
  isTeeOffInPast,
} from '@/lib/games/gamePayload';
import { parseSideTournamentFromFormData } from '@/lib/games/sideTournamentPayload';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import type { Tables } from '@/lib/database.types';

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
  const locale = await getLocale();
  const supabase = await getServerClient();
  // #428: admins keep their Sekretariat redirects; a game's creator gets the
  // player-facing /games/[id]/rediger flow. Gate up front so every redirect
  // below (including form-validation bounces) can branch on the actor.
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const { userId } = ctx;
  const editBase = ctx.isAdmin
    ? `/admin/games/${gameId}/edit`
    : `/games/${gameId}/rediger`;
  const detailBase = ctx.isAdmin
    ? `/admin/games/${gameId}`
    : `/games/${gameId}`;

  const payloadMode = mode === 'save_draft' ? 'draft' : 'publish';
  const payload = buildGameInsertPayload(formData, payloadMode);

  if (payload.errorCode) {
    redirect({ href: `${editBase}?error=${payload.errorCode}`, locale });
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
        redirect({ href: `${editBase}?error=tee_off_required`, locale });
      }
      scheduledTeeOffAt = null;
    }
  } else if (mode !== 'save_draft') {
    redirect({ href: `${editBase}?error=tee_off_required`, locale });
  }

  // #902: same past-tee-off guard as the create flow. Applies when publishing a
  // draft or editing a scheduled game (both produce a live, countdown-bearing
  // row); save_draft is exempt and tolerates a past/partial tee-off. The shared
  // isTeeOffInPast helper keeps create + edit in agreement (AGENTS.md trap #4).
  if (
    (mode === 'publish' || mode === 'update_scheduled') &&
    scheduledTeeOffAt &&
    isTeeOffInPast(scheduledTeeOffAt)
  ) {
    redirect({ href: `${editBase}?error=tee_off_in_past`, locale });
  }

  // Side-tournament config (parsed up front; persisted below only if the row
  // is still in an editable state).
  const sideResult = parseSideTournamentFromFormData(formData);
  if (!sideResult.ok) {
    redirect({ href: `${editBase}?error=${sideResult.errorCode}`, locale });
  }
  // TypeScript cannot narrow past next-intl redirect (not declared `never` at
  // call-site); assert ok branch explicitly.
  const sidePayload = (sideResult as Extract<typeof sideResult, { ok: true }>).payload;
  const {
    enabled: sideEnabled,
    ldCount: sideLdCount,
    ctpCount: sideCtpCount,
    disabledCategories: sideDisabledCategories,
  } = sidePayload;

  if (mode === 'publish' || mode === 'update_scheduled') {
    // Pending-profile gate via SECURITY DEFINER RPC (migration 0071), not a
    // direct users-read: under request-scoped RLS a non-admin creator can't see
    // OTHER users' rows, so a direct read would silently drop them and the gate
    // would no-op (#366 pending-read trap). The RPC returns only the incomplete
    // rows for the exact ids we pass, so it bites for creator and admin alike —
    // and returns the same set an admin's direct read would have.
    const { data: pending, error: rosterErr } = await supabase.rpc(
      'incomplete_profiles_for_ids',
      { p_user_ids: payload.players.map((p) => p.user_id) },
    );

    if (rosterErr) {
      console.error('[updateGameInternal] roster check failed', rosterErr);
      redirect({ href: `${editBase}?error=db_roster`, locale });
    }

    const pendingRows = (pending ?? []) as { id: string; email: string }[];
    if (pendingRows.length > 0) {
      const qs = new URLSearchParams({
        error: 'pending_players',
        emails: pendingRows.map((p) => p.email).join(', '),
      });
      redirect({ href: `${editBase}?${qs.toString()}`, locale });
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
    redirect({ href: `${detailBase}?error=not_editable`, locale });
  }
  if (
    existing!.status !== 'draft' &&
    existing!.game_mode !== payload.game_mode
  ) {
    redirect({ href: `${editBase}?error=mode_locked_after_publish`, locale });
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
      // #199: self-påmelding-akser. Følger samme optimistic-lock-mønster
      // som de andre feltene — kun skrivbar mens status fortsatt er
      // draft/scheduled (filteret nedenfor blokkerer writes etter start).
      registration_mode: payload.registration_mode,
      registration_type: payload.registration_type,
      // #369: kun satt til true når registration_mode = 'manual_approval' +
      // checkbox er avhuket — gamePayload.ts force-false ellers.
      let_friends_skip_gate: payload.let_friends_skip_gate,
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
    redirect({ href: `${detailBase}?error=not_editable`, locale });
  }

  // Snapshot eksisterende roster FØR delete + insert. To formål fra samme
  // round-trip: (1) notify-diff — hvilke spillere er faktisk nye i diff-en, så
  // notify kun fyres for dem; (2) rollback-kilde — hvis re-insertet under
  // feiler, re-inserter vi disse radene så rosteret aldri ender tomt på et
  // publisert/scheduled spill (#907, AGENTS.md felle #5). `select('*')` fordi
  // rollbacken må gjenopprette ALLE kolonner (team/flight/tee_gender/
  // accepted_at …), ikke bare user_id. game_players har ingen auto-generert
  // PK/created_at (komposit-PK game_id+user_id), så radene re-inserter ordrett.
  const { data: priorRoster } = await supabase
    .from('game_players')
    .select('*')
    .eq('game_id', gameId)
    .returns<Tables<'game_players'>[]>();
  const priorRosterRows = priorRoster ?? [];
  const priorRosterIds = new Set(priorRosterRows.map((r) => r.user_id));

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
    console.error('[updateGameInternal] roster delete failed', deleteError);
    redirect({ href: `${editBase}?error=db_players`, locale });
  }

  // #1009: gjeste-rader (skygge-brukere) må re-inserters via service-role —
  // invite-eligibility-guarden (0115) blokkerer en ikke-admin-arrangørs
  // klient-insert av en gjest. Vanlige rader beholder request-klienten så
  // RLS-dekningen er uendret.
  const guestIds = await findGuestIds(payload.players.map((p) => p.user_id));

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
        // #1009: en gjest kan aldri selv bekrefte — bekreftes ved insert så
        // roster-swappen ikke etterlater en evig «Ikke bekreftet»-gjest.
        ...(guestIds.has(p.user_id)
          ? { accepted_at: new Date().toISOString() }
          : {}),
      };
    });
    const regularRows = rows.filter((r) => !guestIds.has(r.user_id));
    const guestRows = rows.filter((r) => guestIds.has(r.user_id));
    // Tom regularRows-insert beholdes (PostgREST no-op) så flyten er identisk
    // med før-#1009 når hele rosteret er gjester.
    let { error: insertError } = await supabase
      .from('game_players')
      .insert(regularRows);
    if (!insertError && guestRows.length > 0) {
      const res = await getAdminClient().from('game_players').insert(guestRows);
      insertError = res.error;
    }
    if (insertError) {
      console.error('[updateGameInternal] roster insert failed', insertError);
      // #907: delete-en over har allerede tømt rosteret, og games.update har
      // committet. Uten dette sitter spillet igjen publisert/scheduled UTEN
      // spillere (AGENTS.md felle #5). Re-insert snapshotet så rosteret
      // gjenopprettes til før-edit-tilstanden. Dobbel-feil (også rollbacken
      // feiler) logges — vi har gjort det vi kan; arrangøren ser db_players og
      // kan prøve på nytt. Speiler den kompenserende rollbacken i #737.
      // #1009: rollbacken går via service-role — snapshotet kan inneholde
      // gjeste-rader som 0115-guarden ville avvist på request-klienten, og en
      // gjenoppretting av FØR-tilstanden skal aldri strande halvveis på den.
      if (priorRosterRows.length > 0) {
        const { error: rollbackError } = await getAdminClient()
          .from('game_players')
          .insert(priorRosterRows);
        if (rollbackError) {
          console.error(
            '[updateGameInternal] roster rollback re-insert failed',
            rollbackError,
          );
        }
      }
      redirect({ href: `${editBase}?error=db_players`, locale });
    }
  }

  // Best-effort notify for spillere som ER NYE i diff-en (var ikke på
  // rosteren før denne edit-en). Skipper inviter selv. Eksisterende
  // spillere som beholdes får ingen ny varsel — den fyrte allerede da de
  // ble lagt til første gang. Promise.allSettled gjør at én feilet notify
  // ikke påvirker action-redirecten.
  // #1009: gjester varsles ikke (ingen innboks å lese i, aldri mail).
  const newPlayerIds = payload.players
    .map((p) => p.user_id)
    .filter((id) => !priorRosterIds.has(id) && id !== userId && !guestIds.has(id));
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
  redirect({ href: `${detailBase}?status=${mode === 'publish' ? 'scheduled' : 'updated'}`, locale });
}
