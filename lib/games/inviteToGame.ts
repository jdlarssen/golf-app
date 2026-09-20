import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { gameInviteExpiresAtFromNow } from '@/lib/auth/inviteExpiry';
import { isDisposableEmailDomain } from '@/lib/auth/disposableEmail';
import { getInviteEligibleIds } from '@/lib/games/inviteEligibility';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';
import { organizerPlayerCap } from '@/lib/games/teamFormatLimits';
import { expireGameCache } from '@/lib/games/expireGameCache';

// E-post-invitasjons-kjernen (#1919): ett hjem for «arrangøren inviterer en
// e-post inn i en runde».
//
// Regelen bodde inni server-action-en `inviteEmailToGame`
// (`app/[locale]/admin/games/[id]/inviteToGameActions.ts`), og hver eneste gren
// endte i `redirect()` — altså ikke kallbar fra en HTTP-rute. Da appen skulle få
// samme handling via `app/api/games/[id]/invite`, ville en kopi gitt regelen to
// hjem (AGENTS trap 4). Presedensen er `lib/games/remindUnsubmitted.ts` (#1891)
// og `lib/games/withdrawSelf.ts` (#1917), som gjorde den samme reisen.
//
// **Authz ligger hos kalleren.** Modulen spør ALDRI hvem som ringer: den har
// ingen sesjon å spørre om. Hver kaller må ha gatet FØR den kaller hit —
//   - server-action: `requireAdminOrCreator` (redirect til / uten tilgang)
//   - HTTP-rute: `authenticatedUserId` + `gameOrganiserAccess` (lib/api/appAuth)
// Ny kaller uten en slik port = et endepunkt der hvem som helst kan invitere seg
// inn i en fremmed runde. Det er den ene feilen denne fila kan gjøre mulig.
//
// ⚠️ **`isAdmin` og `inviterUserId` ER venne-/klubb-porten på rute-stien.**
// Webben leser med sin RLS-klient, så 0072-policyene står som et andre lag der.
// Ruta sender service-role-klienten, og da no-op-er 0115-triggeren (`auth.uid()`
// er NULL under service-role). Da er `getInviteEligibleIds`-sjekken under den
// ENESTE håndhevelsen av scopingen. Begge parametrene må alltid være ekte.
//
// **Klienten sendes inn, den hentes ikke.** Webben beholder sine RLS-skrivinger
// (minst mulig blast-radius på en flate som er i produksjon); ruta sender
// `getAdminClient()`. Ett unntak står igjen med et eksplisitt `getAdminClient()`
// i koden: frist-forlengelsen på en åpen invitasjon, fordi den eneste
// UPDATE-policyen på `invitations` er «self mark accepted» — en ikke-admin
// arrangørs bruker-klient ville truffet 0 rader (AGENTS trap 2/3).
//
// **`expireGameCache` hører til her**, ikke hos kallerne: en revalidering ÉN av
// to kallere glemmer er en stille feil (samme presedens som
// `lib/games/withdrawSelf.ts` og `lib/games/endGameCore.ts`). Begge kallstedene
// kjører i Next-runtime; en test som kaller hit må `vi.mock('next/cache')`.

/**
 * Hvorfor invitasjonen ikke gikk gjennom.
 *
 * Kodene er kjernens eget vokabular. Webbens query-verdier (`invite_invalid_email`
 * med prefiks, resten uten) bor i skall-action-en, og wire-kodene i ruta —
 * ingen av dem skrives av her.
 */
export type InviteRefusal =
  | 'invalid_email'
  | 'disposable_email'
  | 'not_found'
  | 'game_locked'
  | 'game_full'
  | 'invite_not_allowed'
  | 'db_players'
  | 'invite_failed'
  | 'mail_failed';

/**
 * `added` = e-posten tilhørte en registrert bruker, som nå står på rosteret
 * (ingen mail — de er i appen, og `notifyInvitedToGame` fyrte).
 * `sent` = `invitations`-raden finnes og Resend-mailen gikk ut.
 */
export type InviteOutcome =
  | { ok: true; kind: 'added' | 'sent'; email: string }
  | { ok: false; reason: InviteRefusal };

type GameSnapshot = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  game_mode: string;
  group_id: string | null;
  mode_config: { team_size?: number } | null;
};

/**
 * Adressen slik resten av flyten ser den: trimmet og små bokstaver.
 *
 * Eksportert fordi skall-action-en bygger redirect-URL-en med den samme
 * adressen som kjernen skrev til databasen — normaliseringen skal ikke skje to
 * steder med to resultater.
 */
export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Inviter en e-post inn i en runde.
 *
 * To grener, nøyaktig som før flyttingen:
 *  - Adressen tilhører en registrert bruker → rett på rosteret, ingen mail.
 *  - Ukjent adresse → `invitations`-rad + spill-spesifikk Resend-mail.
 *
 * Idempotent begge veier: en duplikat `game_players`-rad svelges uten ny
 * notify, og en åpen invitasjon for samme (adresse, spill) får fristen forlenget
 * og mailen sendt på nytt i stedet for en ny rad.
 */
