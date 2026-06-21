/**
 * Maps a user profile gender value to the tee_gender column value used in
 * game_players (#809).
 *
 * Previously duplicated verbatim in lib/league/actions.ts and
 * app/[locale]/admin/cup/[id]/generer/actions.ts.
 */

/** Profile gender → tee_gender. NULL / 'male' → 'mens', 'female' → 'ladies'. */
export function teeGenderOf(gender: string | null): 'mens' | 'ladies' {
  return gender === 'female' ? 'ladies' : 'mens';
}
