'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
} from '@/lib/games/gamePayload';

export async function updateGameAction(gameId: string, formData: FormData) {
  const payload = buildGameInsertPayload(formData, 'publish');

  if (payload.errorCode) {
    redirect(`/admin/games/${gameId}/edit?error=${payload.errorCode}`);
  }

  // Tee-off is required for scheduled games — you can't un-set it mid-schedule
  // without effectively unpublishing, which isn't a flow we support here.
  let scheduledTeeOffAt: string | null = null;
  const rawTeeOff = String(formData.get('scheduled_tee_off_at') ?? '').trim();
  if (!rawTeeOff) {
    redirect(`/admin/games/${gameId}/edit?error=tee_off_required`);
  }
  try {
    scheduledTeeOffAt = parseOsloDateTimeLocal(rawTeeOff);
  } catch {
    redirect(`/admin/games/${gameId}/edit?error=tee_off_required`);
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

  // Optimistic lock: only UPDATE if the game is still 'scheduled'. If another
  // admin (or this admin in another tab) has flipped status to 'active' or
  // 'finished' in the meantime, the UPDATE matches 0 rows — we detect that
  // by re-reading the row and bouncing back to the detail page.
  const { data: updated, error: updateError } = await supabase
    .from('games')
    .update({
      name: payload.name,
      course_id: payload.course_id,
      tee_box_id: payload.tee_box_id,
      scheduled_tee_off_at: scheduledTeeOffAt,
      hcp_allowance_pct: payload.hcp_allowance_pct,
      require_peer_approval: payload.require_peer_approval,
      // status and started_at are intentionally not touched — only D5's
      // "Start runden nå" flow transitions out of 'scheduled'.
    })
    .eq('id', gameId)
    .eq('status', 'scheduled')
    .select('id')
    .single();

  if (updateError || !updated) {
    // Either the optimistic-lock filter excluded the row (status flipped) or
    // a real DB error. In both cases we bounce to the detail page; the user
    // will see the current state and (if applicable) the not_editable banner.
    redirect(`/admin/games/${gameId}?error=not_editable`);
  }

  // Replace the roster wholesale. The game is 'scheduled', so no `scores`
  // rows exist yet (handicaps haven't been frozen, scores can't be written),
  // making delete+insert safe — no cascade fallout to worry about.
  // A diff-based approach would shave a few writes but adds material
  // complexity for an 8-row table; not worth it.
  const { error: deleteError } = await supabase
    .from('game_players')
    .delete()
    .eq('game_id', gameId);
  if (deleteError) {
    redirect(`/admin/games/${gameId}/edit?error=db_players`);
  }

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

  redirect(`/admin/games/${gameId}?status=updated`);
}
