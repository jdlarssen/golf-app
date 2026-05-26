'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { notifyInvitedToTeam } from '@/lib/notifications/notifyInvitedToTeam';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { lookupUserByEmail } from '@/lib/users/lookupByEmail';
import { gameModeSupportsTeams } from '@/lib/games/registration';
import { consumeRegistrationRateLimit } from '@/lib/auth/registrationRateLimit';
import { getClientIp } from '@/lib/admin/rateLimit';
import { sendTeamInvitationMail } from '@/lib/mail/teamInvitation';

/**
 * Lag-formasjons-actions for selv-påmelding (#199 chunks 8+9).
 *
 * Kapteinen lander på `/signup/[shortId]`, fyller ut lag-formen og
 * submitter. Server-action gjør authz, validering, og deretter:
 *
 *   1. Insert kaptein-rad i `game_registration_requests` med
 *      `is_team_captain = true` + `team_name`.
 *   2. For hver medspiller-slot:
 *      - "lookup"-mode: forventet å være en kjent bruker (e-post matcher
 *        `users`-tabellen). Insert child-request med `team_request_id`
 *        peker til kaptein. Notify dem med `team_invite`.
 *      - "email"-mode: ukjent e-post. Sjekk om brukeren tross alt finnes
 *        (degrader til lookup hvis ja). Hvis ikke → insert `invitations`-
 *        rad med `game_id` satt + 7-dagers expiry. Mail sendes i chunk 12.
 *   3. For `open`-modus: insert game_players-rad for kaptein + alle
 *      kjente medspillere (status='approved' → de er med i spillet).
 *      Team-slot tildeles deterministisk (laveste ledige 1..N).
 *
 * Per-medspiller-feil er ikke fatale: vi catch-er og logger, så et lag
 * med én ugyldig e-post fortsatt får opprettet de andre radene. Caller
 * får aggregert status tilbake.
 *
 * Design-beslutning for chunk 9: vi hooker IKKE `verifyCode` for team-
 * invites. I stedet detekterer `/signup/[shortId]/team`-siden om
 * brukeren har en pending `invitations`-rad for spillet og tilbyr en
 * "Bli med på lag"-knapp som attacher dem til kapteinens team-request.
 * Sidesteg tatt fordi `invitations` ikke har et `team_request_id`-felt;
 * å legge til det krever migrasjon, og verifyCode-hook-en ville måtte
 * gjette hvilken kaptein-request invitasjonen tilhører. Bedre å la
 * brukeren se UI-en og bekrefte selv.
 */

export type TeamSlotInput = {
  /** Hvordan kaptein har spesifisert denne slot-en. */
  mode: 'lookup' | 'email';
  /** Email-adressen brukeren oppgav (samme felt brukes for begge modi). */
  value: string;
};

export type TeamRegistrationInput = {
  shortId: string;
  teamName: string;
  slots: TeamSlotInput[];
  /** Honeypot — fylt = bot. */
  website?: string;
};

export type TeamSlotResult =
  | { ok: true; outcome: 'known_added' | 'unknown_invited'; email: string }
  | { ok: false; email: string; reason: string };

export type TeamRegistrationResult =
  | {
      ok: true;
      captainRequestId: string;
      slotResults: TeamSlotResult[];
    }
  | { ok: false; error: TeamRegistrationError };

export type TeamRegistrationError =
  | 'not_authed'
  | 'profile_incomplete'
  | 'game_not_found'
  | 'wrong_type'
  | 'wrong_mode'
  | 'game_locked'
  | 'mode_does_not_support_teams'
  | 'team_name_invalid'
  | 'slots_count_wrong'
  | 'duplicate_emails'
  | 'self_in_slots'
  | 'already_registered'
  | 'rate_limited'
  | 'db_error';

const TEAM_NAME_MIN = 3;
const TEAM_NAME_MAX = 40;