export async function inviteEmailToGameCore(params: {
  client: SupabaseClient<Database>;
  gameId: string;
  inviterUserId: string;
  /** Visningsnavnet i mailen. `null` faller til rolle-fallbacken. */
  inviterName: string | null;
  isAdmin: boolean;
  rawEmail: string;
}): Promise<InviteOutcome> {
  const { client, gameId, inviterUserId, inviterName, isAdmin } = params;

  const email = normalizeInviteEmail(params.rawEmail);
  if (!email || !email.includes('@')) {
    return { ok: false, reason: 'invalid_email' };
  }

  // Disposable-domener blokkeres for arrangører som ikke er admin (#422).
  // Admin og trusted-creators er bevisst u-guardet (kurator-modellen — de
  // inviterer folk de allerede har avklart med).
  if (!isAdmin && isDisposableEmailDomain(email)) {
    return { ok: false, reason: 'disposable_email' };
  }

  const game = await loadGameForInvite(client, gameId);
  if (!game) return { ok: false, reason: 'not_found' };

  if (game.status === 'active' || game.status === 'finished') {
    return { ok: false, reason: 'game_locked' };
  }

  if (await isFull(client, game)) {
    return { ok: false, reason: 'game_full' };
  }

  // Eksisterende bruker? Da går vi rett til picker-add-stien.
  const { data: existingUser } = await client
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle<{ id: string }>();

  if (existingUser) {
    return addExistingUser({
      client,
      gameId,
      inviterUserId,
      isAdmin,
      email,
      groupId: game.group_id,
      recipientUserId: existingUser.id,
    });
  }

  return inviteUnknownEmail({
    client,
    gameId,
    inviterUserId,
    inviterName,
    isAdmin,
    email,
    game,
  });
}

/**
 * Grenen der adressen alt har en konto: samme skriving som picker-add.
 *
 * Venne-/klubb-scopingen (#906, felle #3 — server er den egentlige authz) står
 * her og ikke i ukjent-adresse-grenen under, med vilje: å invitere en ny e-post
 * ER venne-anskaffelses-stien, mens å legge til en eksisterende konto er det
 * samme som å plukke den fra lista. Admin er unntatt (kurator-modellen); seg
 * selv er alltid lov.
 */
async function addExistingUser(args: {
  client: SupabaseClient<Database>;
  gameId: string;
  inviterUserId: string;
  isAdmin: boolean;
  email: string;
  groupId: string | null;
  recipientUserId: string;
}): Promise<InviteOutcome> {
  const { client, gameId, inviterUserId, isAdmin, email, recipientUserId } = args;

  if (!isAdmin && recipientUserId !== inviterUserId) {
    const eligible = await getInviteEligibleIds(inviterUserId, args.groupId);
    if (!eligible.has(recipientUserId)) {
      return { ok: false, reason: 'invite_not_allowed' };
    }
  }

  const { error: insertError } = await client.from('game_players').insert({
    game_id: gameId,
    user_id: recipientUserId,
    team_number: null,
    flight_number: null,
    course_handicap: null,
    // #463: arrangør legger til en annen bruker → ikke bekreftet ennå.
    accepted_at: null,
  });

  // Idempotent: hvis spilleren allerede er på rosteren (UNIQUE-violation
  // på (game_id, user_id)) returnerer Postgres '23505'. Da swallow vi —
  // intensjonen var allerede oppfylt, men vi skal ikke fyre en ny notify.
  const duplicate =
    insertError != null &&
    (insertError.code === '23505' ||
      String(insertError.message ?? '').toLowerCase().includes('duplicate'));

  if (insertError && !duplicate) {
    console.error('[inviteToGameCore] existing-user insert failed', insertError);
    return { ok: false, reason: 'db_players' };
  }

  if (!duplicate && recipientUserId !== inviterUserId) {
    await notifyInvitedToGame({ recipientUserId, gameId, inviterUserId });
  }

  expireGameCache(gameId);
  return { ok: true, kind: 'added', email };
}

