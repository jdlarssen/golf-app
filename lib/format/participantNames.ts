import { firstName } from '@/lib/firstName';

type UserRel = { name: string | null; nickname: string | null };

/**
 * The names a remove-confirm page shows for a `users` FK embed (#2244): the
 * nickname, then the name, as the liga and cup rosters show them, plus the
 * first word for the «Ja, fjern {fornavn}» button. The embed is many-to-one,
 * so PostgREST returns an object, or null.
 */
export function participantNames(
  user: UserRel | null,
  unknownLabel: string,
  fallbackFirstName: string,
): { name: string; firstName: string } {
  const preferred = user?.nickname?.trim() || user?.name?.trim() || '';
  return {
    name: preferred || unknownLabel,
    firstName: firstName(preferred) ?? fallbackFirstName,
  };
}