/**
 * Sjekk om PG-error er UNIQUE-violation (23505). Speiler logikken i
 * `actions.ts:isDuplicateError` — vi holder dem separate for at hver
 * action-fil er selvstendig lesbar (én navigasjon for hele flyten).
 */
function isDuplicateError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  return String(err.message ?? '')
    .toLowerCase()
    .includes('duplicate');
}

async function requireAuthedUser(
  shortId: string,
): Promise<{ id: string; email: string | null }> {
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
  return { id: user!.id, email: user!.email ?? null };
}

async function getCaptainDisplayName(userId: string): Promise<string> {
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
 * Resolve effective team size from `mode_config`. Texas scramble har
 * `team_size: 2 | 4`, best ball har `team_size: 2`. Hvis modi ikke
 * støtter team i det hele tatt, returnerer vi null så caller kan
 * signalisere mode_does_not_support_teams.
 */
function resolveTeamSize(
  modeConfig: { team_size?: number } | null | undefined,
): number | null {
  if (!modeConfig) return null;
  const size = modeConfig.team_size;
  if (typeof size !== 'number' || size < 2) return null;
  return size;
}

/**
 * Kaptein submitter lag-form. Returnerer aggregert resultat per slot;
 * suksess på kaptein-raden men feil på en medspiller ruller ikke tilbake
 * resten — vi får et lag med en åpen plass, som kaptein kan fylle senere
 * via team-dashboardet.
 *
 * Bruker ikke FormData i signaturen (men aksepterer FormData som tynn
 * shim i client-component-en) fordi slots-arrayet har struktur, og
 * FormData → JSON-roundtrip er klønete. Client-componenten kaller direkte
 * med strukturert input.
 */
export async function submitTeamRegistration(
  input: TeamRegistrationInput,
): Promise<TeamRegistrationResult> {
  const shortId = String(input.shortId ?? '').trim();
  const teamName = String(input.teamName ?? '').trim();
  const honeypot = String(input.website ?? '').trim();
  const slots = Array.isArray(input.slots) ? input.slots : [];

  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'submitTeamRegistration' });
    return {
      ok: true,
      captainRequestId: '00000000-0000-0000-0000-000000000000',
      slotResults: [],
    };
  }

  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'game_not_found' };
  }

  if (teamName.length < TEAM_NAME_MIN || teamName.length > TEAM_NAME_MAX) {
    return { ok: false, error: 'team_name_invalid' };
  }

  const captain = await requireAuthedUser(shortId);

  const game = await getGameByShortId(shortId);
  if (!game) {
    return { ok: false, error: 'game_not_found' };
  }
  if (game.registration_type !== 'team' && game.registration_type !== 'both') {
    return { ok: false, error: 'wrong_type' };
  }
  if (game.registration_mode === 'invite_only') {
    return { ok: false, error: 'wrong_mode' };
  }
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }
  if (!gameModeSupportsTeams(game.game_mode)) {
    return { ok: false, error: 'mode_does_not_support_teams' };
  }

  const teamSize = resolveTeamSize(game.mode_config);
  if (teamSize === null) {
    return { ok: false, error: 'mode_does_not_support_teams' };
  }

  // Kapteinen er én av de N spillerne — slots-arrayet er N-1.
  if (slots.length !== teamSize - 1) {
    return { ok: false, error: 'slots_count_wrong' };
  }

  // Rate-limit FØR vi gjør tunge DB-inserts. Ett lag-submit teller som én
  // påmelding — vi rate-limiter ikke per slot (en kaptein som inviterer 3
  // medspillere skal ikke bli straffet for å fylle laget). Per-spill-bucket
  // (50/24t) er den naturlige grensen for et helt arrangement.
  const ip = await getClientIp();
  const rateLimit = await consumeRegistrationRateLimit({
    userId: captain.id,
    ip,
    gameId: game.id,
  });
  if (!rateLimit.ok) {
    return { ok: false, error: 'rate_limited' };
  }

  // Normaliser e-poster og fang duplikater / kaptein-egen-e-post.
  const normalizedSlots = slots.map((s) => ({
    mode: s.mode,
    value: String(s.value ?? '').trim().toLowerCase(),
  }));

  const seen = new Set<string>();
  for (const slot of normalizedSlots) {
    if (!slot.value || !slot.value.includes('@')) {
      return { ok: false, error: 'team_name_invalid' };
    }
    if (seen.has(slot.value)) {
      return { ok: false, error: 'duplicate_emails' };
    }
    seen.add(slot.value);
    if (captain.email && slot.value === captain.email.toLowerCase()) {
      return { ok: false, error: 'self_in_slots' };
    }
  }

  const admin = getAdminClient();
  const captainStatus =
    game.registration_mode === 'open' ? 'approved' : 'pending';

  // INSERT kaptein-rad. UNIQUE (game_id, user_id) fanger dobbel-submit.
  const { data: captainRow, error: captainError } = await admin
    .from('game_registration_requests')
    .insert({
      game_id: game.id,
      user_id: captain.id,
      status: captainStatus,
      team_name: teamName,
      is_team_captain: true,
      team_request_id: null,
      decided_at: captainStatus === 'approved' ? new Date().toISOString() : null,
      decided_by_user_id: captainStatus === 'approved' ? captain.id : null,
    })
    .select('id')
    .single<{ id: string }>();

  if (captainError) {
    if (isDuplicateError(captainError)) {
      return { ok: false, error: 'already_registered' };
    }
    console.error('[submitTeamRegistration] captain insert failed', captainError);
    return { ok: false, error: 'db_error' };
  }
  const captainRequestId = captainRow!.id;

  const captainName = await getCaptainDisplayName(captain.id);

  // For open-modus: tildel team_number deterministisk (laveste ledige) og
  // sett kapteinen i game_players umiddelbart. Manual_approval venter på
  // admin via det eksisterende approveRequest-action-et.
  let assignedTeamNumber: number | null = null;
  if (captainStatus === 'approved') {
    const { data: existingTeams } = await admin
      .from('game_players')
      .select('team_number')
      .eq('game_id', game.id)
      .not('team_number', 'is', null)
      .returns<{ team_number: number }[]>();
    const taken = new Set((existingTeams ?? []).map((r) => r.team_number));
    for (let slot = 1; slot <= 50; slot += 1) {
      if (!taken.has(slot)) {
        assignedTeamNumber = slot;
        break;
      }
    }
    if (assignedTeamNumber === null) {
      console.error('[submitTeamRegistration] no free team slot');
      return { ok: false, error: 'db_error' };
    }

    const { error: captainPlayerError } = await admin
      .from('game_players')
      .upsert(
        {
          game_id: game.id,
          user_id: captain.id,
          team_number: assignedTeamNumber,
          flight_number: assignedTeamNumber,
          course_handicap: null,
        },
        { onConflict: 'game_id,user_id', ignoreDuplicates: true },
      );
    if (captainPlayerError) {
      console.error(
        '[submitTeamRegistration] captain game_players insert failed',
        captainPlayerError,
      );
      // Ikke fatal — kaptein-raden i game_registration_requests er på
      // plass, admin kan plukke opp manuelt. Returnerer suksess.
    }
  }

  // Per-slot-løkke. Hver slot håndteres separat så feil på én ikke
  // ruller tilbake resten.
  const slotResults: TeamSlotResult[] = [];
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const slot of normalizedSlots) {
    try {
      // Lookup-mode betyr kaptein har valgt en kjent bruker via UI-en;
      // email-mode betyr fri-tekst-input. Vi gjør samme lookup i begge
      // tilfeller — i email-mode degraderer vi til "kjent" hvis brukeren
      // tross alt eksisterer, ellers oppretter vi invitations-rad.
      const existingUser = await lookupUserByEmail(slot.value);

      if (slot.mode === 'lookup' && !existingUser) {
        slotResults.push({
          ok: false,
          email: slot.value,
          reason: 'Bruker ikke funnet',
        });
        continue;
      }

      if (existingUser) {
        // Kjent bruker → child-request, samme status som kaptein.
        const { error: childError } = await admin
          .from('game_registration_requests')
          .insert({
            game_id: game.id,
            user_id: existingUser.id,
            status: captainStatus,
            team_name: teamName,
            is_team_captain: false,
            team_request_id: captainRequestId,
            decided_at:
              captainStatus === 'approved' ? new Date().toISOString() : null,
            decided_by_user_id:
              captainStatus === 'approved' ? captain.id : null,
          });

        if (childError) {
          if (isDuplicateError(childError)) {
            slotResults.push({
              ok: false,
              email: slot.value,
              reason: 'Allerede påmeldt',
            });
            continue;
          }
          console.error(
            '[submitTeamRegistration] child insert failed',
            childError,
          );
          slotResults.push({
            ok: false,
            email: slot.value,
            reason: 'DB-feil',
          });
          continue;
        }

        // Open-modus: legg kjent medspiller i game_players umiddelbart.
        if (captainStatus === 'approved' && assignedTeamNumber !== null) {
          const { error: playerError } = await admin
            .from('game_players')
            .upsert(
              {
                game_id: game.id,
                user_id: existingUser.id,
                team_number: assignedTeamNumber,
                flight_number: assignedTeamNumber,
                course_handicap: null,
              },
              { onConflict: 'game_id,user_id', ignoreDuplicates: true },
            );
          if (playerError) {
            console.error(
              '[submitTeamRegistration] player upsert failed',
              playerError,
            );
            // Notifiser uansett — request-raden er der.
          }
        }

        // Best-effort notify. Mail-backup i chunk 12.
        await notifyInvitedToTeam({
          recipientUserId: existingUser.id,
          gameId: game.id,
          gameShortId: game.short_id,
          gameName: game.name,
          teamRequestId: captainRequestId,
          teamName,
          invitedByName: captainName,
        });

        slotResults.push({
          ok: true,
          outcome: 'known_added',
          email: slot.value,
        });
      } else {
        // Ukjent e-post → invitations-rad. Upsert via insert + ignore-
        // duplicates på (email, game_id) hvis policy tillater; her bruker
        // vi vanlig insert og swallow-er duplicate som "ok".
        const { error: invError } = await admin.from('invitations').insert({
          email: slot.value,
          token: crypto.randomUUID(),
          expires_at: expiresAt,
          invited_by: captain.id,
          game_id: game.id,
        });
        if (invError && !isDuplicateError(invError)) {
          console.error(
            '[submitTeamRegistration] invitation insert failed',
            invError,
          );
          slotResults.push({
            ok: false,
            email: slot.value,
            reason: 'Kunne ikke sende invitasjon',
          });
          continue;
        }

        // Mail til ukjent e-post. Alltid-send fordi recipient ikke har
        // konto, så last_seen_at-terskel gir ingen mening. Best-effort —
        // mail-feil ruller ikke tilbake invitations-raden (admin kan
        // re-sende via «Send påminnelse»).
        await sendTeamInvitationMail({
          to: slot.value,
          captainName,
          gameName: game.name,
          teamName,
          gameShortId: game.short_id,
        }).catch((err) =>
          console.error('[submitTeamRegistration] team mail failed', err),
        );

        slotResults.push({
          ok: true,
          outcome: 'unknown_invited',
          email: slot.value,
        });
      }
    } catch (err) {
      console.error('[submitTeamRegistration] slot threw', err);
      slotResults.push({
        ok: false,
        email: slot.value,
        reason: 'Uventet feil',
      });
    }
  }

  // Notify admin (game.created_by) når vi er i manual_approval-modus så
  // de vet at en ny forespørsel ligger og venter. For open-modus hopper
  // vi over — admin trenger ingen handling, og påmeldinger kan komme
  // i flokk; vi vil ikke spamme innboksen.
  if (game.created_by && captainStatus === 'pending') {
    await notify({
      userId: game.created_by,
      kind: 'registration_request',
      payload: {
        game_id: game.id,
        game_name: game.name,
        requester_name: `${captainName} (kaptein for ${teamName})`,
        request_id: captainRequestId,
      },
    }).catch((err) =>
      console.error('[submitTeamRegistration] admin notify failed', err),
    );
  }

  revalidateTag(`game-${game.id}`, 'max');

  return {
    ok: true,
    captainRequestId,
    slotResults,
  };
}

