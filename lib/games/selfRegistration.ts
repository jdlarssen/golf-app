import 'server-only';
import { resolveRegistrationTypeView } from '@/app/[locale]/signup/[shortId]/registrationTypeView';
import { consumeRegistrationRateLimit } from '@/lib/auth/registrationRateLimit';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { getGameByShortId, type ShortIdGame } from '@/lib/games/getGameByShortId';
import { joinTeeGenders } from '@/lib/games/joinTeeGenders';
import { loadSignupFacts, type SignupViewerFacts } from '@/lib/games/loadSignupFacts';
import { isMatchplayMode, isMatchplaySideFull } from '@/lib/games/matchplaySides';
import { signupSourceFromParam } from '@/lib/games/publicSignupVisibility';
import {
  gameModeSupportsTeams,
  REGISTRATION_MESSAGE_MAX,
} from '@/lib/games/registration';
import {
  isDirectJoinView,
  offerForView,
  signupView,
  type SignupView,
} from '@/lib/games/signupOffer';
import { maxTeamsForSize, registrationSeatTeamSize } from '@/lib/games/teamFormatLimits';
import { sendRegistrationRequestMail } from '@/lib/mail/registrationRequest';
import { notify } from '@/lib/notifications/notify';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { getAdminClient } from '@/lib/supabase/admin';
import { displayNameForOthers } from '@/lib/users/displayName';
import { registrationPlayerCap } from '@/lib/wizard/fitsPlayerCount';

/**
 * Signing up for a round yourself (#199), shared by the web actions on
 * `/signup/[shortId]` and the app's route `/api/pamelding/[shortId]` (#2748).
 *
 * The writes go through the service role: the gate is here, on the same facts
 * the page renders from (`signupOffer.ts`), and nothing behind it. `userId` must
 * come from the caller's verified session or token, never from a form or a body.
 * The callers keep what is theirs: cookies, redirects and the honeypot on the
 * web, the token and the status codes in the route.
 */

export type ActionError =
  | 'not_authed'
  | 'profile_incomplete'
  | 'game_not_found'
  | 'wrong_mode'
  | 'game_locked'
  | 'signup_closed'
  | 'already_registered'
  | 'already_requested'
  | 'message_too_long'
  | 'team_not_supported_yet'
  | 'rate_limited'
  | 'db_error'
  | 'bad_side'
  | 'side_full'
  | 'game_full';

export type RegisterForOpenGameResult =
  | { ok: true; gameId: string }
  | { ok: false; error: ActionError };

export type RequestApprovalResult = { ok: true } | { ok: false; error: ActionError };

/**
 * #1792 (HCD F5): felles gate for begge solo-actions. Solo-påmelding er kun
 * gyldig når signup-siden faktisk viser solo-skjemaet — samme utledning som
 * `renderBody` i page.tsx bruker. Alt annet ('team', eller 'both' på en
 * lagmodus der siden krever fullt lag) avvises, ellers kan en håndbygd POST
 * gå utenom lag-kravet.
 */
function isSoloRegistrationView(game: {
  registration_type: Parameters<typeof resolveRegistrationTypeView>[0];
  game_mode: Parameters<typeof gameModeSupportsTeams>[0];
}): boolean {
  return (
    resolveRegistrationTypeView(
      game.registration_type,
      gameModeSupportsTeams(game.game_mode),
    ).kind === 'solo_form'
  );
}

/**
 * Sjekk om PG-error er UNIQUE-violation (23505) eller inneholder "duplicate"
 * i meldingen. Postgrest returnerer 23505-koden, men i edge-cases (test-mocks,
 * eldre postgrest-versjoner) kommer den som tekst — vi sjekker begge.
 */
function isDuplicateError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  return String(err.message ?? '')
    .toLowerCase()
    .includes('duplicate');
}

/**
 * Slå opp displayName for notify-payload: navn, ellers maskert e-post (#2271),
 * med kallenavn i «». Best-effort: hvis users-raden mangler, returnerer vi null —
 * buildNotificationText fyller locale-riktig fallback ved render-tid, så payloaden
 * holdes språk-nøytral (#583). Vi blokkerer aldri selv-påmelding på display-feil.
 */
async function getRequesterName(userId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('users')
    .select('name, nickname, email')
    .eq('id', userId)
    .maybeSingle<{
      name: string | null;
      nickname: string | null;
      email: string;
    }>();
  if (!data) return null;
  return displayNameForOthers(data);
}

