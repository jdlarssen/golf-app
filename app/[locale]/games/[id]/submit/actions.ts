'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import {
  submitScorecardCore,
  type SubmitScorecardResult,
} from '@/lib/games/submitScorecardCore';

/** Kjernens grunner, oversatt til den redirecten webben alltid har brukt. */
function failureHref(
  reason: Extract<SubmitScorecardResult, { ok: false }>['reason'],
  gameId: string,
): string {
  // Ingen `default`: en ny grunn i kjernen skal felle tsc her, ikke ende opp
  // som en stille redirect til «alt gikk bra».
  switch (reason) {
    case 'not_found':
    case 'not_active':
      return `/games/${gameId}/submit?error=not_active`;
    case 'not_player':
    case 'withdrawn':
      // Game-home viser «Du har trukket deg»-banneret, og `notFound()`-er en
      // som ikke er med i spillet i det hele tatt.
      return `/games/${gameId}`;
    case 'db':
      return `/games/${gameId}/submit?error=db`;
  }
}

/**
 * Mark the current user's scorecard as submitted.
 *
 * Tynn wrapper (#1918): auth-gaten bor her, regelen i
 * `lib/games/submitScorecardCore.ts` — appen leverer lagkort gjennom
 * `app/api/games/[id]/submit-team`, og leverings-regelen skal ha ett hjem
 * (AGENTS trap 4). Kjernen får denne sidens RLS-klient, så oppførselen er
 * uendret; det eneste som bor her er oversettelsen fra utfall til redirect.
 *
 * `redirect()` kaster, så kjerne-kallet er med vilje ikke pakket i try/catch.
 */
export async function submitScorecard(gameId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user: maybeUser },
  } = await supabase.auth.getUser();
  if (!maybeUser) redirect({ href: '/login', locale });
  const user = maybeUser!;

  const result = await submitScorecardCore(supabase, gameId, user.id);

  if (!result.ok) {
    redirect({ href: failureHref(result.reason, gameId) as string, locale });
  }

  redirect({ href: `/games/${gameId}?status=submitted` as string, locale });
}
