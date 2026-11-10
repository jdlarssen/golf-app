import { playerFirstName, playerName } from '@/lib/names/playerName';

type UserRel = { name: string | null; nickname: string | null };

/**
 * The names a remove-confirm page shows for a `users` FK embed (#2244): the
 * name, else the nickname (`playerName`, #2813), as the liga and cup rosters
 * show them, plus the first name for the «Ja, fjern {fornavn}» button. The
 * embed is many-to-one, so PostgREST returns an object, or null.
 */
export function participantNames(
  user: UserRel | null,
  unknownLabel: string,
  fallbackFirstName: string,
): { name: string; firstName: string } {
  return {
    name: playerName(user) ?? unknownLabel,
    firstName: playerFirstName(user) ?? fallbackFirstName,
  };
}
