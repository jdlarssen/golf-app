'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

// TODO: extract this + parseOsloDateTimeLocal + GamePlayerInput type to
// lib/admin/gamePayload.ts when D5 lands. Duplicated here from
// app/admin/games/new/actions.ts to keep D4 self-contained.

type GamePlayerInput = {
  user_id: string;
  team_number: number;
  flight_number: number;
};

type ParsedPayload = {
  name: string;
  course_id: string;
  tee_box_id: string;
  hcp_allowance_pct: number;
  require_peer_approval: boolean;
  players: GamePlayerInput[];
  errorCode?: string;
};

// Parse a 'YYYY-MM-DDTHH:mm' string (as emitted by <input type="datetime-local">)
// as wall-clock time in Europe/Oslo and return the corresponding UTC ISO string.
// Duplicated from app/admin/games/new/actions.ts — see TODO above.
function parseOsloDateTimeLocal(s: string): string {
  const [datePart] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Oslo',
    timeZoneName: 'short',
  });
  const tzPart = fmt
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value;
  const offset = tzPart === 'GMT+2' ? '+02:00' : '+01:00';
  return new Date(`${s}:00${offset}`).toISOString();
}

// Duplicated from app/admin/games/new/actions.ts — see TODO above.
function buildGameInsertPayload(formData: FormData): ParsedPayload {
  const name = String(formData.get('name') ?? '').trim();
  const course_id = String(formData.get('course_id') ?? '').trim();
  const tee_box_id = String(formData.get('tee_box_id') ?? '').trim();
  const hcp_allowance_pct = Number(formData.get('hcp_allowance_pct') ?? 100);
  const require_peer_approval = formData.get('require_peer_approval') === 'on';

  const base = {
    name,
    course_id,
    tee_box_id,
    hcp_allowance_pct,
    require_peer_approval,
    players: [] as GamePlayerInput[],
  };

  if (!name) return { ...base, errorCode: 'name_required' };
  if (!course_id) return { ...base, errorCode: 'course_required' };
  if (!tee_box_id) return { ...base, errorCode: 'tee_required' };
  if (
    !Number.isInteger(hcp_allowance_pct) ||
    hcp_allowance_pct < 0 ||
    hcp_allowance_pct > 100
  ) {
    return { ...base, errorCode: 'bad_allowance' };
  }

  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    const team_number = Number(formData.get(`player_${i}_team`));
    const flight_number = Number(formData.get(`player_${i}_flight`));
    if (!user_id) return { ...base, errorCode: 'players_required' };
    if (seen.has(user_id)) return { ...base, errorCode: 'duplicate_player' };
    seen.add(user_id);
    if (!Number.isInteger(team_number) || team_number < 1 || team_number > 4) {
      return { ...base, errorCode: 'bad_team' };
    }
    if (
      !Number.isInteger(flight_number) ||
      flight_number < 1 ||
      flight_number > 4
    ) {
      return { ...base, errorCode: 'bad_flight' };
    }
    players.push({ user_id, team_number, flight_number });
  }

  const teamCounts = new Map<number, number>();
  for (const p of players) {
    teamCounts.set(p.team_number, (teamCounts.get(p.team_number) ?? 0) + 1);
  }
  for (let t = 1; t <= 4; t++) {
    if (teamCounts.get(t) !== 2) {
      return { ...base, errorCode: 'team_balance' };
    }
  }

  return { ...base, players };
}

export async function updateGameAction(gameId: string, formData: FormData) {
  const payload = buildGameInsertPayload(formData);

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