/** Grenen der adressen ikke har en konto: `invitations`-rad + mail. */
async function inviteUnknownEmail(args: {
  client: SupabaseClient<Database>;
  gameId: string;
  inviterUserId: string;
  inviterName: string | null;
  isAdmin: boolean;
  email: string;
  game: GameSnapshot;
}): Promise<InviteOutcome> {
  const { client, gameId, inviterUserId, inviterName, isAdmin, email, game } = args;
  const invitedByName = inviterName?.trim() || (isAdmin ? 'Admin' : 'En arrangør');

  const { data: existingInvite } = await client
    .from('invitations')
    .select('id, token, expires_at')
    .ilike('email', email)
    .eq('game_id', gameId)
    .is('accepted_at', null)
    .maybeSingle<{ id: string; token: string; expires_at: string }>();

  if (existingInvite) {
    // «Send på nytt» means «give this person a fresh chance» (#1381/#1613):
    // push the deadline out a full TTL BEFORE mailing, so an expired-but-
    // unaccepted invitation never produces a mail the login gate refuses
    // (email_is_invited requires expires_at > now(), migration 0100). The
    // write goes through the admin client: the only invitations UPDATE
    // policy is «self mark accepted», so a non-admin organiser's user-client
    // write would silently match 0 rows (AGENTS.md trap 2/3); authz for this
    // path is the caller's gate.
    const freshExpiresAt = gameInviteExpiresAtFromNow();
    try {
      expectAffected(
        await getAdminClient()
          .from('invitations')
          .update({ expires_at: freshExpiresAt })
          .eq('id', existingInvite.id)
          .is('accepted_at', null)
          .select('id'),
        'inviteEmailToGameCore.extendExpiry',
      );
    } catch (extendError) {
      // Plain Error on a DB refusal, NoRowsAffectedError when the row was
      // accepted or deleted between the read and the write. Either way: no
      // mail without a valid deadline — the organiser gets the error banner.
      console.error('[inviteToGameCore] expiry extend failed', extendError);
      return { ok: false, reason: 'invite_failed' };
    }

    // Re-send the notification mail best-effort so a retry by the organiser
    // always delivers — covers the case where the original send silently
    // dropped (Resend error, spam filter, etc.) without the row being rolled
    // back. Errors here are swallowed: the invitation row already exists and
    // we don't want to confuse the organiser with a spurious error state.
    try {
      await sendInviteNotification({
        to: email,
        invitedByName,
        gameName: game.name,
        gameMode: game.game_mode,
        inviteToken: existingInvite.token,
        expiresAt: freshExpiresAt,
      });
    } catch (retryErr) {
      console.error('[inviteToGameCore] retry mail failed (best-effort)', retryErr);
    }

    expireGameCache(gameId);
    return { ok: true, kind: 'sent', email };
  }

  const expiresAt = gameInviteExpiresAtFromNow();
  const inviteToken = randomUUID();
  const { data: insertedInvitation, error: insertError } = await client
    .from('invitations')
    .insert({
      email,
      token: inviteToken,
      invited_by: inviterUserId,
      game_id: gameId,
      expires_at: expiresAt,
    })
    .select('id')
    .single<{ id: string }>();
  if (insertError) {
    console.error('[inviteToGameCore] invitations insert failed', insertError);
    return { ok: false, reason: 'invite_failed' };
  }

  try {
    await sendInviteNotification({
      to: email,
      invitedByName,
      gameName: game.name,
      gameMode: game.game_mode,
      inviteToken,
      expiresAt,
    });
  } catch (err) {
    console.error('[inviteToGameCore] mail failed', err);
    // Roll back the just-inserted invitations row so the organiser can retry
    // the same email address and get a fresh insert + send. Without this,
    // the idempotent check at the top of this branch finds the orphaned row
    // and silently short-circuits without ever sending the mail — stranding
    // the invitee permanently.
    //
    // Scoped by primary key (row id returned from INSERT … RETURNING) to avoid
    // accidentally deleting a concurrently inserted pending invite for the same
    // email + game (#705).
    if (insertedInvitation?.id) {
      const { error: deleteErr } = await client
        .from('invitations')
        .delete()
        .eq('id', insertedInvitation.id);
      if (deleteErr) {
        console.error('[inviteToGameCore] rollback delete failed', deleteErr);
      }
    }
    return { ok: false, reason: 'mail_failed' };
  }

  expireGameCache(gameId);
  return { ok: true, kind: 'sent', email };
}

/**
 * Spillet, eller `null` når det ikke finnes.
 *
 * Error ≠ absence (#1445): en forbigående spørrings-feil KASTER — til rutas 500
 * eller sidens error-boundary, begge retryable — i stedet for å påstå at spillet
 * ikke finnes. Bare et ekte 0-rads-svar blir `null`.
 */
async function loadGameForInvite(
  client: SupabaseClient<Database>,
  gameId: string,
): Promise<GameSnapshot | null> {
  const { data, error } = await client
    .from('games')
    .select('id, name, status, game_mode, group_id, mode_config')
    .eq('id', gameId)
    .maybeSingle<GameSnapshot>();

  if (error) {
    console.error('[inviteToGameCore] game fetch failed', { gameId, error });
    throw error;
  }
  return data ?? null;
}

/**
 * Format-taket for arrangørens legg-til-stier (#2059): taket påmeldings-lenka
 * leser (`organizerPlayerCap`), talt over IKKE-trukne spillere så en trukket
 * spiller aldri får runden til å se full ut. Håndheves bare her — det finnes
 * ingen DB-constraint bak den, så to faner som legger til samtidig kan passere.
 */
async function isFull(
  client: SupabaseClient<Database>,
  game: GameSnapshot,
): Promise<boolean> {
  const cap = organizerPlayerCap(game.game_mode, game.mode_config);
  if (cap === null) return false;
  const { count } = await client
    .from('game_players')
    .select('user_id', { count: 'exact', head: true })
    .eq('game_id', game.id)
    .is('withdrawn_at', null);
  return (count ?? 0) >= cap;
}
