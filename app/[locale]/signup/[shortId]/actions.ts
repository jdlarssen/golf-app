'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { isMatchplayMode } from '@/lib/games/matchplaySides';
import { getFriendIds } from '@/lib/friends/getFriendIds';
import { consumeRegistrationRateLimit } from '@/lib/auth/registrationRateLimit';
import { getClientIp } from '@/lib/admin/rateLimit';
import { sendRegistrationRequestMail } from '@/lib/mail/registrationRequest';

/**
 * Public selv-påmeldings-actions (#199 chunks 6+7).
 *
 * To server-actions for solo-flyten:
 *   - `registerForOpenGame`: direkte INSERT i `game_players` for spill med
 *     `registration_mode = 'open'`. Idempotent — UNIQUE-conflict konverteres
 *     til vennlig melding. Notify til admin med `registration_request`-kind
 *     (uten request_id, siden ingen request-rad opprettes for open-modus).
 *   - `requestApproval`: INSERT i `game_registration_requests` med
 *     status='pending' for spill med `registration_mode = 'manual_approval'`.
 *     UNIQUE-conflict på (game_id, user_id) → vennlig duplicate-melding.
 *
 * Felles authz-mønster:
 *   - Honeypot-felt `website` short-circuiter til "success"-shape.
 *   - Uautentisert → redirect til /login med `next=/signup/[shortId]`.
 *   - Manglende profil → redirect til /complete-profile med next-param.
 *   - Server-state-feil (feil mode, feil status) → returner error-shape.
 *
 * Begge actions returnerer `ActionResult` (objekt) i stedet for å redirecte
 * direkte ved error, slik at client-komponenten kan vise melding inline. Vi
 * redirecter kun ved suksess (open-modus → /games/[id]) eller når brukeren
 * må ut av action-konteksten (login, complete-profile).
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; error: ActionError };

export type ActionError =
  | 'not_authed'
  | 'profile_incomplete'
  | 'game_not_found'
  | 'wrong_mode'
  | 'game_locked'
  | 'already_registered'
  | 'already_requested'
  | 'message_too_long'
  | 'team_not_supported_yet'
  | 'rate_limited'
  | 'db_error'
  | 'bad_side'
  | 'side_full'
  | 'game_full';

const MESSAGE_MAX = 200;

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
 * Slå opp displayName for notify-payload. Bruker name → nickname → email
 * i prioritet. Best-effort: hvis users-raden mangler, returnerer vi fallback
 * "En spiller" — vi vil aldri blokkere selv-påmelding på cosmetic display-feil.
 */
async function getRequesterName(userId: string): Promise<string> {
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
  if (!data) return 'En spiller';
  const base = data.name?.trim() || data.email;
  return data.nickname ? `${base} «${data.nickname}»` : base;
}

/**
 * Verifiser auth + profil. Returnerer userId hvis OK, ellers gjør redirect
 * til /login eller /complete-profile slik at action-en stopper umiddelbart.
 */
