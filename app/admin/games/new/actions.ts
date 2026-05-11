'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import {
  calculateCourseHandicap,
  applyAllowance,
} from '@/lib/scoring/courseHandicap';

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

  // Parse 8 player slots: player_0_id .. player_7_id with matching team/flight.
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

  // 4 teams of exactly 2 each.
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

export async function createGameDraft(formData: FormData) {
  await createGameInternal(formData, false);
}

export async function createAndStartGame(formData: FormData) {
  await createGameInternal(formData, true);
}

async function createGameInternal(formData: FormData, start: boolean) {
  const payload = buildGameInsertPayload(formData);

  if (payload.errorCode) {
    redirect(`/admin/games/new?error=${payload.errorCode}`);
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

  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({
      name: payload.name,
      course_id: payload.course_id,
      tee_box_id: payload.tee_box_id,
      hcp_allowance_pct: payload.hcp_allowance_pct,
      require_peer_approval: payload.require_peer_approval,
      status: start ? 'active' : 'draft',
      created_by: user.id,
      started_at: start ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (gameError || !game) {
    redirect('/admin/games/new?error=db_game');
  }

  // When starting immediately, freeze each player's course handicap using the
  // selected tee's slope/rating and the configured allowance.
  const frozenHandicaps: Record<string, number> = {};
  if (start) {
    const userIds = payload.players.map((p) => p.user_id);
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, hcp_index')
      .in('id', userIds);
    if (usersError || !users) redirect('/admin/games/new?error=db_users');

    const { data: tee, error: teeError } = await supabase
      .from('tee_boxes')
      .select('slope, course_rating, par_total')
      .eq('id', payload.tee_box_id)
      .single();
    if (teeError || !tee) redirect('/admin/games/new?error=db_tee');

    for (const u of users!) {
      const raw = calculateCourseHandicap({
        hcpIndex: Number(u.hcp_index),
        slope: tee!.slope,
        courseRating: Number(tee!.course_rating),
        par: tee!.par_total,
      });
      frozenHandicaps[u.id] = applyAllowance(raw, payload.hcp_allowance_pct);
    }
  }

  const rows = payload.players.map((p) => ({
    game_id: game!.id,
    user_id: p.user_id,
    team_number: p.team_number,
    flight_number: p.flight_number,
    course_handicap: start ? (frozenHandicaps[p.user_id] ?? null) : null,
  }));
  const { error: gpError } = await supabase.from('game_players').insert(rows);
  if (gpError) redirect('/admin/games/new?error=db_players');

  redirect(
    `/admin/games/${game!.id}?status=${start ? 'started' : 'draft_created'}`,
  );
}
