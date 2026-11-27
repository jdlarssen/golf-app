/**
 * Delte regler for de AI-skrevne tekstene i Tørny — modellvalg, tålmodighet og
 * vasken av svaret før det lagres.
 *
 * To flater skriver prosa med språkmodell: rundereferatet (#1008) og
 * Kavalkadens innledning (#2128). Kontrakten på #2128 sier at kavalkaden skal
 * speile referatet med «samme modellkonstant, timeout og sanitizer». Da må de
 * tre tingene ha ett hjem, ellers driver de fra hverandre neste gang noen
 * bytter modell (felle 4, `docs/bug-prevention.md`).
 *
 * Ren og I/O-fri (Type A, jf. `docs/test-discipline.md`).
 */

/** Modellen som skriver prosa i Tørny. Byttes ett sted. */
export const NARRATIVE_MODEL = 'claude-sonnet-5';

/**
 * Hvor mye modellen tenker før den skriver. Modellen i `NARRATIVE_MODEL` tenker
 * adaptivt også når `thinking` utelates, og uten en verdi her gjelder API-ets
 * standard for den. Noen få setninger er en kort, latensfølsom oppgave, så `low`
 * er utgangspunktet. Blir tekstene merkbart svakere, er `medium` neste trinn.
 */
export const NARRATIVE_EFFORT = 'low' as const;

/**
 * Taket på alt modellen produserer i ett kall, tenkingen medregnet. Tenkingen
 * teller mot `max_tokens` selv om teksten ikke returneres, så et tak som bare
 * rommer svaret kutter det. Lengden på teksten styres av prompten og vasken,
 * ikke av dette taket. Følger modellen: vurder det på nytt ved modellbytte.
 */
export const NARRATIVE_MAX_TOKENS = 4_000;

/**
 * Hvor lenge vi venter på modellen. En tekst er pynt — den skal aldri holde
 * igjen flyten som utløste den (et avsluttet spill, en side som skal vises).
 */
export const NARRATIVE_TIMEOUT_MS = 20_000;

/** Ett forsøk til ved nettverksfeil, ikke mer. */
export const NARRATIVE_MAX_RETRIES = 1;

/**
 * Et utkast som sperrene forkaster, får ett nytt forsøk med grunnen, innenfor
 * den samme fristen (`NARRATIVE_TIMEOUT_MS`): nyhetssaken (#2979) og
 * referatet (#2983).
 */
export const NARRATIVE_ATTEMPTS = 2;

/**
 * Det nye forsøket starter bare med så mye tid igjen. Det første kallet i prod
 * tok under 7 sekunder (23.11.2026); med mindre tid igjen ville det andre
 * utkastet trolig bli kuttet av fristen uansett.
 */
export const NARRATIVE_RETRY_MIN_MS = 8_000;

/**
 * Ukedagene, som tekstene aldri skal nevne (#2983). En historie nevnte en
 * ukedag 22.11, og den var feil: modellen vet ikke hvilken dag det er, og en
 * dato i fakta gjør den ikke klokere. En regel som bare står i prompten er en
 * bønn, ikke en sperre (#2989): promptene sier «ukedag», og sperrene leser
 * denne lista (felle 4).
 */
export const WEEKDAY_WORDS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'] as const;

// Et ord som begynner med en ukedag, i alle bøyninger og sammensetninger
// («lørdag», «mandagen», «søndagskveld»). `\p{L}` og flagget `u`, fordi `\b`
// ikke kjenner æ, ø og å.
const WEEKDAY_PATTERN = new RegExp(`(?<!\\p{L})(?:${WEEKDAY_WORDS.join('|')})\\p{L}*`, 'giu');

/**
 * Det første ordet i `text` som er en ukedag, slik det står, eller null.
 *
 * Et ord som også står i `known` (fakta modellen fikk), er et navn og ikke en
 * ukedag: «Onsdagsligaen», «Torsdagsgolfen» (evaluatoren 27.11), også bøyd
 * («Onsdagsligaens»). Selve dagen («onsdag», «onsdagen») er fortsatt en
 * ukedag, også når fakta har den alene.
 */
export function findWeekday(text: string, known = ''): string | null {
  const days = new Set<string>(WEEKDAY_WORDS);
  const names = Array.from(known.matchAll(WEEKDAY_PATTERN), (m) => m[0].toLowerCase()).filter(
    (word) => !days.has(word),
  );
  for (const m of text.matchAll(WEEKDAY_PATTERN)) {
    const word = m[0].toLowerCase();
    if (!names.some((name) => word.startsWith(name))) return m[0];
  }
  return null;
}

/**
 * Tallene i `text` som ikke står i `known` (fakta modellen fikk, som JSON),
 * hvert én gang (#2979, #2983). Leser bare sifre: hver sifferrekke i teksten
 * må også stå som sifferrekke i fakta. Komma som desimaltegn leses som punktum
 * («41,5» → «41.5»). Et tall skrevet med bokstaver, eller et riktig tall brukt
 * om feil ting, slipper gjennom; der er prompten eneste vern.
 */
export function numbersNotIn(text: string, known: string): string[] {
  const knownRuns = new Set(digitRuns(known));
  return [...new Set(digitRuns(text).filter((n) => !knownRuns.has(n)))];
}

function digitRuns(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

/**
 * Vasker et rått modellsvar før det lagres.
 *
 * Returnerer `null` når svaret er tomt eller urimelig langt — kallstedet
 * behandler `null` som en mislykket generering (logg og hopp over), aldri som
 * en delvis skriving.
 *
 * @param raw       Modellens tekst, slik den kom.
 * @param maxLength Øvre grense i tegn. Over den er svaret forkastet: en modell
 *                  som skulle skrive tre setninger og leverer en side har
 *                  misforstått oppgaven, og teksten er bedre borte enn feil.
 */
export function sanitizeNarrative(raw: string, maxLength: number): string | null {
  let text = raw.trim();
  if (text.length === 0) return null;

  text = stripWrappingFence(text);
  text = stripWrappingQuotes(text);
  text = text.trim();
  text = collapseExcessBlankLines(text);

  if (text.length === 0) return null;
  if (text.length > maxLength) return null;

  return text;
}

/** Strips a single leading/trailing ``` or ```lang fenced code block wrapper, if present. */
function stripWrappingFence(text: string): string {
  const fenceMatch = text.match(/^```[a-zA-Z]*\n([\s\S]*)\n```$/);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

/** Strips a single pair of wrapping double- or single-quotes, if present. */
function stripWrappingQuotes(text: string): string {
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1).trim();
    }
  }
  return text;
}

/** Collapses runs of 3+ newlines down to a single blank line (2 newlines). */
function collapseExcessBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}
