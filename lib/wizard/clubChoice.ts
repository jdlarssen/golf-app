// «Klubb-turnering» needs a club (#2439). Before, the wizard's club picker
// defaulted to «Ingen klubb», so a club tournament could be published as an
// ordinary private game without the organiser noticing.
//
// `clubIds` is the wizard's list of valid clubs: clubs you are a member of
// that have not expired (`getNewGameFormData`, the same rule the server uses
// in `new/actions.ts`). Pure, so the hook and the tests share one rule.

import type { Intent } from './intent';

/**
 * The club the wizard starts with. A seeded club (edit, revansje, `?klubb=`)
 * wins even when it is not valid: then the organiser has to choose. Otherwise
 * a club tournament with exactly one valid club starts with that club.
 */
export function startClubId({
  intent,
  seeded,
  clubIds,
}: {
  intent: Intent | undefined;
  seeded: string;
  clubIds: readonly string[];
}): string {
  if (seeded !== '') return seeded;
  if (intent === 'klubb' && clubIds.length === 1) return clubIds[0];
  return '';
}

/**
 * Whether the club choice lets the organiser go on: always for anything but a
 * club tournament, and for a club tournament only with a valid club.
 */
export function isValidClubChoice({
  intent,
  groupId,
  clubIds,
}: {
  intent: Intent | undefined;
  groupId: string;
  clubIds: readonly string[];
}): boolean {
  if (intent !== 'klubb') return true;
  return clubIds.includes(groupId);
}

/**
 * The arrangement the wizard starts on. A club tournament without a valid
 * club starts on step 1 with nothing chosen, since step 1 does not offer
 * «Klubb-turnering» to someone without a club.
 */
export function startIntent({
  intent,
  clubIds,
}: {
  intent: Intent | undefined;
  clubIds: readonly string[];
}): Intent | undefined {
  if (intent === 'klubb' && clubIds.length === 0) return undefined;
  return intent;
}
