'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { sendUnconfirmedReminders } from '@/lib/games/remindUnconfirmed';

/**
 * «Purr Kari» on «Klar for i morgen?» (#2483): one reminder to confirm, to
 * one player, through the same core as the Status page's «Purr ubekreftede»
 * (`sendUnconfirmedReminders`). This action is the gate
 * (`requireAdminOrCreator`: the organiser, also without the admin role, or an
 * admin) and the redirect.
 *
 * The core decides who is a target: `userId` only narrows its set, so a
 * forged form post naming someone who has confirmed, withdrew, is a guest or
 * is not on the list reminds nobody and lands on «Fant ingen å purre». A round
 * that is no longer scheduled or in progress goes back to the game, as the
 * page itself does.
 */
export async function remindUnansweredPlayer(gameId: string, userId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  await requireAdminOrCreator(supabase, gameId);

  const pagePath = `/admin/games/${gameId}/i-morgen`;
  const result = await sendUnconfirmedReminders(gameId, { userIds: [userId] });
  if (!result.ok) redirect({ href: `/games/${gameId}`, locale });
  if (result.reminded === 0) redirect({ href: `${pagePath}?error=notRemindable`, locale });

  revalidatePath(pagePath);
  redirect({ href: `${pagePath}?purret=${encodeURIComponent(userId)}`, locale });
}
