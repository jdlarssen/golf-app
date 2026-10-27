'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { evaluateLeagueJoin } from '@/lib/league/joinValidation';
import {
  getLeagueJoinContext,
  type LeagueJoinContext,
} from '@/lib/league/getLeagueJoinContext';

/**
 * The server action behind the shareable league link,
 * `/liga/bli-med/[code]` (#2662). Mirrors the cup link (`/cup/bli-med`, #1490).
 *
 * The write goes through the service role (`getAdminClient`) because
 * `league_players` lets only the organiser insert (RLS 0092): the gate is
 * `evaluateLeagueJoin` here, on the same facts the page renders from, and
 * nothing behind it. Errors come back as `{ error: code }` (#1397); only
 * success redirects.
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

  // ONLY the read is wrapped: `redirect()` below throws NEXT_REDIRECT, and a
  // body-wide catch would swallow it. If the read fails we know nothing, so we
  // say no with a banner instead of writing on a guess (#1863).
  let context: LeagueJoinContext;
  try {
    context = await getLeagueJoinContext(code, user.id);
  } catch {
    return { error: 'read_failed' };
  }

  const decision = evaluateLeagueJoin(context.facts);
  const league = context.league;
  if (decision === 'already_joined' && league) {
    redirect({ href: `/liga/${league.id}`, locale });
  }
  if (decision !== 'can_join' || !league) return { error: decision };

  // accepted_at now: joining by yourself is the confirmation (#463), so the
  // organiser's list never shows «Ikke bekreftet» for someone who came in by
  // the link. Upsert with ignoreDuplicates: two quick taps = a quiet no-op,
  // deliberately WITHOUT `expectAffected`, the duplicate IS the legitimate
  // 0-row outcome here (trap 2 is about writes where 0 rows reveal a fault).
  const { error: insertErr } = await getAdminClient()
    .from('league_players')
    .upsert(
      { league_id: league.id, user_id: user.id, accepted_at: new Date().toISOString() },
      { onConflict: 'league_id,user_id', ignoreDuplicates: true },
    );
  if (insertErr) {
    console.error('[liga] joinLeagueByCode failed', {
      leagueId: league.id,
      userId: user.id,
      error: insertErr,
    });
    return { error: 'save_failed' };
  }

  revalidatePath(`/liga/${league.id}`);
  revalidatePath(`/admin/liga/${league.id}`);
  redirect({ href: `/liga/${league.id}?status=joined`, locale });
}
