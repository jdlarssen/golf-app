'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
} from '@/lib/games/gamePayload';
import { parseSideTournamentFromFormData } from '@/lib/games/sideTournamentPayload';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import { isValidActiveGameMode } from '@/lib/formats/validateGameMode';
// Course handicap is no longer frozen at create-time: the new flow has the
// admin press "Start runden nå" (D5) to flip 'scheduled' → 'active' and
// freeze handicaps then. Until D5 lands, scheduled rows persist with
// course_handicap=null.

function uiGenderToDb(ui: string): 'mens' | 'ladies' | 'juniors' {
  return ui === 'D' ? 'ladies' : ui === 'J' ? 'juniors' : 'mens';
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
  // #427: any logged-in user may create their own game (was admin/trusted-only).
  // Gate first so we know `isAdmin` — it decides both where errors bounce back
  // to (admins use /admin/games/new, everyone else /opprett-spill) and the
  // success destination. created_by = the user; creator-owned RLS (migration
  // 0071) covers the writes, so there's no service-role bypass anymore.
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const userId = user.id;
  const { data: gateProfile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();
  const isAdmin = gateProfile?.is_admin === true;
  const errorBase = isAdmin ? '/admin/games/new' : '/opprett-spill';

  const payload = buildGameInsertPayload(formData, mode);

  if (payload.errorCode) {
    redirect(`${errorBase}?error=${payload.errorCode}`);
  }

  // F2 (#272): valider game_mode-slug mot formats-tabellen. Erstatter den
  // droppede games_mode_check-CHECK-constraint fra 0047-migrasjonen.
  // En slug som ikke finnes i formats — eller er deaktivert — slipper ikke
  // gjennom her, så manipulerte URL-er eller stale klient-state ikke kan
  // opprette ugyldige games.
  const modeValid = await isValidActiveGameMode(payload.game_mode);
  if (!modeValid) {
    redirect(`${errorBase}?error=invalid_game_mode`);
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
        redirect(`${errorBase}?error=tee_off_required`);
      }
      scheduledTeeOffAt = null;
    }
  } else if (mode === 'publish') {
    redirect(`${errorBase}?error=tee_off_required`);
  }

  // Side-tournament config. Master toggle gates the LD/CTP counts; when off,
  // both counts persist as 0 (matches the DB CHECK in 0024_side_tournament).
  const sideResult = parseSideTournamentFromFormData(formData);
  if (!sideResult.ok) {
    redirect(`${errorBase}?error=${sideResult.errorCode}`);
  }
  const {
    enabled: sideEnabled,
    ldCount: sideLdCount,
    ctpCount: sideCtpCount,
    disabledCategories: sideDisabledCategories,
  } = sideResult.payload;

  if (mode === 'publish') {
    // Block publishing a game whose roster still has not-yet-onboarded players
    // (profile_completed_at IS NULL). Under request-scoped RLS a non-admin
    // creator can't read OTHER users' rows, so a direct read would silently
    // return nothing and skip the gate (#366 pending-read trap). The
    // SECURITY DEFINER RPC (migration 0071) returns only the incomplete rows
    // for the exact ids we pass, so the gate bites for admin and creator alike.
    const { data: incomplete, error: rosterErr } = await supabase.rpc(
      'incomplete_profiles_for_ids',
      { p_user_ids: payload.players.map((p) => p.user_id) },
    );

    if (rosterErr) {
      redirect(`${errorBase}?error=db_roster`);
    }

    if ((incomplete ?? []).length > 0) {
      redirect(`${errorBase}?error=pending_players`);
    }
  }

  // Cup-link (#47): hvis admin lander via cup-detalj-side, kobles spillet
  // til parent tournament-en. Validerer at tournament-en faktisk eksisterer
  // før vi setter FK — defensiv mot manipulerte URL-er.
  let tournamentId: string | null = null;
  const tournamentMatchLabelRaw = String(
    formData.get('tournament_match_label') ?? '',
  ).trim();
  const rawTournamentId = String(formData.get('tournament_id') ?? '').trim();
  if (rawTournamentId) {
    const { data: cup } = await supabase
      .from('tournaments')
      .select('id')
      .eq('id', rawTournamentId)
      .maybeSingle();
    if (cup) tournamentId = cup.id;
  }
  const tournamentMatchLabel =
    tournamentId && tournamentMatchLabelRaw
      ? tournamentMatchLabelRaw.slice(0, 80)
      : null;

  // #442: valgfri klubb-tilknytning. Authz: spillet kan kun scopes til en klubb
  // brukeren selv er medlem av (en manipulert URL/form-verdi droppes til null,
  // ikke en feil). Klubb-medlemmer ser + kan melde seg på klubb-spill uansett
  // registration_mode (medlemskap ER invitasjonen).
  const rawGroupId = String(formData.get('group_id') ?? '').trim();
  let groupId: string | null = null;
  if (rawGroupId) {
    const { data: membership } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('group_id', rawGroupId)
      .eq('user_id', userId)
      .maybeSingle();
    if (membership) groupId = rawGroupId;
  }

  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({
      name: payload.name,
      course_id: payload.course_id,
      tee_box_id: payload.tee_box_id,
      hcp_allowance_pct: payload.hcp_allowance_pct,
      require_peer_approval: payload.require_peer_approval,
      score_visibility: payload.score_visibility,
      // game_mode + mode_config persisterer modus-valget fra form-en. Payload-
      // builderen defaultes til best_ball før fase 4-UI lander, så
      // dagens admin-flyt produserer samme rad som før migrering 0030.
      game_mode: payload.game_mode,
      mode_config: payload.mode_config,
      registration_mode: payload.registration_mode,
      registration_type: payload.registration_type,
      side_tournament_enabled: sideEnabled,
      side_ld_count: sideLdCount,
      side_ctp_count: sideCtpCount,
      // v1.2.0: parser garanterer tomt array hvis `enabled === false`, så denne
      // raden trygt persisteres uavhengig av master-toggle-staten.
      side_disabled_categories: sideDisabledCategories,
      // Publishing puts the game in 'scheduled' state — visible to players,
      // but not yet active. The admin separately presses "Start runden nå"
      // (D5) to flip status to 'active' and freeze handicaps.
      status: mode === 'publish' ? 'scheduled' : 'draft',
      scheduled_tee_off_at: scheduledTeeOffAt,
      created_by: userId,
      started_at: null,
      group_id: groupId,
      tournament_id: tournamentId,
      tournament_match_label: tournamentMatchLabel,
    })
    .select('id')
    .single();

  if (gameError || !game) {
    redirect(`${errorBase}?error=db_game`);
  }

  const rows = payload.players.map((p) => {
    const playerGenderUi = String(formData.get(`player_${p.user_id}_gender`) ?? 'M');
    return {
      game_id: game!.id,
      user_id: p.user_id,
      team_number: p.team_number,
      flight_number: p.flight_number,
      tee_gender: uiGenderToDb(playerGenderUi),
      // Course handicap is no longer frozen at create-time. Both 'scheduled'
      // and 'draft' rows defer this until the round actually starts (D5).
      course_handicap: null,
    };
  });
  const { error: gpError } = await supabase.from('game_players').insert(rows);
  if (gpError) redirect(`${errorBase}?error=db_players`);

  // Best-effort `invite`-varsler for hver tilkommet spiller (skip inviter
  // selv — de vet allerede de opprettet spillet). Promise.allSettled så én
  // feilet notify ikke ruller back game-creation. notifyInvitedToGame
  // swallow-er sine egne feil, men vi wrapper inn allSettled for defence-
  // in-depth ved eventuelle endringer i helperen.
  const newPlayerIds = rows
    .map((r) => r.user_id)
    .filter((id) => id !== userId);
  if (newPlayerIds.length > 0) {
    await Promise.allSettled(
      newPlayerIds.map((recipientUserId) =>
        notifyInvitedToGame({
          recipientUserId,
          gameId: game!.id,
          inviterUserId: userId,
        }),
      ),
    );
  }

  // Hvis spillet er koblet til en cup, refresh cup-leaderboard-cachen så
  // /admin/cup/[id] og /cup/[id] viser den nye matchen umiddelbart, og
  // redirect tilbake til cup-detaljsiden i stedet for game-detalj.
  if (tournamentId) {
    const { revalidateTag, revalidatePath } = await import('next/cache');
    revalidateTag(`tournament-${tournamentId}`, 'max');
    revalidatePath(`/admin/cup/${tournamentId}`);
    revalidatePath(`/cup/${tournamentId}`);
    redirect(`/admin/cup/${tournamentId}?status=match_added`);
  }

  if (isAdmin) {
    redirect(
      `/admin/games/${game!.id}?status=${mode === 'publish' ? 'scheduled' : 'draft_created'}`,
    );
  }
  // Trusted-non-admin creator (#198): admin-layouten ville bounce-et dem fra
  // /admin/* til `/`, så de aldri så spillet sitt. Send dem rett til game-home
  // (spiller-visningen) i stedet for blindveien (#363).
  redirect(`/games/${game!.id}`);
}
