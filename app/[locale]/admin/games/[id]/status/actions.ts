'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import { sendReminders } from '@/lib/games/remindUnsubmitted';
import { notify } from '@/lib/notifications/notify';

/**
 * Admin-purring (#376): send «husk å levere»-påminnelse til alle spillere som
 * er ferdige (18/18 registrert) men ikke har levert — og ikke er trukket.
 *
 * Selve regelen — hvem som er mål, sendingen, og stemplingen av
 * `deliver_reminder_sent_at` — bor i `lib/games/remindUnsubmitted.ts` (#1891),
 * fordi appen kaller den samme kjernen gjennom `app/api/games/[id]/remind`.
 * Denne action-en er porten (`requireAdmin`) og redirect-semantikken, ingenting
 * annet: kjernen spør aldri hvem som ringer.
 */
export async function remindUnsubmittedPlayers(gameId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const statusPath = `/admin/games/${gameId}/status`;

  const result = await sendReminders(gameId);

  if (!result.ok) {
    // Status-siden har alltid svart `not_active` også på et spill som ikke
    // finnes — knappen står på spillets egen side, så «finnes ikke» er en
    // umulighet i praksis og fortjener ingen egen tekst. Ruta skiller dem
    // (404 vs 409); her beholder vi dagens ene melding.
    return redirect({ href: `${statusPath}?error=not_active`, locale });
  }

  revalidatePath(statusPath);
  redirect({ href: `${statusPath}?status=reminded&count=${result.reminded}`, locale });
}

type UnconfirmedPlayerRow = {
  user_id: string;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { email: string | null; name: string | null } | null;
};

/**
 * Admin-purring (#463): send «bekreft at du er med»-påminnelse (player_added-
 * kind) til alle spillere som ennå ikke har bekreftet deltakelse
 * (accepted_at is null) og ikke er trukket. Ingen idempotens-guard siden
 * admin kan sende på nytt ved behov. Best-effort (Promise.allSettled).
 * Avbryter aldri på notify-feil.
 */
export async function remindUnconfirmedPlayers(gameId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const statusPath = `/admin/games/${gameId}/status`;

  const { data: game } = await supabase
    .from('games')
    .select('id, name, created_by')
    .eq('id', gameId)
    .single<{ id: string; name: string; created_by: string | null }>();

  if (!game) {
    redirect({ href: `${statusPath}?error=not_found`, locale });
  }

  const { data: players } = await supabase
    .from('game_players')
    .select(
      'user_id, withdrawn_at, accepted_at, users!game_players_user_id_fkey(email, name)',
    )
    .eq('game_id', gameId)
    .is('accepted_at', null)
    .returns<UnconfirmedPlayerRow[]>();

  const unconfirmed = (players ?? []).filter((p) => !p.withdrawn_at);

  // Lookup creator name for the notification message. Falls back to 'Tørny'.
  let adderName = 'Tørny';
  if (game!.created_by) {
    const admin = getAdminClient();
    const { data: creator } = await admin
      .from('users')
      .select('name, email')
      .eq('id', game!.created_by)
      .maybeSingle<{ name: string | null; email: string | null }>();
    if (creator) {
      adderName = creator.name ?? creator.email ?? 'Tørny';
    }
  }

  await Promise.allSettled(
    unconfirmed.map((p) =>
      notify({
        userId: p.user_id,
        kind: 'player_added',
        payload: {
          game_id: game!.id,
          game_name: game!.name,
          added_by_name: adderName,
        },
      }).catch((err) => {
        console.error('[remindUnconfirmedPlayers] notify failed', err);
      }),
    ),
  );

  revalidatePath(statusPath);
  redirect({ href: `${statusPath}?status=reminded_unconfirmed&count=${unconfirmed.length}`, locale });
}
