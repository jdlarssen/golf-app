'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
// Course handicap is no longer frozen at create-time: the new flow has the
// admin press "Start runden nå" (D5) to flip 'scheduled' → 'active' and
// freeze handicaps then. Until D5 lands, scheduled rows persist with
// course_handicap=null.

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
//
// Strategy: ask Intl what the timezone-name short label is for the given Oslo
// wall-clock date (CET = GMT+1, CEST = GMT+2). Append the matching offset
// suffix and let `new Date()` parse the offset-bearing string into UTC.
// This handles DST transitions correctly for any non-ambiguous wall-clock
// instant. (Ambiguous instants — the autumn fall-back hour — are vanishingly
// rare for golf tee-offs and fall back to the post-transition offset.)
function parseOsloDateTimeLocal(s: string): string {
  const [datePart] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  // Probe at noon UTC on the target date: avoids straddling the midnight
  // DST boundary and yields the right offset for the day.
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
  await createGameInternal(formData, 'draft');
}

export async function createAndPublishGame(formData: FormData) {
  await createGameInternal(formData, 'publish');
}

async function createGameInternal(
  formData: FormData,
  mode: 'draft' | 'publish',
) {
  const payload = buildGameInsertPayload(formData);

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
