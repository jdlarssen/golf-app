'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { joinLeagueByCodeCore } from '@/lib/league/joinLeagueByCode';

/**
 * The server action behind the shareable league link,
 * `/liga/bli-med/[code]` (#2662). Mirrors the cup link (`/cup/bli-med`, #1490).
 *
 * The gate and the write live in `joinLeagueByCodeCore`, shared with the app's
 * route (#2748). This layer owns the cookie session and the redirects. Errors
 * come back as `{ error: code }` (#1397); only success redirects.
 */

export type LeagueJoinActionError = { error: string };

function joinPath(code: string): string {
  return `/liga/bli-med/${code}`;
}

export async function joinLeagueByCode(
  formData: FormData,
): Promise<LeagueJoinActionError> {
  const code = String(formData.get('code') ?? '').trim();
  const locale = await getLocale();
  if (!code) return { error: 'not_found' };

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // An expired session: the same door the anonymous visitor gets on the page.
  if (!user) redirect({ href: `/login?next=${joinPath(code)}`, locale });

  const result = await joinLeagueByCodeCore(code, user.id);
  if (!result.ok) return { error: result.error };
  // `redirect()` throws NEXT_REDIRECT, so it stays out here, after the core.
  redirect({
    href: result.alreadyJoined ? `/liga/${result.leagueId}` : `/liga/${result.leagueId}?status=joined`,
    locale,
  });
}
