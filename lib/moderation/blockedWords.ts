// lib/moderation/blockedWords.ts
// #3019: the word filter Apple (guideline 1.2) and Google Play (UGC policy)
// require before text other players see is stored.
//
// One home, two copies (trap 4): this list is the source, and
// `public.contains_blocked_word(text)` in the database carries the same words.
// `blockedWords.sync.test.ts` reads the newest migration that defines the SQL
// function and fails when the two lists differ. To change the list: edit it
// here, then write a new migration that redefines the function with the list
// printed by `blockedWordsSqlArray()`.
//
// Matching is on whole words only, after the same normalisation on both sides:
// lower case (æøå kept), common digit-for-letter swaps undone (0→o, 1→i, 3→e,
// 4→a, 5→s, 7→t, @→a, $→s), and every other non-letter turned into a word
// break. Whole words keep place names like «Fitjar» and «Kukkerud» out of the
// net; the price is that a word glued into a longer one slips through, which
// a report then catches.

/** Normalised words (lower case, letters only). Norwegian first, then English. */
export const BLOCKED_WORDS: readonly string[] = [
  // Norwegian
  'drittsekk',
  'drittsekken',
  'fitte',
  'fitta',
  'fitter',
  'fittehue',
  'fittetryne',
  'hestkuk',
  'hore',
  'hora',
  'horer',
  'horunge',
  'kuk',
  'kukhue',
  'kukhode',
  'kuksuger',
  'neger',
  'negeren',
  'negre',
  'negrer',
  'pakkis',
  'pakkiser',
  'pikk',
  'pikktryne',
  'rasshøl',
  'rasshull',
  'svarting',
  'svartinger',
  // English
  'asshole',
  'bitch',
  'bitches',
  'chink',
  'cunt',
  'cunts',
  'faggot',
  'faggots',
  'fuck',
  'fucker',
  'fucking',
  'kike',
  'motherfucker',
  'nigga',
  'nigger',
  'niggers',
  'pussy',
  'rapist',
  'retard',
  'retarded',
  'slut',
  'spic',
  'tranny',
  'twat',
  'wanker',
  'whore',
];

// Digit and symbol swaps people use to dodge a filter. The SQL copy uses
// `translate()` with the same two strings, in the same order.
export const LEET_FROM = '013457@$';
export const LEET_TO = 'oieastas';

/** The letters a word may hold; anything else breaks words. Mirrored in SQL. */
const WORD_BREAK = /[^a-zæøåäöüéèêáàóòôúùíìñç]+/g;

/** Lower-cases, undoes digit swaps and splits into words. */
export function normaliseWords(text: string): string[] {
  let lowered = text.toLowerCase();
  for (let i = 0; i < LEET_FROM.length; i++) {
    lowered = lowered.split(LEET_FROM[i]).join(LEET_TO[i]);
  }
  return lowered.replace(WORD_BREAK, ' ').trim().split(' ').filter(Boolean);
}

const BLOCKED = new Set(BLOCKED_WORDS);

/** True when the text holds a word from {@link BLOCKED_WORDS}. */
export function containsBlockedWord(text: string | null | undefined): boolean {
  if (!text) return false;
  return normaliseWords(text).some((word) => BLOCKED.has(word));
}

/** The list as a SQL `array[...]` literal, for the migration that mirrors it. */
export function blockedWordsSqlArray(): string {
  return `array[${BLOCKED_WORDS.map((w) => `'${w.replace(/'/g, "''")}'`).join(', ')}]`;
}
