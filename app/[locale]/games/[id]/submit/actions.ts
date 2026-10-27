'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import {
  submitScorecardWithMarker,
  type SubmitWithMarkerResult,
} from '@/lib/league/setFlightMarkerCore';

/** Kjernens grunner, oversatt til den redirecten webben alltid har brukt. */
function failureHref(
  reason: Extract<SubmitWithMarkerResult, { ok: false }>['reason'],
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
    case 'tee_shots_short':
      // #2580: the page shows the tee-shot box; the message says why.
      return `/games/${gameId}/submit?error=tee_shots_short`;
    case 'db':
      return `/games/${gameId}/submit?error=db`;
    // #2661: the simulator league's marker, each with its own message.
    case 'marker_required':
    case 'marker_is_self':
    case 'marker_not_member':
      return `/games/${gameId}/submit?error=${reason}`;
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
 * #2200: skjemaets skjulte `alsoFor`-felt er makkerne jeg har ført kortet for.
 * De sendes rett videre; kjernen leverer bare dem regelen tillater.
 *
 * #2661: i en simulatorliga velger spilleren markør i skjemaet (`marker`).
 * `submitScorecardWithMarker` sjekker og skriver markøren og leverer så med
 * `submitScorecardCore`; utenfor simulatorligaen er det kjernen uendret.
 *
 * `redirect()` kaster, så kjerne-kallet er med vilje ikke pakket i try/catch.
 */
export async function submitScorecard(gameId: string, formData?: FormData) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const alsoFor = (formData?.getAll('alsoFor') ?? []).map(String).filter(Boolean);
  // #2661: the marker the player picked in a simulator league; ignored elsewhere.
  const markerUserId = String(formData?.get('marker') ?? '') || null;
  const result = await submitScorecardWithMarker(supabase, gameId, user.id, {
    alsoFor,
    markerUserId,
  });

  if (!result.ok) {
    redirect({ href: failureHref(result.reason, gameId), locale });
  }

  // #2200: the core narrows `alsoFor` with its own rule, over scores that may
  // be newer than the page. Fewer flightmates' cards than the form asked for
  // gets its own receipt, so it never reads as if every card went.
  const askedMates = new Set(alsoFor.filter((id) => id !== user.id)).size;
  const status =
    result.alsoDelivered < askedMates ? 'submitted_partial' : 'submitted';
  redirect({ href: `/games/${gameId}?status=${status}`, locale });
}