/**
 * #1863: a failed read says nothing about the player, so it stops the write as
 * `db_error` instead of reading as «not a member» or «no profile».
 */
async function readViewerFacts(
  game: ShortIdGame,
  userId: string,
): Promise<SignupViewerFacts | null> {
  try {
    return await loadSignupFacts(game, userId);
  } catch (err) {
    console.error('[selfRegistration] reading the signup facts failed', { gameId: game.id, err });
    return null;
  }
}

/**
 * The answer when the page would not show this form. Only the rows the checks
 * before it do not see end here: a request or a roster row on the other form, a
 * pending invitation, and a club member or friend who has the other form.
 */
function stopError(view: SignupView): ActionError {
  switch (view) {
    case 'already_registered':
      return 'already_registered';
    case 'self_request':
    case 'team_awaiting_approval':
      return 'already_requested';
    case 'locked':
      return 'game_locked';
    case 'closed':
      return 'signup_closed';
    default:
      return 'wrong_mode';
  }
}

/**
 * Solo open-modus påmelding. INSERT direkte i game_players, eller gjennom
 * plass-RPC-en for formater med tak.
 */
export async function registerForOpenGameCore({
  shortId,
  userId,
  ip,
  side,
  src,
}: {
  shortId: string;
  userId: string;
  ip: string;
  /** Matchplay's side, 1 or 2. Other formats ignore it. */
  side: number | null;
  /** Raw `?src=`, goes through the allowlist below. */
  src: string | null;
}): Promise<RegisterForOpenGameResult> {
  const game = await getGameByShortId(shortId);
  if (!game) {
    return { ok: false, error: 'game_not_found' };
  }
  // #2445: a draft answers like a game that does not exist.
  if (game.status === 'draft') {
    return { ok: false, error: 'game_not_found' };
  }
  const viewer = await readViewerFacts(game, userId);
  if (!viewer) {
    return { ok: false, error: 'db_error' };
  }
  // The web action stops here first, with a redirect to the profile form.
  if (!viewer.profileCompleted) {
    return { ok: false, error: 'profile_incomplete' };
  }
  // open lar alle melde seg på direkte. For et klubb-spill (#442) kan også et
  // klubb-medlem melde seg på direkte uansett registration_mode — medlemskap ER
  // invitasjonen. Verifiseres server-side (klienten kan ikke lyve om medlemskap).
  // #369: manual_approval + let_friends_skip_gate=true → aksepterte venner
  // av spill-eieren kan også melde seg på direkte uten å be om godkjenning.
  const canDirectJoin =
    game.registration_mode === 'open' ||
    viewer.isClubMember ||
    (game.registration_mode === 'manual_approval' &&
      game.let_friends_skip_gate === true &&
      viewer.viewerIsFriend);
  if (!canDirectJoin) {
    return { ok: false, error: 'wrong_mode' };
  }
  if (game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }
  // #543: arrangøren kan stenge påmeldingen manuelt. Stengt slår inn etter
  // game_locked slik at «stengt» ikke vises for spill som allerede er aktive.
  if (game.signups_closed_at != null) {
    return { ok: false, error: 'signup_closed' };
  }
  // #1792 (HCD F5): gaten speiler signup-sidens visning. Alt annet enn
  // solo_form avvises — 'team', og 'both' på en lagmodus (siden viser da
  // lag-skjemaet med alle slots påkrevd, så en solo-POST ville gått utenom
  // lag-kravet). 'both' på en solo-modus faller fortsatt til solo_form og
  // er eneste inngang for slike spill.
  if (!isSoloRegistrationView(game)) {
    return { ok: false, error: 'team_not_supported_yet' };
  }

  // #2748: the page's own answer for what the checks above do not see. A side
  // choice passes here and needs its `side` below.
  const view = signupView({ game, ...viewer });
  if (!isDirectJoinView(view)) {
    return { ok: false, error: stopError(view) };
  }

  // Rate-limit-sjekk FØR INSERT. Tre buckets (user / ip / game) — fanger
  // både retry-spam og brute-force på enkelt-spill. Fail-open ved DB-error.
  const rateLimit = await consumeRegistrationRateLimit({
    userId,
    ip,
    gameId: game.id,
  });
  if (!rateLimit.ok) {
    return { ok: false, error: 'rate_limited' };
  }

  // #1022: kanal-attribusjon fra offentlig flate. Allowlist-validert — ukjente
  // verdier blir null og blokkerer aldri påmeldingen.
  const signupSource = signupSourceFromParam(src || undefined);

  // Player cap: the exact-count formats (#661 — Wolf 3–5, Nines 3, RoundRobin 4,
  // AceyDeucey 4, Skins/Nassau/BBB 2–16) and the team formats' player cap
  // (#2011, #2148 — full teams up to 40 players). The matchplay family has no cap here; side capacity
  // has its own check below.
  //
  // For a self-registration game the signup caps (this one and the team cap in
  // submitTeamRegistration) are the only player-count gate before the game
  // starts. Saving does not back them up: for an open or manual_approval game,
  // and a club tournament with individual signup (#2433, both through
  // rosterOptionalAtPublish), buildGameInsertPayload hands the mode validator
  // effectiveMode 'draft', and every too_many_players_for_mode check sits
  // behind mode === 'publish' — so no format's save catches a roster past the
  // cap.
  //
  // #2060/#2062: the count and the INSERT are one call. claim_open_registration_seat
  // locks the game, counts seats — a team holds its full size, so solo players
  // cannot take seats a team's invited teammates are still to fill — and writes
  // the row, so two players on the last seat cannot both get in. The cap number
  // is still computed here; the database never guesses it.
  const admin = getAdminClient();
  // #2209: the profile's tee category, clamped to the game's tee. Without it
  // the row gets the column default 'mens'.
  const teeGender = (await joinTeeGenders(game.id, [userId]))[userId];
  const modeConfig = game.mode_config as { team_size?: number } | null;
  const cap = registrationPlayerCap(game.game_mode, modeConfig);
  if (cap !== null && !isMatchplayMode(game.game_mode)) {
    const seatTeamSize = registrationSeatTeamSize(game.game_mode, modeConfig?.team_size);
    const { data: claim, error: claimError } = await admin.rpc(
      'claim_open_registration_seat',
      {
        p_game_id: game.id,
        p_user_id: userId,
        p_seat_team_size: seatTeamSize,
        p_max_teams: maxTeamsForSize(seatTeamSize),
        // #463: selv-påmelding → bekreftet med en gang.
        p_accepted_at: new Date().toISOString(),
        p_cap: cap,
        // No p_new_team_size: a solo claim takes one seat and no team number.
        ...(signupSource !== null ? { p_signup_source: signupSource } : {}),
        p_tee_gender: teeGender,
      },
    );
    if (claimError) {
      console.error('[registerForOpenGame] seat claim failed', claimError);
      return { ok: false, error: 'db_error' };
    }
    const failure = seatClaimFailure(claim);
    if (failure) return { ok: false, error: failure };
    return completeOpenRegistration(game, userId);
  }

  // #544: for matchplay-familien leser vi `side` og setter
  // team_number + flight_number. Ikke-matchplay-modi ignorerer feltet.
  let teamNumber: number | null = null;
  let flightNumber: number | null = null;

  if (isMatchplayMode(game.game_mode)) {
    const rawSide = side;
    if (rawSide !== 1 && rawSide !== 2) {
      return { ok: false, error: 'bad_side' };
    }
    const teamSize = (game.mode_config as { team_size?: number } | null)?.team_size ?? 1;

    // Kapasitetssjekk: tell aktive (ikke-trukkede) spillere på valgt side.
    const { count: sideCount, error: countError } = await admin
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', game.id)
      .eq('team_number', rawSide)
      .is('withdrawn_at', null);

    if (countError) {
      console.error('[registerForOpenGame] side count failed', countError);
      return { ok: false, error: 'db_error' };
    }
    // #2258: the rule's one home, shared with the terminliste's «Fullt».
    if (isMatchplaySideFull(sideCount ?? 0, teamSize)) {
      return { ok: false, error: 'side_full' };
    }
    teamNumber = rawSide;
    flightNumber = rawSide;
  }

  // INSERT via admin-client: matchplay and the formats without a cap. There is
  // no RLS path for a player's own row any more — 0177 removed the policy
  // branch (#2062) — so self-registration always writes with the service role.
  // Authz over (registration_mode + status) is checked in the code above.
  const insertResult = await admin
    .from('game_players')
    .insert({
      game_id: game.id,
      user_id: userId,
      team_number: teamNumber,
      flight_number: flightNumber,
      course_handicap: null,
      // #463: selv-påmelding → bekreftet med en gang.
      accepted_at: new Date().toISOString(),
      signup_source: signupSource,
      tee_gender: teeGender,
    })
    .select('user_id');

  if (insertResult.error) {
    if (isDuplicateError(insertResult.error)) {
      return { ok: false, error: 'already_registered' };
    }
    console.error('[registerForOpenGame] insert failed', insertResult.error);
    return { ok: false, error: 'db_error' };
  }
  // AGENTS.md trap 2: an insert that returns no row is a failure, not a success.
  try {
    expectAffected(insertResult, 'registerForOpenGame');
  } catch (err) {
    console.error('[registerForOpenGame] insert wrote no row', err);
    return { ok: false, error: 'db_error' };
  }

  // Deterministisk race guard: etter insert, hent alle aktive spillere på
  // siden sortert etter accepted_at ASC, user_id ASC. Vinnerne er de første
  // teamSize radene. Begge samtidige tapere beregner SAMME vinnersett og
  // sletter kun sin egen rad — siden strandes aldri tom (ulikt naiv re-tell
  // som ville la begge slette seg selv ved true concurrent last-slot grab).
  if (teamNumber !== null) {
    const teamSize2 = (game.mode_config as { team_size?: number } | null)?.team_size ?? 1;
    const { data: sideRows } = await admin
      .from('game_players')
      .select('user_id, accepted_at')
      .eq('game_id', game.id)
      .eq('team_number', teamNumber)
      .is('withdrawn_at', null)
      .order('accepted_at', { ascending: true })
      .order('user_id', { ascending: true });
    const winnerIds = new Set(
      (sideRows ?? []).slice(0, teamSize2).map((r: { user_id: string }) => r.user_id),
    );
    if (!winnerIds.has(userId)) {
      // Vi tapte racen — fjern vår egen rad. We just wrote it, so 0 rows or
      // an error means it stays behind on a full side (#2223): log it. The
      // answer stays side_full either way.
      const { data: removed, error: removeError } = await admin
        .from('game_players')
        .delete()
        .eq('game_id', game.id)
        .eq('user_id', userId)
        .select('user_id');
      if (removeError || (removed ?? []).length === 0) {
        console.error('[registerForOpenGame] race-loser rollback failed', {
          gameId: game.id,
          userId,
          error: removeError,
        });
      }
      return { ok: false, error: 'side_full' };
    }
  }

  return completeOpenRegistration(game, userId);
}

