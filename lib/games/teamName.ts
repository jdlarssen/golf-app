import { TEAM_NAME_MAX, TEAM_NAME_MIN } from '@/lib/games/registration';

const FALLBACK = 'Laget mitt';
/** «s lag» and «' lag» are both five characters. */
const SUFFIX_LENGTH = 5;

/**
 * The team name the app's team form starts with (#2840): the captain's first
 * name in the Norwegian genitive, «Martins lag». A name ending in s, x or z
 * takes an apostrophe instead, «Jonas' lag». No name gives «Laget mitt». A long
 * name is cut so the suggestion stays inside `TEAM_NAME_MAX`, the limit the
 * core checks. Pure.
 */
export function suggestTeamName(firstName: string): string {
  const name = firstName.trim().slice(0, TEAM_NAME_MAX - SUFFIX_LENGTH).trimEnd();
  if (name.length === 0) return FALLBACK;
  return /[sxz]$/i.test(name) ? `${name}' lag` : `${name}s lag`;
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
