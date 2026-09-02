'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { sendReminders } from '@/lib/games/remindUnsubmitted';

/**
 * Purr på dem som er ferdige uten å ha levert, fra oppretterens avslutt-flate
 * (#1889). Selve regelen (hvem som er mål, sendingen og stemplingen) bor i
 * `lib/games/remindUnsubmitted.ts` (#1891); kjernen spør aldri hvem som ringer,
 * så denne action-en er porten og ingenting annet.
 *
 * `requireAdminOrCreator`, samme gate som siden knappen står på: en spiller som
 * POSTer hit uten å eie spillet bounces til `/` før noen mail er sendt.
 */
export async function remindMissingPlayers(gameId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  await requireAdminOrCreator(supabase, gameId);

  const finishPath = `/games/${gameId}/avslutt`;
  const result = await sendReminders(gameId);

  // Feilgrenene får ingen egen tekst: flaten vi sender tilbake til ER porten.
  // Er spillet ikke aktivt lenger, sender den brukeren videre til
  // `/games/[id]?error=not_active`; er det borte, svarer den `notFound()`.
  // Å speile de meldingene her hadde gitt dem et fjerde hjem for ingenting.
  redirect({
    href: result.ok ? `${finishPath}?status=reminded` : finishPath,
    locale,
  });
}
