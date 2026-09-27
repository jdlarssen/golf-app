import { maskEmail } from './maskEmail';

/**
 * The name other people see for a user: the name, or the masked address
 * (`ol•••@gmail.com`) when the name is missing — never the full address.
 * A user without a name is one who got the login code but has not finished
 * the profile (#2207, #2271). The nickname follows in «», as everywhere else.
 *
 * Returns null when there is neither a name nor an address, so each caller
 * keeps its own fallback (the notification card's catalog text, 'Tørny', …).
 *
 * Only for surfaces other people see. Admin pages show the address on
 * purpose, and a user's own profile shows their own.
 */
export function displayNameForOthers(u: {
  name: string | null;
  nickname?: string | null;
  email: string | null;
}): string | null {
  const base = u.name?.trim() || (u.email ? maskEmail(u.email) : '');
  if (!base) return null;
  return u.nickname ? `${base} «${u.nickname}»` : base;
}
