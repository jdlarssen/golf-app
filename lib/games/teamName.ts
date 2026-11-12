import { TEAM_NAME_MAX } from '@/lib/games/registration';

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
