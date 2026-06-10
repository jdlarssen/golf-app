'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { supportsWithdrawal } from '@/lib/scoring';

/**
 * Self-withdraw fra et spill (#199 chunk 11).
 *
 * Bruker sletter sin egen `game_players`-rad pre-active. RLS-policy
 * `self withdraw before start` (migrasjon 0042) håndhever gating på
 * `auth.uid() = user_id` + `games.status IN ('draft', 'scheduled')`, men
 * vi gjør defense-in-depth-sjekk i koden også slik at feilmeldingen er
 * predictable.
 *
 * Team-detection: hvis brukeren var en team-medlem (har team_number satt
 * OG det finnes andre spillere med samme team_number i samme spill), finner
 * vi kapteinen via `game_registration_requests` (raden med
 * `is_team_captain=true` og samme `team_name` som vi har hatt) og varsler
 * dem med `team_member_withdrew`-kind. Best-effort — feil i varsling
 * ruller ikke tilbake selve withdraw-en.
 *
 * For solo-spillere (team_number=null) hopper vi over kaptein-varsel.
 * Vi vurderte å varsle admin (game.created_by) ved solo-withdraw, men det
 * blir for støyete på klubb-skala — admin kan se påmeldings-listen i
 * Sekretariatet hvis de vil følge med.
 */

export type WithdrawResult =
  // `kept` = the game_players row still exists after the call (active soft-WD).
  // false/undefined = the row was deleted (pre-start withdrawal). The form
  // wrapper uses it to decide where to land: game home (kept) vs app home.
  | { ok: true; kept?: boolean }
  | { ok: false; error: WithdrawError };

export type WithdrawError =
  | 'not_authed'
  | 'not_registered'
  | 'game_not_found'
  | 'game_locked'
  | 'db_error';

import type { GameMode } from '@/lib/scoring/modes/types';

type GameSnapshot = {
  id: string;
  name: string;
  short_id: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  game_mode: GameMode;
};

type PlayerSnapshot = {
  user_id: string;
  team_number: number | null;
};

