import { firstName } from '@/lib/firstName';

type UserRel = { name: string | null; nickname: string | null };

/**
 * The names a remove-confirm page shows for a `users` FK embed (#2244): the
 * nickname, then the name, as the liga and cup rosters show them, plus the
 * first word for the «Ja, fjern {fornavn}» button. PostgREST may hand the
 * embed back as an array even for many-to-one, so both forms are accepted.
 */
export function participantNames(
  rel: UserRel | UserRel[] | null,
  unknownLabel: string,
  fallbackFirstName: string,
): { name: string; firstName: string } {
  const user = Array.isArray(rel) ? (rel[0] ?? null) : rel;
  const preferred = user?.nickname?.trim() || user?.name?.trim() || '';
  return {
    name: preferred || unknownLabel,
    firstName: firstName(preferred) ?? fallbackFirstName,
  };
}
