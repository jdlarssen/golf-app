import type { AppLocale } from '@/i18n/routing';
import { intlLocaleTag } from '@/lib/i18n/format';
import { isAutoGameName } from '@/lib/games/autoGameName';
import { nameInitials } from '@/lib/names/initials';
import { first } from '@/lib/url/searchParams';

/**
 * «Som sist» on step 1 of /opprett-spill (#2446): the newest round you played
 * that «Revansje?» would accept, offered as a start. Pure rules here; the read
 * is `loadLastRound` in the page and the card is `LastRoundCard`.
 */

/** Every param that opens the wizard with something chosen already. */
const PREFILL_PARAMS = ['fra', 'sist', 'bane', 'klubb', 'format', 'oppsett'] as const;

/**
 * The card stands on a blank start, and on `?intent=kompis`: «Med kompiser»
 * in the Klubbhus room opens that, the main door to a friends' round (owner's
 * answer 29.10). A link that chose anything else (a rematch, a course, a club,
 * another arrangement, a format or a guide's setup) gets step 1 as it was.
 */
export function shouldOfferLastRound(
  sp: Partial<Record<string, string | string[] | undefined>>,
): boolean {
  const intent = first(sp.intent);
  if (intent && intent !== 'kompis') return false;
  return PREFILL_PARAMS.every((key) => !first(sp[key]));
}

/**
 * «Bruk samme oppsett» lands on «Klar?»; the prefill lifts the wizard's step
 * ceiling, so `step=5` stays. «Endre» opens step 1 with the same values.
 */
export function lastRoundHrefs(gameId: string): { use: string; edit: string } {
  const edit = `/opprett-spill?sist=${encodeURIComponent(gameId)}`;
  return { use: `${edit}&step=5`, edit };
}

/**
 * The name the new round starts with (owner's answer 29.10): a name the
 * organiser wrote follows; the wizard's own «{course} {date}» does not, so the
 * wizard names the new round from the course and the new date.
 */
export function carriedGameName(name: string, courseName: string | null): string | undefined {
  return isAutoGameName(name, courseName) ? undefined : name;
}

export type LastRoundPerson = { name: string | null; nickname: string | null };

/**
 * Who played, as the card shows them: four or fewer by name, as on the
 * artboard; from five, three names and a count of the rest, with the same
 * three avatars and «+N».
 */
export function lastRoundPeople(players: readonly LastRoundPerson[]): {
  initials: string[];
  firstNames: string[];
  others: number;
} {
  const shown = players.length > 4 ? players.slice(0, 3) : players;
  return {
    initials: shown.map((p) => nameInitials(p.name ?? p.nickname)),
    firstNames: shown.map((p) => firstName(p)),
    others: players.length - shown.length,
  };
}

function firstName({ name, nickname }: LastRoundPerson): string {
  const nick = nickname?.trim();
  if (nick) return nick;
  return name?.trim().split(/\s+/)[0] || '?';
}

/** «A, B og C» / «A, B and C». */
export function joinNames(names: readonly string[], locale: AppLocale): string {
  return new Intl.ListFormat(intlLocaleTag(locale), { type: 'conjunction' }).format(names);
}
