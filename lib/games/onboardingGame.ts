// lib/games/onboardingGame.ts
// The game card on «Fullfør profilen» («Lørdagsrunden venter på deg»).
//
// One home for the rule both surfaces use (#2350 on the web, #2216 in the
// app): which rounds still wait for a player. The web shows the round from
// `next=/games/<id>`; the app has no `next` and picks the nearest open round
// itself, through the same rule.
//
// Pure on purpose: no Supabase, no Intl. The app imports this file, and Hermes
// has no ICU data.
import { isUuid } from '@/lib/url/isUuid';

/** The statuses a card can show. A finished round waits for no one, and a draft is not out yet. */
export const ONBOARDING_GAME_STATUSES = ['scheduled', 'active'] as const;

/**
 * True when the round still waits for this player: not withdrawn, scheduled
 * or under way, and a main game (a cup or league segment, `source_game_id`
 * set, is reached through its parent).
 */
export function isOnboardingGameOpen(row: {
  withdrawn_at: string | null;
  status: string;
  source_game_id: string | null;
}): boolean {
  return (
    row.withdrawn_at === null &&
    row.source_game_id === null &&
    (ONBOARDING_GAME_STATUSES as readonly string[]).includes(row.status)
  );
}

/**
 * The game id in a post-profile destination: `/games/<id>` with or without a
 * rest (`/holes/3`, `/scorecard`, `/submit`, a query). Signup links, cup
 * links, `/` and everything else give `null`, and so does an id that is not a
 * UUID (it would only cost a query that finds nothing).
 */
export function gameIdFromNext(next: string): string | null {
  const match = /^\/games\/([^/?#]+)(?:[/?#]|$)/.exec(next);
  if (!match) return null;
  return isUuid(match[1]) ? match[1] : null;
}
