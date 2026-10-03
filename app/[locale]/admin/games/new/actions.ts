'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { findGuestIds } from '@/lib/games/createGuestPlayer';
import { asTeeChoice, teeChoiceToDb } from '@/lib/games/teeChoice';
import {
  buildGameInsertPayload,
  parseOsloDateTimeLocal,
  isTeeOffInPast,
  parsePrizesFromFormData,
} from '@/lib/games/gamePayload';
import type { GameValidationErrorCode } from '@/lib/games/gamePayload';
import { parseSideTournamentFromFormData } from '@/lib/games/sideTournamentPayload';
import { isMatchplayFamily } from '@/lib/scoring/modes/types';
import { acceptedAtForActor } from '@/lib/games/participantAcceptance';
import { notifyRosterInvites } from '@/lib/games/notifyRosterInvites';
import { isValidActiveGameMode } from '@/lib/formats/validateGameMode';
import { resolveGameClubId } from '@/lib/clubs/gameClubId';
import { isClubTournament } from '@/lib/games/registration';
import { stampNewGameModeConfig } from '@/lib/games/modeConfigEdit';
import { parseInviteEmailList } from '@/lib/games/inviteEmail';
import { sendPublishInvites } from '@/lib/games/sendPublishInvites';
// Course handicap is no longer frozen at create-time: the new flow has the
// admin press "Start runden nå" (D5) to flip 'scheduled' → 'active' and
// freeze handicaps then. Until D5 lands, scheduled rows persist with
// course_handicap=null.

/**
 * Feilkoder opprett-actionene kan returnere. Alle har en nøkkel under
 * `wizard.errors.*` i messages/{no,en}.json.
 */
export type CreateGameErrorCode =
  | GameValidationErrorCode
  | 'invalid_game_mode'
  | 'tee_off_required'
  | 'tee_off_in_past'
  | 'bad_side_ld_count'
  | 'bad_side_ctp_count'
  | 'db_game'
  | 'db_players';

/**
 * #1379: feil RETURNERES i stedet for å redirecte. Veiviseren holder all
 * tilstand klient-side, så en redirect tilbake til opprett-ruta monterte
 * skjemaet på nytt og slettet bane, tidspunkt, format, spillere og lag.
 * Suksess redirecter fortsatt (kaster NEXT_REDIRECT), så en returnert
 * verdi betyr alltid at noe gikk galt.
 */
export type CreateGameResult = { error: CreateGameErrorCode | '' };

export async function createGameDraft(
  formData: FormData,
): Promise<CreateGameResult> {
  return createGameInternal(formData, 'draft');
}

export async function createAndPublishGame(
  formData: FormData,
): Promise<CreateGameResult> {
  return createGameInternal(formData, 'publish');
}