async function requireAuthedUser(shortId: string): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/signup/${shortId}`);
  }
  const { data: profile } = await supabase
    .from('users')
    .select('profile_completed_at')
    .eq('id', user!.id)
    .maybeSingle<{ profile_completed_at: string | null }>();
  if (!profile?.profile_completed_at) {
    redirect(`/complete-profile?next=/signup/${shortId}`);
  }
  return user!.id;
}

/**
 * Solo open-modus påmelding. INSERT direkte i game_players.
 *
 * Ved suksess: redirect til /games/[id] slik at brukeren havner rett inn
 * i spillet. Server-action redirect kaster internt, så vi når aldri en
 * return-statement i suksess-grenen — TS-signaturen er ActionResult for
 * å være ærlig om error-tilfellene.
 */
export async function registerForOpenGame(
  formData: FormData,
): Promise<ActionResult> {
  const shortId = String(formData.get('shortId') ?? '').trim();
  const honeypot = String(formData.get('website') ?? '').trim();

  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'registerForOpenGame' });
    return { ok: true };
  }

  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'game_not_found' };
  }

  const userId = await requireAuthedUser(shortId);

  const game = await getGameByShortId(shortId);
  if (!game) {
    return { ok: false, error: 'game_not_found' };
  }
  // open lar alle melde seg på direkte. For et klubb-spill (#442) kan også et
  // klubb-medlem melde seg på direkte uansett registration_mode — medlemskap ER
  // invitasjonen. Verifiseres server-side (klienten kan ikke lyve om medlemskap).
  // #369: manual_approval + let_friends_skip_gate=true → aksepterte venner
  // av spill-eieren kan også melde seg på direkte uten å be om godkjenning.
  let canDirectJoin = game.registration_mode === 'open';
  if (!canDirectJoin && game.group_id) {
    const memberAdmin = getAdminClient();
    const { data: membership } = await memberAdmin
      .from('group_members')
      .select('user_id')
      .eq('group_id', game.group_id)
      .eq('user_id', userId)
      .maybeSingle<{ user_id: string }>();
    canDirectJoin = membership != null;
  }
  if (
    !canDirectJoin &&
    game.registration_mode === 'manual_approval' &&
    game.let_friends_skip_gate === true &&
    game.created_by
  ) {
    const friendIds = await getFriendIds(userId);
    canDirectJoin = friendIds.includes(game.created_by);
  }
  if (!canDirectJoin) {
    return { ok: false, error: 'wrong_mode' };
  }
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }
  // Lag-påmelding kommer i chunk 8 — for nå avviser vi team-only spill i
  // åpen-modus med en plassholdermelding slik at solo-flyten kan landes
  // isolert. `both` tillater solo-grenen.
  if (game.registration_type === 'team') {
    return { ok: false, error: 'team_not_supported_yet' };
  }

  // Rate-limit-sjekk FØR INSERT. Tre buckets (user / ip / game) — fanger
  // både retry-spam og brute-force på enkelt-spill. Fail-open ved DB-error.
  const ip = await getClientIp();
  const rateLimit = await consumeRegistrationRateLimit({
    userId,
    ip,
    gameId: game.id,
  });
  if (!rateLimit.ok) {
    return { ok: false, error: 'rate_limited' };
  }

  // #544: for matchplay-familien leser vi `side` fra formData og setter
  // team_number + flight_number. Ikke-matchplay-modi ignorerer feltet.
  const admin = getAdminClient();
  let teamNumber: number | null = null;
  let flightNumber: number | null = null;

  if (isMatchplayMode(game.game_mode)) {
    const rawSide = Number(formData.get('side') ?? '');
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
    if ((sideCount ?? 0) >= teamSize) {
      return { ok: false, error: 'side_full' };
    }
    teamNumber = rawSide;
    flightNumber = rawSide;
  }

  // INSERT via admin-client. Den nye RLS-policyen `self register open game`
  // (migrasjon 0042) tillater også INSERT via en cookie-basert klient med
  // user-session, men admin-client gir oss deterministisk feilhåndtering
  // uten å bli avhengig av at server-action cookie-handoff er konfigurert
  // riktig på edge runtime. Authz over (registration_mode + status) er
  // allerede sjekket på rad-nivå i koden.
  const { error: insertError } = await admin.from('game_players').insert({
    game_id: game.id,
    user_id: userId,
    team_number: teamNumber,
    flight_number: flightNumber,
    course_handicap: null,
    // #463: selv-påmelding → bekreftet med en gang.
    accepted_at: new Date().toISOString(),
  });

  // Deterministisk race guard: etter insert, hent alle aktive spillere på
  // siden sortert etter accepted_at ASC, user_id ASC. Vinnerne er de første
  // teamSize radene. Begge samtidige tapere beregner SAMME vinnersett og
  // sletter kun sin egen rad — siden strandes aldri tom (ulikt naiv re-tell
  // som ville la begge slette seg selv ved true concurrent last-slot grab).
  if (!insertError && teamNumber !== null) {
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
      // Vi tapte racen — fjern vår egen rad.
      await admin
        .from('game_players')
        .delete()
        .eq('game_id', game.id)
        .eq('user_id', userId);
      return { ok: false, error: 'side_full' };
    }
  }

  if (insertError) {
    if (isDuplicateError(insertError)) {
      return { ok: false, error: 'already_registered' };
    }
    console.error('[registerForOpenGame] insert failed', insertError);
    return { ok: false, error: 'db_error' };
  }

  revalidateTag(`game-${game.id}`, 'max');

  // Notify game-creator. Best-effort — feil her skal aldri rulle tilbake
  // selve påmeldingen. Admin uten created_by-rad (sjelden — manuell DB-fix)
  // får ingen varsel; det er bedre enn å feile påmeldingen.
  if (game.created_by) {
    const requesterName = await getRequesterName(userId);
    await Promise.allSettled([
      notify({
        userId: game.created_by,
        kind: 'registration_request',
        payload: {
          game_id: game.id,
          game_name: game.name,
          requester_name: requesterName,
        },
      }).catch((err) =>
        console.error('[registerForOpenGame] notify failed', err),
      ),
      // TODO(chunk 12): sendOpenRegistrationMail({to: adminEmail, gameName, requesterName})
      // — gated på shouldAlsoSendMail. Mail-template lib/mail/openRegistration.ts.
    ]);
  }

  redirect(`/games/${game.id}`);
}

/**
 * Solo manual-approval påmelding. INSERT i game_registration_requests med
 * status='pending'. Notify admin (game.created_by) med kind
 * `registration_request` + request_id for deeplink til godkjennings-siden.
 *
 * Ved suksess: returner { ok: true } så client-komponenten kan vise
 * kvittering. Vi redirecter ikke — siden samme `/signup/[shortId]`
 * vil re-rendre i "Forespørsel sendt"-state ved neste navigasjon.
 */
export async function requestApproval(
  formData: FormData,
): Promise<ActionResult> {
  const shortId = String(formData.get('shortId') ?? '').trim();
  const honeypot = String(formData.get('website') ?? '').trim();
  const rawMessage = String(formData.get('message') ?? '').trim();

  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'requestApproval' });
    return { ok: true };
  }

  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'game_not_found' };
  }

  if (rawMessage.length > MESSAGE_MAX) {
    return { ok: false, error: 'message_too_long' };
  }
  const message = rawMessage.length > 0 ? rawMessage : null;

  const userId = await requireAuthedUser(shortId);

  const game = await getGameByShortId(shortId);
  if (!game) {
    return { ok: false, error: 'game_not_found' };
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
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }
  if (game.registration_type === 'team') {
    return { ok: false, error: 'team_not_supported_yet' };
  }

  const ip = await getClientIp();
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

  revalidateTag(`game-${game.id}`, 'max');

  if (game.created_by && inserted?.id) {
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
        .select('email')
        .eq('id', game.created_by)
        .maybeSingle<{ email: string }>();
      if (adminRow?.email) {
        await sendRegistrationRequestMail({
          to: adminRow.email,
          gameName: game.name,
          gameShortId: game.short_id,
          requesterName,
          ...(message ? { message } : {}),
        }).catch((err) =>
          console.error('[requestApproval] mail failed', err),
        );
      }
    }
  }

  return { ok: true };
}