export async function withdrawFromGame(
  gameId: string,
): Promise<WithdrawResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // UUID-sanity før DB-call. Trenger ikke å være strikt — Postgres avviser
  // ugyldig UUID — men vi gir tidlig feil for å unngå unødvendig round-trip.
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) {
    return { ok: false, error: 'game_not_found' };
  }

  const admin = getAdminClient();

  // Hent game + brukerens game_players-rad i parallell.
  const [gameRes, playerRes] = await Promise.all([
    admin
      .from('games')
      .select('id, name, short_id, status, game_mode')
      .eq('id', gameId)
      .maybeSingle<GameSnapshot>(),
    admin
      .from('game_players')
      .select('user_id, team_number')
      .eq('game_id', gameId)
      .eq('user_id', user!.id)
      .maybeSingle<PlayerSnapshot>(),
  ]);

  if (!gameRes.data) {
    return { ok: false, error: 'game_not_found' };
  }
  const game = gameRes.data;

  // Active + in-scope mode → soft WD (set withdrawn_at). Pre-start → DELETE.
  // Any other combination (finished, active+unsupported) → locked.
  if (game.status === 'active' && supportsWithdrawal(game.game_mode)) {
    if (!playerRes.data) {
      return { ok: false, error: 'not_registered' };
    }
    // UPDATE game_players SET withdrawn_at, withdrawn_by_user_id.
    const { error: updateError } = await admin
      .from('game_players')
      .update({
        withdrawn_at: new Date().toISOString(),
        withdrawn_by_user_id: user.id,
      })
      .eq('game_id', gameId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[withdrawFromGame] active update failed', updateError);
      return { ok: false, error: 'db_error' };
    }

    revalidateTag(`game-${game.id}`, 'max');
    return { ok: true, kept: true };
  }

  if (game.status !== 'draft' && game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }

  if (!playerRes.data) {
    return { ok: false, error: 'not_registered' };
  }
  const me = playerRes.data;

  // Sjekk om brukeren var en team-medlem (ikke kaptein selv) — vi vil ha
  // team-info FØR DELETE slik at vi kan varsle kapteinen etter sletting.
  const teamNumber = me.team_number;
  let teamMatesUserId: string | null = null;
  let teamName: string | null = null;
  let captainUserId: string | null = null;
  if (teamNumber !== null) {
    // Hent andre spillere på samme team — bekrefter at det er et faktisk lag
    // (ikke bare en team_number-tildeling for en solo-spiller).
    const { data: mates } = await admin
      .from('game_players')
      .select('user_id')
      .eq('game_id', gameId)
      .eq('team_number', teamNumber)
      .neq('user_id', user!.id)
      .returns<{ user_id: string }[]>();
    if (mates && mates.length > 0) {
      teamMatesUserId = mates[0]!.user_id; // bare for å bekrefte at det er flere
    }

    // Finn brukerens egen registration-request-rad for å hente team_name.
    // Vi bruker den til å slå opp kapteinen.
    const { data: myReq } = await admin
      .from('game_registration_requests')
      .select('team_name, team_request_id, is_team_captain')
      .eq('game_id', gameId)
      .eq('user_id', user!.id)
      .maybeSingle<{
        team_name: string | null;
        team_request_id: string | null;
        is_team_captain: boolean;
      }>();

    if (myReq && !myReq.is_team_captain && myReq.team_request_id) {
      teamName = myReq.team_name;
      const { data: captainReq } = await admin
        .from('game_registration_requests')
        .select('user_id')
        .eq('id', myReq.team_request_id)
        .maybeSingle<{ user_id: string }>();
      captainUserId = captainReq?.user_id ?? null;
    }
  }

  // DELETE game_players-rad. Setter user_id-filter for defense-in-depth.
  const { error: deleteError } = await admin
    .from('game_players')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', user!.id);

  if (deleteError) {
    console.error('[withdrawFromGame] delete failed', deleteError);
    return { ok: false, error: 'db_error' };
  }

  // Slett også eventuelle registration-request-rader (cleanup). Best-effort.
  await admin
    .from('game_registration_requests')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', user!.id);

  revalidateTag(`game-${game.id}`, 'max');

  // Varsle kapteinen hvis bruker var team-medlem.
  if (captainUserId && teamMatesUserId && teamName) {
    // Hent bruker-navnet for payload.
    const { data: userRow } = await admin
      .from('users')
      .select('name, nickname, email')
      .eq('id', user!.id)
      .maybeSingle<{
        name: string | null;
        nickname: string | null;
        email: string;
      }>();
    const base = userRow?.name?.trim() || userRow?.email || 'En spiller';
    const withdrawnName = userRow?.nickname
      ? `${base} «${userRow.nickname}»`
      : base;

    await notify({
      userId: captainUserId,
      kind: 'team_member_withdrew',
      payload: {
        game_id: game.id,
        game_short_id: game.short_id,
        game_name: game.name,
        withdrawn_player_name: withdrawnName,
        team_name: teamName,
      },
    }).catch((err) =>
      console.error('[withdrawFromGame] notify failed', err),
    );
  }

  // Pre-start path deleted the row.
  return { ok: true, kept: false };
}

/**
 * Angre self-WD under aktivt spill (#386 chunk 3).
 *
 * Nullstiller `withdrawn_at` + `withdrawn_by_user_id` for innlogget bruker
 * hvis spillet er `active` og spilleren faktisk er trukket. Kun for in-scope
 * modi (same gate som withdrawFromGame aktiv-gren). Admin-angre håndteres
 * av admin-server-action i chunk 4.
 */
export async function undoWithdraw(
  gameId: string,
): Promise<WithdrawResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  if (!/^[0-9a-f-]{36}$/i.test(gameId)) {
    return { ok: false, error: 'game_not_found' };
  }

  const admin = getAdminClient();

  const [gameRes, playerRes] = await Promise.all([
    admin
      .from('games')
      .select('id, status, game_mode')
      .eq('id', gameId)
      .maybeSingle<Pick<GameSnapshot, 'id' | 'status' | 'game_mode'>>(),
    admin
      .from('game_players')
      .select('user_id, withdrawn_at')
      .eq('game_id', gameId)
      .eq('user_id', user.id)
      .maybeSingle<{ user_id: string; withdrawn_at: string | null }>(),
  ]);

  if (!gameRes.data) {
    return { ok: false, error: 'game_not_found' };
  }
  const game = gameRes.data;

  if (game.status !== 'active' || !supportsWithdrawal(game.game_mode)) {
    return { ok: false, error: 'game_locked' };
  }

  if (!playerRes.data || playerRes.data.withdrawn_at == null) {
    return { ok: false, error: 'not_registered' };
  }

  const { error: updateError } = await admin
    .from('game_players')
    .update({ withdrawn_at: null, withdrawn_by_user_id: null })
    .eq('game_id', gameId)
    .eq('user_id', user.id);

  if (updateError) {
    console.error('[undoWithdraw] update failed', updateError);
    return { ok: false, error: 'db_error' };
  }

  revalidateTag(`game-${game.id}`, 'max');
  return { ok: true };
}
