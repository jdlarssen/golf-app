import { TEAM_NAME_MAX, TEAM_NAME_MIN } from '@/lib/games/registration';

/**
 * Per language: the fallback without a name, the possessive ending, and the
 * ending after s, x or z. Grammar, not catalog copy, so the app (which cannot
 * read the web catalog) gets the same rule.
 */
const SUGGESTION = {
  no: { fallback: 'Laget mitt', suffix: 's lag', apostrophe: "' lag" },
  en: { fallback: 'My team', suffix: "'s team", apostrophe: "' team" },
} as const;

/**
 * The team name the team form starts with (#2840): the captain's first name in
 * the genitive, «Martins lag» / "Martin's team". A name ending in s, x or z
 * takes an apostrophe alone, «Jonas' lag» / "Jonas' team". No name gives
 * «Laget mitt» / "My team". A long name is cut so the suggestion stays inside
 * `TEAM_NAME_MAX`, the limit the core checks. `locale` is the UI language;
 * anything but 'en' gets Norwegian. Pure.
 */
export function suggestTeamName(firstName: string, locale: string = 'no'): string {
  const rule = locale === 'en' ? SUGGESTION.en : SUGGESTION.no;
  const name = firstName.trim().slice(0, TEAM_NAME_MAX - rule.suffix.length).trimEnd();
  if (name.length === 0) return rule.fallback;
  return /[sxz]$/i.test(name) ? `${name}${rule.apostrophe}` : `${name}${rule.suffix}`;
}

export type TeamNameValidationError =
  | { code: 'teamNameEmpty' }
  | { code: 'teamNameTooShort'; min: number }
  | { code: 'teamNameTooLong'; max: number };

/**
 * The team name rule the form checks before sending (#362), against the same
 * `TEAM_NAME_MIN`/`TEAM_NAME_MAX` the core checks (#2222). Moved here from the
 * web form's `teamFormValidation.ts` so the app's form reads the same rule
 * (#2840): the app cannot import from `app/`. Returns a code (a key into
 * `signup.errors.*` on the web) or `null` when the name is fine. Pure.
 */
export function validateTeamName(name: string): TeamNameValidationError | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { code: 'teamNameEmpty' };
  if (trimmed.length < TEAM_NAME_MIN)
    return { code: 'teamNameTooShort', min: TEAM_NAME_MIN };
  if (trimmed.length > TEAM_NAME_MAX)
    return { code: 'teamNameTooLong', max: TEAM_NAME_MAX };
  return null;
}
