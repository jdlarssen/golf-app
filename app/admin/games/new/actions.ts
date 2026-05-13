'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
} from '@/lib/games/gamePayload';
import { findPendingPlayers } from '@/lib/games/pendingPlayers';
// Course handicap is no longer frozen at create-time: the new flow has the
// admin press "Start runden nå" (D5) to flip 'scheduled' → 'active' and
// freeze handicaps then. Until D5 lands, scheduled rows persist with
// course_handicap=null.

export async function createGameDraft(formData: FormData) {
  await createGameInternal(formData, 'draft');
}

export async function createAndPublishGame(formData: FormData) {
  await createGameInternal(formData, 'publish');
}

async function createGameInternal(
  formData: FormData,
  mode: 'draft' | 'publish',
) {
  const payload = buildGameInsertPayload(formData, mode);

  if (payload.errorCode) {
    redirect(`/admin/games/new?error=${payload.errorCode}`);
  }

  // Tee-off handling:
  // - Publish: required. Empty or malformed input redirects with an error.
  // - Draft: optional. Empty or malformed input silently persists as NULL,
  //   so an admin can save a draft without committing to a tee-off yet,
  //   and a valid value carries forward when the draft is later published.
  let scheduledTeeOffAt: string | null = null;
  const rawTeeOff = String(formData.get('scheduled_tee_off_at') ?? '').trim();
  if (rawTeeOff) {
    try {
      scheduledTeeOffAt = parseOsloDateTimeLocal(rawTeeOff);
    } catch {
      // parseOsloDateTimeLocal can throw RangeError on malformed strings
      // (DevTools tinkering, non-Chromium browsers emitting unexpected
      // formats). Publish surfaces this as a validation error; draft
      // tolerates it as "no tee-off provided".
      if (mode === 'publish') {
        redirect('/admin/games/new?error=tee_off_required');
      }
      scheduledTeeOffAt = null;
    }
  } else if (mode === 'publish') {
    redirect('/admin/games/new?error=tee_off_required');
  }

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

  if (mode === 'publish') {
    const { data: rosterUsers, error: rosterErr } = await supabase
      .from('users')
      .select('id, email, profile_completed_at')
      .in('id', payload.players.map((p) => p.user_id));

    if (rosterErr || !rosterUsers) {
      redirect('/admin/games/new?error=db_roster');
    }

    const pending = findPendingPlayers(rosterUsers);
    if (pending.length > 0) {
      redirect('/admin/games/new?error=pending_players');
    }
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({
      name: payload.name,
      course_id: payload.course_id,
      tee_box_id: payload.tee_box_id,
      hcp_allowance_pct: payload.hcp_allowance_pct,
      require_peer_approval: payload.require_peer_approval,
      // Publishing puts the game in 'scheduled' state — visible to players,
      // but not yet active. The admin separately presses "Start runden nå"
      // (D5) to flip status to 'active' and freeze handicaps.
      status: mode === 'publish' ? 'scheduled' : 'draft',
      scheduled_tee_off_at: scheduledTeeOffAt,
      created_by: user.id,
      started_at: null,
    })
    .select('id')
    .single();

  if (gameError || !game) {
    redirect('/admin/games/new?error=db_game');
  }

  const rows = payload.players.map((p) => ({
    game_id: game!.id,
    user_id: p.user_id,
    team_number: p.team_number,
    flight_number: p.flight_number,
    // Course handicap is no longer frozen at create-time. Both 'scheduled'
    // and 'draft' rows defer this until the round actually starts (D5).
    course_handicap: null,
  }));
  const { error: gpError } = await supabase.from('game_players').insert(rows);
  if (gpError) redirect('/admin/games/new?error=db_players');

  redirect(
    `/admin/games/${game!.id}?status=${mode === 'publish' ? 'scheduled' : 'draft_created'}`,
  );
}
