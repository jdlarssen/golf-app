'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { sendReminders } from '@/lib/games/remindUnsubmitted';
import { sendUnconfirmedReminders } from '@/lib/games/remindUnconfirmed';

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
    redirect({ href: `${statusPath}?error=not_active`, locale });
  }

  revalidatePath(statusPath);
  redirect({ href: `${statusPath}?status=reminded&count=${result.reminded}`, locale });
}

/**
 * Admin-purring (#463): send «bekreft at du er med»-påminnelse (player_added-
 * kind) til alle spillere som ennå ikke har bekreftet deltakelse og ikke er
 * trukket. Regelen — hvem som er mål og sendingen — bor i
 * `lib/games/remindUnconfirmed.ts` (#2483), fordi arrangørens «Klar for i
 * morgen?» purrer én spiller gjennom den samme kjernen. Denne action-en er
 * porten (`requireAdmin`) og redirect-semantikken. Ingen idempotens-guard:
 * admin kan sende på nytt ved behov.
 */
export async function remindUnconfirmedPlayers(gameId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const statusPath = `/admin/games/${gameId}/status`;

  const result = await sendUnconfirmedReminders(gameId);
  if (!result.ok) {
    redirect({ href: `${statusPath}?error=${result.reason}`, locale });
  }

  revalidatePath(statusPath);
  redirect({ href: `${statusPath}?status=reminded_unconfirmed&count=${result.reminded}`, locale });
}