/**
 * Medspiller aksepterer team-invite. Insert game_players-rad og oppdater
 * request-status til approved (om den var pending, eller no-op om allerede
 * approved fra open-modus).
 *
 * Kalles fra `/signup/[shortId]/team`-siden av medspilleren selv.
 */
export type AcceptDeclineResult =
  | { ok: true }
  | { ok: false; error: 'not_authed' | 'not_found' | 'game_locked' | 'db_error' };

export async function acceptTeamInvite(
  requestId: string,
  shortId: string,
): Promise<AcceptDeclineResult> {
  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId);
  const admin = getAdminClient();

  const { data: req, error: reqError } = await admin
    .from('game_registration_requests')
    .select(
      'id, game_id, user_id, status, team_request_id, team_name, is_team_captain',
    )
    .eq('id', requestId)
    .maybeSingle<{
      id: string;
      game_id: string;
      user_id: string;
      status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
      team_request_id: string | null;
      team_name: string | null;
      is_team_captain: boolean;
    }>();

  if (reqError || !req || req.user_id !== user.id) {
    return { ok: false, error: 'not_found' };
  }
  if (req.status === 'rejected' || req.status === 'withdrawn') {
    return { ok: false, error: 'not_found' };
  }

  const game = await getGameByShortId(shortId);
  if (!game || game.id !== req.game_id) {
    return { ok: false, error: 'not_found' };
  }
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }

  // Hent kapteinens team_number fra game_players hvis det finnes (open-
  // modus eller kaptein er allerede approved). Hvis ikke, fall tilbake
  // til auto-tildeling (manual_approval pre-approve).
  let teamNumber: number | null = null;
  if (req.team_request_id) {
    const { data: captainReqRow } = await admin
      .from('game_registration_requests')
      .select('user_id')
      .eq('id', req.team_request_id)
      .maybeSingle<{ user_id: string }>();
    if (captainReqRow?.user_id) {
      const { data: captainPlayer } = await admin
        .from('game_players')
        .select('team_number')
        .eq('game_id', game.id)
        .eq('user_id', captainReqRow.user_id)
        .maybeSingle<{ team_number: number | null }>();
      teamNumber = captainPlayer?.team_number ?? null;
    }
  }

  if (teamNumber === null) {
    const { data: existingTeams } = await admin
      .from('game_players')
      .select('team_number')
      .eq('game_id', game.id)
      .not('team_number', 'is', null)
      .returns<{ team_number: number }[]>();
    const taken = new Set((existingTeams ?? []).map((r) => r.team_number));
    for (let slot = 1; slot <= 50; slot += 1) {
      if (!taken.has(slot)) {
        teamNumber = slot;
        break;
      }
    }
  }

  const decidedAt = new Date().toISOString();
  if (req.status === 'pending') {
    const { error: updateError } = await admin
      .from('game_registration_requests')
      .update({
        status: 'approved',
        decided_at: decidedAt,
        decided_by_user_id: user.id,
      })
      .eq('id', req.id);
    if (updateError) {
      console.error('[acceptTeamInvite] update failed', updateError);
      return { ok: false, error: 'db_error' };
    }
  }

  const { error: playerError } = await admin.from('game_players').upsert(
    {
      game_id: game.id,
      user_id: user.id,
      team_number: teamNumber,
      flight_number: teamNumber,
      course_handicap: null,
    },
    { onConflict: 'game_id,user_id', ignoreDuplicates: true },
  );
  if (playerError) {
    console.error('[acceptTeamInvite] player upsert failed', playerError);
    return { ok: false, error: 'db_error' };
  }

  revalidateTag(`game-${game.id}`, 'max');
  return { ok: true };
}