/**
 * Maps claim_open_registration_seat's outcome (0177) to the action's error, or
 * null when the seat was claimed. The state gates repeat the action's own
 * checks under the game lock, so they keep the same codes. Anything unknown is
 * a db_error — never a silent success.
 */
function seatClaimFailure(claim: unknown): ActionError | null {
  const outcome = (claim as { outcome?: unknown } | null)?.outcome;
  switch (outcome) {
    case 'ok':
      return null;
    case 'game_full':
      return 'game_full';
    case 'already_on_roster':
      return 'already_registered';
    case 'game_locked':
    case 'signup_closed':
    case 'game_not_found':
      return outcome;
    default:
      console.error('[registerForOpenGame] unexpected seat claim outcome', claim);
      return 'db_error';
  }
}

/**
 * What follows a successful open registration, whichever way the row was
 * written: cache revalidation and the organiser's notification. The redirect into
 * the game is the web action's.
 */
async function completeOpenRegistration(
  game: { id: string; name: string; created_by: string | null },
  userId: string,
): Promise<RegisterForOpenGameResult> {
  expireGameCache(game.id);

  // Notify game-creator. Best-effort — feil her skal aldri rulle tilbake
  // selve påmeldingen. Admin uten created_by-rad (sjelden — manuell DB-fix)
  // får ingen varsel; det er bedre enn å feile påmeldingen.
  //
  // Open registration notifies the organiser in-app and by push, with no
  // mail fallback (#199 §5.3). requestApproval adds one (#199 §5.4).
  if (game.created_by) {
    const requesterName = await getRequesterName(userId);
    await notify({
      userId: game.created_by,
      kind: 'registration_request',
      payload: {
        game_id: game.id,
        game_name: game.name,
        requester_name: requesterName,
      },
    }).catch((err) =>
      console.error('[registerForOpenGame] notify failed', err),
    );
  }

  return { ok: true, gameId: game.id };
}

