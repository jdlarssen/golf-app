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
 * Hvor lenge vi venter på modellen. En tekst er pynt — den skal aldri holde
 * igjen flyten som utløste den (et avsluttet spill, en side som skal vises).
 */
export const NARRATIVE_TIMEOUT_MS = 20_000;

/** Ett forsøk til ved nettverksfeil, ikke mer. */
export const NARRATIVE_MAX_RETRIES = 1;

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