/**
 * Medspiller avslår team-invite. Setter status='rejected' på egen rad og
 * notify-er kapteinen via `team_member_withdrew`-kind.
 */
export async function declineTeamInvite(
  requestId: string,
  shortId: string,
): Promise<AcceptDeclineResult> {
  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId);
  const admin = getAdminClient();

  const { data: req } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, status, team_request_id, team_name')
    .eq('id', requestId)
    .maybeSingle<{
      id: string;
      game_id: string;
      user_id: string;
      status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
      team_request_id: string | null;
      team_name: string | null;
    }>();

  if (!req || req.user_id !== user.id || req.status === 'rejected') {
    return { ok: false, error: 'not_found' };
  }

  const game = await getGameByShortId(shortId);
  if (!game || game.id !== req.game_id) {
    return { ok: false, error: 'not_found' };
  }
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }

  const { error: updateError } = await admin
    .from('game_registration_requests')
    .update({
      status: 'rejected',
      decided_at: new Date().toISOString(),
      decided_by_user_id: user.id,
    })
    .eq('id', req.id);
  if (updateError) {
    console.error('[declineTeamInvite] update failed', updateError);
    return { ok: false, error: 'db_error' };
  }

  // Hvis brukeren allerede var i game_players (open-modus), fjern dem.
  await admin
    .from('game_players')
    .delete()
    .eq('game_id', game.id)
    .eq('user_id', user.id);

  // Notify kaptein. Best-effort. Kapteinens user_id finner vi via
  // team_request_id-pekeren.
  if (req.team_request_id) {
    const { data: captainReq } = await admin
      .from('game_registration_requests')
      .select('user_id, team_name')
      .eq('id', req.team_request_id)
      .maybeSingle<{ user_id: string; team_name: string | null }>();
    if (captainReq) {
      const declinerName = await getCaptainDisplayName(user.id);
      await notify({
        userId: captainReq.user_id,
        kind: 'team_member_withdrew',
        payload: {
          game_id: game.id,
          game_short_id: game.short_id,
          game_name: game.name,
          withdrawn_player_name: declinerName,
          team_name: captainReq.team_name ?? req.team_name ?? 'Laget',
        },
      }).catch((err) =>
        console.error('[declineTeamInvite] notify failed', err),
      );
    }
  }

  revalidateTag(`game-${game.id}`, 'max');
  return { ok: true };
}

