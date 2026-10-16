/**
 * #2561: does a game name mention someone who has not said yes to AI texts?
 *
 * The game name is the organiser's free text («Olas 50-årsdag»), and both AI
 * paths send it to the language model: the round report and the Kavalkade. A
 * name in it would reach the model even when its owner said no. Callers send
 * no game name (null) when this returns true.
 *
 * A match is a whole word, in any case: the full name, any part of it, or the
 * nickname. A trailing genitive s counts («Olas», «Store Pers»), and hyphens
 * and apostrophes split words («Nordmann-cupen», «Ola's»). A single letter
 * does not count on its own, so an initial like the N in «Ola N.» does not
 * match «Lag N». Pure: no I/O.
 */

export type NamedPerson = { name: string | null; nickname?: string | null };

function words(text: string): string[] {
  return text
    .toLocaleLowerCase('nb')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/** `phrase` appears in `haystack` as consecutive words; the last may carry a genitive s. */
function containsPhrase(haystack: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0) return false;
  const last = phrase.length - 1;
  for (let start = 0; start + phrase.length <= haystack.length; start++) {
    const hit = phrase.every((word, i) => {
      const at = haystack[start + i];
      return at === word || (i === last && at === `${word}s`);
    });
    if (hit) return true;
  }
  return false;
}

export function gameNameMentions(gameName: string, people: readonly NamedPerson[]): boolean {
  const haystack = words(gameName);
  if (haystack.length === 0) return false;
  return people.some((person) => {
    const phrases: string[][] = [];
    if (person.name) {
      const parts = words(person.name);
      phrases.push(parts);
      for (const part of parts) if (part.length > 1) phrases.push([part]);
    }
    if (person.nickname) phrases.push(words(person.nickname));
    return phrases.some((phrase) => containsPhrase(haystack, phrase));
  });
}