/**
 * Solo manual-approval påmelding. INSERT i game_registration_requests med
 * status='pending'. Notify admin (game.created_by) med kind
 * `registration_request` + request_id for deeplink til godkjennings-siden.
 */
export async function requestApprovalCore({
  shortId,
  userId,
  ip,
  message: rawMessage,
}: {
  shortId: string;
  userId: string;
  ip: string;
  message: string | null;
}): Promise<RequestApprovalResult> {
  const trimmedMessage = (rawMessage ?? '').trim();
  if (trimmedMessage.length > REGISTRATION_MESSAGE_MAX) {
    return { ok: false, error: 'message_too_long' };
  }
  const message = trimmedMessage.length > 0 ? trimmedMessage : null;

  const game = await getGameByShortId(shortId);
  if (!game) {
    return { ok: false, error: 'game_not_found' };
  }
  // #2445: a draft answers like a game that does not exist.
  if (game.status === 'draft') {
    return { ok: false, error: 'game_not_found' };
  }
  const viewer = await readViewerFacts(game, userId);
  if (!viewer) {
    return { ok: false, error: 'db_error' };
  }
  // The web action stops here first, with a redirect to the profile form.
  if (!viewer.profileCompleted) {
    return { ok: false, error: 'profile_incomplete' };
  }
  // manual_approval OG invite_only tar imot «be om å bli med»-forespørsler
  // (#368). For invite_only er det en fallback for noen som har lenken men
  // ikke er invitert — spillet forblir uoppdagbart i «Finn turneringer».
  // Kun `open` (meld-deg-på-direkte) hører ikke hjemme i request-flyten.
  if (
    game.registration_mode !== 'manual_approval' &&
    game.registration_mode !== 'invite_only'
  ) {
    return { ok: false, error: 'wrong_mode' };
  }
  if (game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }
  // #543: steng-påmelding-guard — speilar registerForOpenGame.
  if (game.signups_closed_at != null) {
    return { ok: false, error: 'signup_closed' };
  }
  // #1792: samme solo-gate som registerForOpenGame — se isSoloRegistrationView.
  if (!isSoloRegistrationView(game)) {
    return { ok: false, error: 'team_not_supported_yet' };
  }

  // #2748: the page's own answer for what the checks above do not see.
  const view = signupView({ game, ...viewer });
  if (offerForView(view, game) !== 'request') {
    return { ok: false, error: stopError(view) };
  }

  const rateLimit = await consumeRegistrationRateLimit({
    userId,
    ip,
    gameId: game.id,
  });
  if (!rateLimit.ok) {
    return { ok: false, error: 'rate_limited' };
  }

  const admin = getAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from('game_registration_requests')
    .insert({
      game_id: game.id,
      user_id: userId,
      status: 'pending',
      is_team_captain: false,
      message,
    })
    .select('id')
    .single<{ id: string }>();

  if (insertError) {
    if (isDuplicateError(insertError)) {
      return { ok: false, error: 'already_requested' };
    }
    console.error('[requestApproval] insert failed', insertError);
    return { ok: false, error: 'db_error' };
  }
  // AGENTS.md trap 2: an insert that returns no row is a failure, not a success.
  if (!inserted?.id) {
    console.error('[requestApproval] insert wrote no row', { gameId: game.id, userId });
    return { ok: false, error: 'db_error' };
  }

  expireGameCache(game.id);

  if (game.created_by) {
    const requesterName = await getRequesterName(userId);
    const notifyResult = await notify({
      userId: game.created_by,
      kind: 'registration_request',
      payload: {
        game_id: game.id,
        game_name: game.name,
        requester_name: requesterName,
        request_id: inserted.id,
        ...(message ? { message } : {}),
      },
    }).catch((err) => {
      console.error('[requestApproval] notify failed', err);
      return { shouldAlsoSendMail: false };
    });

    if (notifyResult.shouldAlsoSendMail) {
      // Mail-backup når admin har vært off-app i mer enn 5 minutter.
      // Best-effort — Promise.allSettled-svelg i caller-context (catch-en
      // i .catch() under) sørger for at en mail-feil ikke ruller tilbake
      // selve forespørselen.
      const { data: adminRow } = await admin
        .from('users')
        .select('email, locale')
        .eq('id', game.created_by)
        .maybeSingle<{ email: string; locale: string | null }>();
      if (adminRow?.email) {
        await sendRegistrationRequestMail({
          to: adminRow.email,
          gameName: game.name,
          gameId: game.id,
          requesterName,
          ...(message ? { message } : {}),
          locale: adminRow.locale,
        }).catch((err) =>
          console.error('[requestApproval] mail failed', err),
        );
      }
    }
  }

  return { ok: true };
}
