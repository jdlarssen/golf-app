'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { findGuestIds } from '@/lib/games/createGuestPlayer';
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
  isTeeOffInPast,
  parsePrizesFromFormData,
} from '@/lib/games/gamePayload';
import { parseSideTournamentFromFormData } from '@/lib/games/sideTournamentPayload';
import { isMatchplayFamily } from '@/lib/scoring/modes/types';
import { acceptedAtForActor } from '@/lib/games/participantAcceptance';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import { isValidActiveGameMode } from '@/lib/formats/validateGameMode';
import { isClubExpired } from '@/lib/clubs/clubStatus';
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
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const userId = (user as NonNullable<typeof user>).id;
  const { data: gateProfile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();
  const isAdmin = gateProfile?.is_admin === true;
  const errorBase = isAdmin ? '/admin/games/new' : '/opprett-spill';

  const payload = buildGameInsertPayload(formData, mode);

  if (payload.errorCode) {
    redirect({ href: `${errorBase}?error=${payload.errorCode}`, locale });
  }

  // F2 (#272): valider game_mode-slug mot formats-tabellen. Erstatter den
  // droppede games_mode_check-CHECK-constraint fra 0047-migrasjonen.
  // En slug som ikke finnes i formats — eller er deaktivert — slipper ikke
  // gjennom her, så manipulerte URL-er eller stale klient-state ikke kan
  // opprette ugyldige games.
  const modeValid = await isValidActiveGameMode(payload.game_mode);
  if (!modeValid) {
    redirect({ href: `${errorBase}?error=invalid_game_mode`, locale });
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
        redirect({ href: `${errorBase}?error=tee_off_required`, locale });
      }
      scheduledTeeOffAt = null;
    }
  } else if (mode === 'publish') {
    redirect({ href: `${errorBase}?error=tee_off_required`, locale });
  }

  // #902: block publishing a game whose tee-off is in the past. A past tee-off
  // makes the E1 auto-start fallback fire immediately (the game jumps to
  // 'active' on first visit without "Start runden nå"), and countdowns go
  // negative — almost always a mistyped date. Server is authoritative; the
  // datetime-local `min` is only a UX nudge. A small grace margin still allows
  // the legit "create the game as the round starts" flow. Drafts are exempt:
  // they're not live yet and a valid tee-off is re-checked at publish.
  if (
    mode === 'publish' &&
    scheduledTeeOffAt &&
    isTeeOffInPast(scheduledTeeOffAt)
  ) {
    redirect({ href: `${errorBase}?error=tee_off_in_past`, locale });
  }

  // Side-tournament config. Master toggle gates the LD/CTP counts; when off,
  // both counts persist as 0 (matches the DB CHECK in 0024_side_tournament).
  const sideResult = parseSideTournamentFromFormData(formData);
  if (!sideResult.ok) {
    redirect({ href: `${errorBase}?error=${sideResult.errorCode}`, locale });
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

  // #1051: premiebord. Beskjæres til gyldige slott for modusen (matchplay har
  // intet podium → ingen plasseringspremier) + de valgte LD/CTP-countene.
  const prizes = parsePrizesFromFormData(formData, {
    hasPodium: !isMatchplayFamily(payload.game_mode),
    ldCount: sideLdCount,
    ctpCount: sideCtpCount,
  });

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
      console.error('[createGameInternal] roster check failed', rosterErr);
      redirect({ href: `${errorBase}?error=db_roster`, locale });
    }

    if ((incomplete ?? []).length > 0) {
      redirect({ href: `${errorBase}?error=pending_players`, locale });
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
      .select('group_id, groups(valid_until)')
      .eq('group_id', rawGroupId)
      .eq('user_id', userId)
      .maybeSingle();
    // #50: en utløpt klubb (frossen avtale) kan ikke ta imot nye spill —
    // dropp scopingen til null (samme «ugyldig verdi → null»-mønster).
    if (membership) {
      const g = Array.isArray(membership.groups)
        ? membership.groups[0] ?? null
        : membership.groups;
      if (!isClubExpired(g?.valid_until ?? null)) groupId = rawGroupId;
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
      score_visibility: payload.score_visibility,
      // game_mode + mode_config persisterer modus-valget fra form-en. Payload-
      // builderen defaultes til best_ball før fase 4-UI lander, så
      // dagens admin-flyt produserer samme rad som før migrering 0030.
      game_mode: payload.game_mode,
      mode_config: payload.mode_config,
      registration_mode: payload.registration_mode,
      registration_type: payload.registration_type,
      // #369: kun satt til true når registration_mode = 'manual_approval' +
      // checkbox er avhuket — gamePayload.ts force-false ellers.
      let_friends_skip_gate: payload.let_friends_skip_gate,
      // #1049: startkontingent + betalingsmåte. entry_fee_kr = 0 (default) betyr
      // ingen kontingent; payment_link er null når det ikke er noe beløp.
      entry_fee_kr: payload.entry_fee_kr,
      payment_link: payload.payment_link,
      // #1051: premiebord (jsonb). Tomt array = ingen premier (feature av).
      prizes,
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
    console.error('[createGameInternal] game insert failed', gameError);
    redirect({ href: `${errorBase}?error=db_game`, locale });
  }

  // #1009: gjeste-rader (skygge-brukere fra veiviserens «Legg til gjest») må
  // inn via service-role — invite-eligibility-guarden (0115) blokkerer en
  // ikke-admin-arrangørs klient-insert av en gjest (verken venn, medspiller
  // eller klubbmedlem). Vanlige rader beholder request-klienten så RLS-
  // dekningen er uendret; kompensasjonen (delete game) dekker begge inserts.
  const guestIds = await findGuestIds(payload.players.map((p) => p.user_id));

  const rowAcceptedAt = new Date().toISOString();
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
      // #463: oppretters egen rad bekreftes nå; andre spillere arrangøren
      // legger til er «Ikke bekreftet» til de selv bekrefter / blir aktive.
      // #1009-unntak: en gjest kan aldri selv bekrefte (ingen innlogging) —
      // arrangøren har avklart deltakelsen, så raden bekreftes ved insert.
      accepted_at: guestIds.has(p.user_id)
        ? rowAcceptedAt
        : acceptedAtForActor(userId, p.user_id, rowAcceptedAt),
    };
  });
  const regularRows = rows.filter((r) => !guestIds.has(r.user_id));
  const guestRows = rows.filter((r) => guestIds.has(r.user_id));
  // Tom regularRows-insert beholdes (PostgREST no-op) så flyten er identisk
  // med før-#1009 når ingen gjester finnes.
  let { error: gpError } = await supabase.from('game_players').insert(regularRows);
  if (!gpError && guestRows.length > 0) {
    const res = await getAdminClient().from('game_players').insert(guestRows);
    gpError = res.error;
  }
  if (gpError) {
    // #737: rull tilbake den committede games-raden. Uten dette etterlater en
    // feilet spiller-insert en foreldreløs game uten spillere — skaperen ser en
    // tom, ødelagt runde i listene sine, og ingen kan rydde den. Skaperen har
    // DELETE-RLS på egne games (0071), så request-klienten kan slette her;
    // game_players cascade-ryddes av FK (0001). Speiler #675-rollbacken i cup/liga.
    await supabase.from('games').delete().eq('id', game!.id);
    console.error('[createGameInternal] game_players insert failed', gpError);
    redirect({ href: `${errorBase}?error=db_players`, locale });
  }

  // Best-effort `invite`-varsler for hver tilkommet spiller (skip inviter
  // selv — de vet allerede de opprettet spillet). Promise.allSettled så én
  // feilet notify ikke ruller back game-creation. notifyInvitedToGame
  // swallow-er sine egne feil, men vi wrapper inn allSettled for defence-
  // in-depth ved eventuelle endringer i helperen.
  // #1009: gjester varsles ikke — de har ingen innboks å lese varselet i, og
  // plassholder-adressen skal aldri få mail.
  const newPlayerIds = rows
    .map((r) => r.user_id)
    .filter((id) => id !== userId && !guestIds.has(id));
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
    const { revalidateTag } = await import('next/cache');
    const { revalidatePath } = await import(
      '@/lib/i18n/revalidateLocalePath'
    );
    revalidateTag(`tournament-${tournamentId}`, 'max');
    revalidatePath(`/admin/cup/${tournamentId}`);
    revalidatePath(`/cup/${tournamentId}`);
    redirect({ href: `/admin/cup/${tournamentId}?status=match_added`, locale });
  }

  if (isAdmin) {
    redirect({
      href: `/admin/games/${game!.id}?status=${mode === 'publish' ? 'scheduled' : 'draft_created'}`,
      locale,
    });
  }
  // Trusted-non-admin creator (#198): admin-layouten ville bounce-et dem fra
  // /admin/* til `/`, så de aldri så spillet sitt. Send dem rett til game-home
  // (spiller-visningen) i stedet for blindveien (#363).
  redirect({ href: `/games/${game!.id}`, locale });
}
