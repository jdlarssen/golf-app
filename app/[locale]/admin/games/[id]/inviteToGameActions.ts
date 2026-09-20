'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { getInviteEligibleIds } from '@/lib/games/inviteEligibility';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import { organizerPlayerCap } from '@/lib/games/teamFormatLimits';
import {
  inviteEmailToGameCore,
  normalizeInviteEmail,
  type InviteRefusal,
} from '@/lib/games/inviteToGame';

type GameSnapshot = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  game_mode: string;
  group_id: string | null;
  mode_config: { team_size?: number } | null;
};

/**
 * Picker-add: legg en eksisterende registrert spiller til et game-roster.
 * Brukes fra «Inviter spillere»-card på `/admin/games/[id]` (admin) og fra
 * arrangør-flaten `/games/[id]/spillere` (oppretter, #429). Idempotent —
 * UNIQUE-violation på (game_id, user_id) swallow-es slik at race-condition
 * mellom to faner ikke produserer en feilmelding.
 *
 * Notify fyrer best-effort etter at game_players-insertet er commitet.
 * Spilleren får bell-prikk uten å måtte aksepte noe — curator-modellen
 * forutsetter at arrangøren har avklart deltakelse på forhånd.
 */
export async function addExistingPlayerToGame(
  gameId: string,
  formData: FormData,
): Promise<void> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const detailPath = ctx.isAdmin
    ? `/admin/games/${gameId}`
    : `/games/${gameId}/spillere`;
  const inviterUserId = ctx.userId;

  const recipientUserId = String(formData.get('recipient_user_id') ?? '').trim();
  if (!recipientUserId) {
    redirect({ href: `${detailPath}?error=invite_missing_user`, locale });
  }

  const game = await loadGameForInvite(supabase, gameId, detailPath);

  if (game.status === 'active' || game.status === 'finished') {
    redirect({ href: `${detailPath}?error=game_locked`, locale });
  }

  // Venne-/klubb-scoping (#906, felle #3 — server er den egentlige authz). Admin
  // er unntatt (kurator-modellen, jf. disposable-guarden #422); self alltid lov.
  if (!ctx.isAdmin && recipientUserId !== inviterUserId) {
    const eligible = await getInviteEligibleIds(inviterUserId, game.group_id);
    if (!eligible.has(recipientUserId)) {
      redirect({ href: `${detailPath}?error=invite_not_allowed`, locale });
    }
  }

  await assertRoomForPlayer(supabase, game, detailPath);

  const { error: insertError } = await supabase.from('game_players').insert({
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
    console.error('[inviteToGame/addExistingPlayer] insert failed', insertError);
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  if (!duplicate && recipientUserId !== inviterUserId) {
    await notifyInvitedToGame({
      recipientUserId,
      gameId,
      inviterUserId,
    });
  }

  expireGameCache(gameId);
  redirect({ href: `${detailPath}?status=invite_added`, locale });
}

/**
 * Webbens dør inn til e-post-invitasjonen.
 *
 * Regelen bor i `lib/games/inviteToGame.ts` (#1919) — den flyttet ut da appen
 * skulle få den samme handlingen over `POST /api/games/[id]/invite`, og en
 * kopi ville gitt regelen to hjem (AGENTS trap 4). Igjen her står bare det
 * webben eier: gaten, klienten og oversettelsen fra utfall til query-parameter.
 *
 * Klienten som sendes inn er den RLS-baserte (`getServerClient`), så
 * 0072-policyene står som et andre lag på webbens skrivinger nøyaktig som før.
 * Ruta sender service-role-klienten sin.
 *
 * Query-verdiene under er bruker-synlige (banneret leser dem) og står
 * tegn-for-tegn slik de sto før flyttingen. Merk prefikset: kjernens
 * `invalid_email` er webbens `invite_invalid_email`.
 */
const REFUSAL_ERROR: Record<InviteRefusal, string> = {
  invalid_email: 'invite_invalid_email',
  disposable_email: 'disposable_email',
  not_found: 'not_found',
  game_locked: 'game_locked',
  game_full: 'game_full',
  invite_not_allowed: 'invite_not_allowed',
  db_players: 'db_players',
  invite_failed: 'invite_failed',
  mail_failed: 'mail_failed',
};

export async function inviteEmailToGame(
  gameId: string,
  formData: FormData,
): Promise<void> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const detailPath = ctx.isAdmin
    ? `/admin/games/${gameId}`
    : `/games/${gameId}/spillere`;

  const rawEmail = String(formData.get('email') ?? '');
  const result = await inviteEmailToGameCore({
    client: supabase,
    gameId,
    inviterUserId: ctx.userId,
    inviterName: ctx.name,
    isAdmin: ctx.isAdmin,
    rawEmail,
  });

  if (!result.ok) {
    // `mail_failed` bærer adressen videre: banneret sier hvem mailen ikke nådde,
    // så arrangøren kan prøve den samme adressen på nytt. Resten er tilstander
    // ved runden, ikke ved adressen.
    const query =
      result.reason === 'mail_failed'
        ? `error=mail_failed&email=${encodeURIComponent(normalizeInviteEmail(rawEmail))}`
        : `error=${REFUSAL_ERROR[result.reason]}`;
    // `redirect()` kaster (NEXT_REDIRECT), så denne `return`-en nås aldri —
    // den står fordi `redirect` ikke er typet `never`, og uten den ser tsc
    // fortsatt begge grenene av unionen under.
    return redirect({ href: `${detailPath}?${query}`, locale });
  }

  const status = result.kind === 'added' ? 'invite_added' : 'invite_sent';
  redirect({
    href: `${detailPath}?status=${status}&email=${encodeURIComponent(result.email)}`,
    locale,
  });
}

async function loadGameForInvite(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  gameId: string,
  detailPath: string,
): Promise<GameSnapshot> {
  const locale = await getLocale();
  const { data, error } = await supabase
    .from('games')
    .select('id, name, status, game_mode, group_id, mode_config')
    .eq('id', gameId)
    .maybeSingle<GameSnapshot>();

  // Error ≠ absence (#1445): a transient query failure throws to the route's
  // error boundary (retryable) instead of claiming the game does not exist.
  // Only a genuine 0-row result keeps the not_found redirect.
  if (error) {
    console.error('[loadGameForInvite] game fetch failed', { gameId, error });
    throw error;
  }
  if (!data) {
    redirect({ href: `${detailPath}?error=not_found`, locale });
  }
  return data!;
}

/**
 * Format cap for the organiser's add paths (#2059): the cap the signup link
 * reads (`organizerPlayerCap`), counted over active players so a withdrawn
 * player never makes the game look full. Enforced here in the action only —
 * there is no DB constraint behind it, so two tabs adding at once can pass it.
 */
async function assertRoomForPlayer(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  game: GameSnapshot,
  detailPath: string,
): Promise<void> {
  const cap = organizerPlayerCap(game.game_mode, game.mode_config);
  if (cap === null) return;
  const { count } = await supabase
    .from('game_players')
    .select('user_id', { count: 'exact', head: true })
    .eq('game_id', game.id)
    .is('withdrawn_at', null);
  if ((count ?? 0) >= cap) {
    const locale = await getLocale();
    redirect({ href: `${detailPath}?error=game_full`, locale });
  }
}