/**
 * Kaptein fjerner en medspiller fra laget pre-start. Sletter child-
 * request-raden + tilhørende game_players-rad. Notify-er den fjernede
 * spilleren om at de er ute.
 *
 * Self-withdraw (medspiller fjerner seg selv) implementeres i chunk 11
 * — denne action-en er kaptein-only.
 */
export async function removeTeamMember(
  childRequestId: string,
  shortId: string,
): Promise<AcceptDeclineResult> {
  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId);
  const admin = getAdminClient();

  const { data: child } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, team_request_id, status')
    .eq('id', childRequestId)
    .maybeSingle<{
      id: string;
      game_id: string;
      user_id: string;
      team_request_id: string | null;
      status: string;
    }>();

  if (!child || !child.team_request_id) {
    return { ok: false, error: 'not_found' };
  }

  // Verifiser at den autentiserte brukeren er kaptein for det laget.
  const { data: captainReq } = await admin
    .from('game_registration_requests')
    .select('user_id, team_name')
    .eq('id', child.team_request_id)
    .maybeSingle<{ user_id: string; team_name: string | null }>();
  if (!captainReq || captainReq.user_id !== user.id) {
    return { ok: false, error: 'not_found' };
  }

  const game = await getGameByShortId(shortId);
  if (!game || game.id !== child.game_id) {
    return { ok: false, error: 'not_found' };
  }
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }

  // Slett child request-rad og game_players-rad.
  const { error: deleteReqError } = await admin
    .from('game_registration_requests')
    .delete()
    .eq('id', child.id);
  if (deleteReqError) {
    console.error('[removeTeamMember] request delete failed', deleteReqError);
    return { ok: false, error: 'db_error' };
  }
  await admin
    .from('game_players')
    .delete()
    .eq('game_id', game.id)
    .eq('user_id', child.user_id);

  // Notify den fjernede spilleren — bruker registration_rejected-kind
  // som dekker semantikken "du er ikke med lenger".
  await notify({
    userId: child.user_id,
    kind: 'registration_rejected',
    payload: {
      game_id: game.id,
      game_name: game.name,
      reason: 'Kapteinen fjernet deg fra laget.',
    },
  }).catch((err) =>
    console.error('[removeTeamMember] notify failed', err),
  );

  revalidateTag(`game-${game.id}`, 'max');
  return { ok: true };
}