async function createGameInternal(
  formData: FormData,
  mode: 'draft' | 'publish',
): Promise<CreateGameResult> {
  // #427: any logged-in user may create their own game (was admin/trusted-only).
  // Gate first so we know `isAdmin` — it decides the success destination.
  // created_by = the user; creator-owned RLS (migration 0071) covers the
  // writes, so there's no service-role bypass anymore.
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const userId = user.id;
  // #2321: `name` signs the wizard's e-mail invitations sent at publish.
  const { data: gateProfile } = await supabase
    .from('users')
    .select('is_admin, name')
    .eq('id', userId)
    .single();
  const isAdmin = gateProfile?.is_admin === true;

  // #442: valgfri klubb-tilknytning — bare en klubb du er medlem av og som
  // ikke er utløpt (#50); ellers null, ikke en feil. The rule lives in
  // resolveGameClubId, shared with the edit action (#2433).
  const groupId = await resolveGameClubId(
    supabase,
    userId,
    String(formData.get('group_id') ?? '').trim(),
  );

  // #2433: read here so the payload knows whether this is a club tournament.
  // The membership check and can_manage_tournament (below) are what decide
  // the stored links; the raw cup id is used on purpose for the roster rule:
  // a cup id in the form keeps the roster required even if it is invalid, so
  // it can only make the server stricter.
  const rawTournamentId = String(formData.get('tournament_id') ?? '').trim();

  // #2433: a club tournament publishes without players (members sign up
  // themselves). The club signal is the DB-checked groupId, never the raw
  // form value, so a forged group_id never unlocks an empty roster.
  const payload = buildGameInsertPayload(formData, mode, {
    clubScoped: isClubTournament({ groupId, tournamentId: rawTournamentId }),
  });

  if (payload.errorCode) {
    return { error: payload.errorCode };
  }

  // F2 (#272): valider game_mode-slug mot formats-tabellen. Erstatter den
  // droppede games_mode_check-CHECK-constraint fra 0047-migrasjonen.
  // En slug som ikke finnes i formats — eller er deaktivert — slipper ikke
  // gjennom her, så manipulerte URL-er eller stale klient-state ikke kan
  // opprette ugyldige games.
  const modeValid = await isValidActiveGameMode(payload.game_mode);
  if (!modeValid) {
    return { error: 'invalid_game_mode' };
  }

  // Tee-off handling:
  // - Publish: required. Empty or malformed input returns an error code.
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
        return { error: 'tee_off_required' };
      }
      scheduledTeeOffAt = null;
    }
  } else if (mode === 'publish') {
    return { error: 'tee_off_required' };
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
    return { error: 'tee_off_in_past' };
  }

  // Side-tournament config. Master toggle gates the LD/CTP counts; when off,
  // both counts persist as 0 (matches the DB CHECK in 0024_side_tournament).
  const sideResult = parseSideTournamentFromFormData(formData);
  if (!sideResult.ok) {
    return { error: sideResult.errorCode };
  }
  const sidePayload = sideResult.payload;
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

  // Cup-link (#47): hvis arrangøren lander via cup-detalj-side, kobles spillet
  // til parent tournament-en. #2207: bare den som styrer cupen kan koble et
  // spill til den — samme regel som databasen håndhever
  // (guard_games_competition_links, 0185). En manipulert verdi, en cup
  // kalleren ikke styrer eller en feil i sjekken gir et vanlig spill uten
  // kobling (samme «ugyldig verdi → null»-mønster som group_id over).
  let tournamentId: string | null = null;
  const tournamentMatchLabelRaw = String(
    formData.get('tournament_match_label') ?? '',
  ).trim();
  if (rawTournamentId) {
    const { data: canManage, error: cupErr } = await supabase.rpc(
      'can_manage_tournament',
      { p_tournament_id: rawTournamentId },
    );
    if (cupErr) {
      console.error('[createGameInternal] cup check failed', cupErr);
    }
    if (canManage === true) tournamentId = rawTournamentId;
  }
  const tournamentMatchLabel =
    tournamentId && tournamentMatchLabelRaw
      ? tournamentMatchLabelRaw.slice(0, 80)
      : null;

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
      // #2253: a new game is stamped with the rules it is created under
      // (solo strokeplay ranks on net to par). Only here, never on edit.
      mode_config: stampNewGameModeConfig(payload.mode_config),
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
      // #2258: «Shotgun-start» by the tee-off time; first_tee otherwise.
      start_type: payload.start_type,
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
    return { error: 'db_game' };
  }

  // #1009: gjeste-rader (skygge-brukere fra veiviserens «Legg til gjest») må
  // inn via service-role — invite-eligibility-guarden (0115) blokkerer en
  // ikke-admin-arrangørs klient-insert av en gjest (verken venn, medspiller
  // eller klubbmedlem). Vanlige rader beholder request-klienten så RLS-
  // dekningen er uendret; kompensasjonen (delete game) dekker begge inserts.
  const guestIds = await findGuestIds(payload.players.map((p) => p.user_id));

  const rowAcceptedAt = new Date().toISOString();
  const rows = payload.players.map((p) => {
    const playerGenderUi = asTeeChoice(
      String(formData.get(`player_${p.user_id}_gender`) ?? 'M'),
    );
    return {
      game_id: game.id,
      user_id: p.user_id,
      team_number: p.team_number,
      flight_number: p.flight_number,
      tee_gender: teeChoiceToDb(playerGenderUi),
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
    console.error('[createGameInternal] game_players insert failed', gpError);
    // #2223: check the rollback too. An error or 0 rows leaves the orphan
    // behind, so log it with the game id; the answer stays db_players.
    const { data: rolledBack, error: rollbackError } = await supabase
      .from('games')
      .delete()
      .eq('id', game.id)
      .select('id');
    if (rollbackError || (rolledBack ?? []).length === 0) {
      console.error('[createGameInternal] game rollback failed', {
        gameId: game.id,
        error: rollbackError,
      });
    }
    return { error: 'db_players' };
  }

  // #2445: a draft notifies nobody; publishing sends the roster its `invite`
  // notice. Who gets one (not the caller, not the organiser, no guests, no
  // withdrawn players, nobody already invited) lives in notifyRosterInvites.
  // Best-effort: it throws on a DB error, and neither that nor a refusal ever
  // stops the publish.
  if (mode === 'publish') {
    try {
      const notified = await notifyRosterInvites({ gameId: game.id, inviterUserId: userId });
      if (!notified.ok) {
        console.error('[createGameInternal] roster invites failed', {
          gameId: game.id,
          reason: notified.reason,
        });
      }
    } catch (error) {
      console.error('[createGameInternal] roster invites failed', { gameId: game.id, error });
    }
  }

  // #2321: the addresses from the wizard's «Inviter på e-post» go out now
  // that the game exists. Only on publish (a draft sends nothing, the form says
  // so) and only without a cup link (the wizard has no e-mail card there). The
  // gate the core's file header asks for is the insert above: the logged-in
  // user just created this game with `created_by` = themselves. A failed
  // address never stops the publish; it only adds the warning banner.
  let invitesFailed = false;
  if (mode === 'publish' && !tournamentId) {
    const emails = parseInviteEmailList(formData.getAll('invite_email'));
    if (emails.length > 0) {
      const { failed } = await sendPublishInvites({
        client: supabase,
        viewer: supabase,
        gameId: game.id,
        inviterUserId: userId,
        inviterName: gateProfile?.name ?? null,
        isAdmin,
        emails,
      });
      invitesFailed = failed > 0;
    }
  }

  // Hvis spillet er koblet til en cup, refresh cup-leaderboard-cachen så
  // /admin/cup/[id] og /cup/[id] viser den nye matchen umiddelbart, og
  // redirect tilbake til cup-detaljsiden i stedet for game-detalj.
  if (tournamentId) {
    const { expireTournamentCache } = await import(
      '@/lib/games/expireGameCache'
    );
    const { revalidatePath } = await import(
      '@/lib/i18n/revalidateLocalePath'
    );
    expireTournamentCache(tournamentId);
    revalidatePath(`/admin/cup/${tournamentId}`);
    revalidatePath(`/cup/${tournamentId}`);
    redirect({ href: `/admin/cup/${tournamentId}?status=match_added`, locale });
  }

  if (isAdmin) {
    redirect({
      href: `/admin/games/${game.id}?status=${mode === 'publish' ? 'scheduled' : 'draft_created'}${invitesFailed ? '&error=invites_failed' : ''}`,
      locale,
    });
  }
  // #2321: the players page is where «Inviter på e-post» lives, so a failed
  // invitation lands there with the banner instead of on game-home.
  if (invitesFailed) {
    redirect({ href: `/games/${game.id}/spillere?error=invites_failed`, locale });
  }
  // Trusted-non-admin creator (#198): admin-layouten ville bounce-et dem fra
  // /admin/* til `/`, så de aldri så spillet sitt. Send dem rett til game-home
  // (spiller-visningen) i stedet for blindveien (#363).
  redirect({ href: `/games/${game.id}`, locale });
}