/**
 * Chunk-9-flyten: en ukjent bruker klikket team-invitasjons-mail, fullførte
 * OTP-login og landet på `/signup/[shortId]/team`. De har en åpen
 * `invitations`-rad med `game_id` satt, men ingen `game_registration_requests`-
 * rad (kapteinen kunne ikke lage en uten user_id).
 *
 * Denne action-en finner kapteinen for spillet (det laget brukerens
 * e-post er knyttet til via mail-invitasjonen) og oppretter request-raden
 * retrospektivt. Hvis det er flere kapteiner med ledig plass, plukker vi
 * den nyeste — eller bare den som faktisk har en åpen slot. Edge-case
 * (flere kapteiner inviterte samme person) er sjelden nok at vi tar
 * den nyeste; admin kan fikse manuelt hvis det blir et problem.
 *
 * Hvorfor ikke gjøre dette i verifyCode-hook-en? `invitations`-tabellen
 * har ikke `team_request_id`-felt — vi vet at e-posten ble invitert til
 * et spill, men ikke til hvilket lag. Å gjette i auth-hook-en gir feil
 * UX hvis det er ambiguity; bedre å la brukeren se UI-en og bekrefte.
 */
export async function attachToCaptainTeam(
  invitationId: string,
  shortId: string,
): Promise<AcceptDeclineResult> {
  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId);
  const admin = getAdminClient();

  const game = await getGameByShortId(shortId);
  if (!game) {
    return { ok: false, error: 'not_found' };
  }
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }

  // Verifiser at invitations-raden tilhører denne brukeren (matching email).
  const { data: invitation } = await admin
    .from('invitations')
    .select('id, email, game_id')
    .eq('id', invitationId)
    .maybeSingle<{ id: string; email: string; game_id: string | null }>();
  if (!invitation || invitation.game_id !== game.id) {
    return { ok: false, error: 'not_found' };
  }
  // E-post-match (admin-client returnerer rad uten å sjekke RLS — vi
  // verifiserer eierskap manuelt).
  const { data: userRow } = await admin
    .from('users')
    .select('email')
    .eq('id', user.id)
    .maybeSingle<{ email: string }>();
  if (
    !userRow?.email ||
    userRow.email.toLowerCase() !== invitation.email.toLowerCase()
  ) {
    return { ok: false, error: 'not_found' };
  }

  // Finn nyeste kaptein-request for dette spillet (heuristikk for ambiguity).
  const { data: captains } = await admin
    .from('game_registration_requests')
    .select('id, user_id, team_name, status')
    .eq('game_id', game.id)
    .eq('is_team_captain', true)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<
      {
        id: string;
        user_id: string;
        team_name: string | null;
        status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
      }[]
    >();
  const captain = captains?.[0];
  if (!captain) {
    return { ok: false, error: 'not_found' };
  }

  // Match kapteinens status — open-modus betyr approved (vi er straks med),
  // manual_approval betyr pending (vi venter på admin med resten av laget).
  const childStatus = captain.status;
  const decidedAt =
    childStatus === 'approved' ? new Date().toISOString() : null;

  const { data: inserted, error: insertError } = await admin
    .from('game_registration_requests')
    .insert({
      game_id: game.id,
      user_id: user.id,
      status: childStatus,
      team_name: captain.team_name,
      is_team_captain: false,
      team_request_id: captain.id,
      decided_at: decidedAt,
      decided_by_user_id:
        childStatus === 'approved' ? captain.user_id : null,
    })
    .select('id')
    .single<{ id: string }>();

  if (insertError) {
    if (isDuplicateError(insertError)) {
      // Allerede attached i en parallel tab — behandle som suksess.
      return { ok: true };
    }
    console.error('[attachToCaptainTeam] insert failed', insertError);
    return { ok: false, error: 'db_error' };
  }

  // For open-modus: legg brukeren i game_players umiddelbart.
  if (childStatus === 'approved') {
    const { data: captainPlayer } = await admin
      .from('game_players')
      .select('team_number')
      .eq('game_id', game.id)
      .eq('user_id', captain.user_id)
      .maybeSingle<{ team_number: number | null }>();
    const teamNumber = captainPlayer?.team_number ?? null;

    const { error: playerError } = await admin.from('game_players').upsert(
      {
        game_id: game.id,
        user_id: user.id,
        team_number: teamNumber,
        flight_number: teamNumber,
        course_handicap: null,
      },
      { onConflict: 'game_id,user_id', ignoreDuplicates: true },
    );
    if (playerError) {
      console.error('[attachToCaptainTeam] player upsert failed', playerError);
    }
  }

  // Marker invitations-raden som akseptert.
  await admin
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  // Notify kapteinen om at medspiller har akseptert.
  await notify({
    userId: captain.user_id,
    kind: 'registration_approved',
    payload: {
      game_id: game.id,
      game_name: game.name,
    },
  }).catch((err) =>
    console.error('[attachToCaptainTeam] notify failed', err),
  );

  // Vi bruker requestId for å returnere noe meningsfullt — caller ignorerer.
  void inserted;
  revalidateTag(`game-${game.id}`, 'max');
  return { ok: true };
}

/**
 * Re-send team_invite-notifikasjon til en pending medspiller. Brukes fra
 * captain-dashboardet når en medspiller ikke har akseptert ennå og
 * kapteinen ønsker å pirke på dem.
 */
export async function resendTeamInvite(
  childRequestId: string,
  shortId: string,
): Promise<AcceptDeclineResult> {
  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const user = await requireAuthedUser(shortId);
  const admin = getAdminClient();

  const { data: child } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, team_request_id, team_name, status')
    .eq('id', childRequestId)
    .maybeSingle<{
      id: string;
      game_id: string;
      user_id: string;
      team_request_id: string | null;
      team_name: string | null;
      status: string;
    }>();

  if (!child || !child.team_request_id) {
    return { ok: false, error: 'not_found' };
  }

  const { data: captainReq } = await admin
    .from('game_registration_requests')
    .select('user_id, team_name')
    .eq('id', child.team_request_id)
    .maybeSingle<{ user_id: string; team_name: string | null }>();
  if (!captainReq || captainReq.user_id !== user.id) {
    return { ok: false, error: 'not_found' };
  }

  const game = await getGameByShortId(shortId);
  if (!game || game.id !== child.game_id) {
    return { ok: false, error: 'not_found' };
  }

  const captainName = await getCaptainDisplayName(user.id);
  await notifyInvitedToTeam({
    recipientUserId: child.user_id,
    gameId: game.id,
    gameShortId: game.short_id,
    gameName: game.name,
    teamRequestId: child.team_request_id,
    teamName: captainReq.team_name ?? child.team_name ?? 'Laget',
    invitedByName: captainName,
  });

  return { ok: true };
}
