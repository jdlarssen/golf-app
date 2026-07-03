/**
 * buildRoundReportPrompt / sanitizeRoundReport — pure prompt-builder and
 * output-sanitizer for the AI round-report generator (#1008).
 *
 * `buildRoundReportPrompt` never touches numbers itself — it embeds the
 * already-computed `RoundReportFacts` object verbatim as JSON and instructs
 * the model to use ONLY those facts. This is the enforcement point for the
 * contract's acceptance criterion "the report never states numbers
 * contradicting the leaderboard": the model has no other source of truth to
 * draw from.
 *
 * `sanitizeRoundReport` is the last line of defense against a malformed or
 * oversized model response before it gets persisted to `games.round_report`.
 */

import type { RoundReportFacts } from './roundReportFacts';

export type RoundReportPrompt = {
  system: string;
  user: string;
};

const MAX_REPORT_LENGTH = 1500;
const THIN_DATA_HOLE_THRESHOLD = 9;

export function buildRoundReportPrompt(facts: RoundReportFacts): RoundReportPrompt {
  const system = buildSystemPrompt(facts);
  const user = buildUserPrompt(facts);
  return { system, user };
}

function buildSystemPrompt(facts: RoundReportFacts): string {
  const lengthRule =
    facts.scoredHoles < THIN_DATA_HOLE_THRESHOLD
      ? 'Runden er kort (færre enn 9 hull spilt) — skriv maks 3 setninger.'
      : 'Skriv 4–7 komplette setninger.';

  return [
    'Du er Tørnys utsendte reporter og skriver kampreferat fra en golfrunde blant kompiser som kjenner hverandre godt. Målet: et referat gjengen har lyst til å lime inn i gruppechatten.',
    lengthRule,
    'Ren løpende tekst på norsk bokmål — ingen markdown, ingen overskrifter, ingen punktlister, ingen emoji.',
    'Tone: sportsreportasje med glimt i øyet — sett scenen, bygg dramaturgi fram mot avgjørelsen, skriv med tempo. Dramaturgien bygger du av fakta-objektet, aldri av oppdiktede hendelser.',
    'Skryt av vinneren med snert, og ert dem som havnet bakerst — minst ett godmodig stikk, gjerne to. Det skal humres i gruppechatten, men aldri bli slemt.',
    'Bruk KUN fakta og tall fra fakta-objektet under — finn ALDRI på tall, hull eller hendelser som ikke står der. Nevn vinneren. Datoen kan du nevne, men aldri ukedagen (den står ikke i fakta-objektet).',
    'Skrivestil: varier setningslengden, noen korte. Fullt navn maks én gang per spiller, deretter bare kallenavnet. Kallenavn skrives med «anførselstegn» (selv om fakta-objektet bruker rette). Sammensatte ord skrives i ett («andreplass», ikke «andre plass»). Maks én tankestrek i hele referatet; bruk heller komma, punktum eller parentes.',
    'Ikke åpne med resultatlinjen («X vant … med N poeng») — åpne med det mest dramatiske eller morsomste i fakta-objektet, og la resultatet komme etterpå.',
    'Avslutt med en konkret detalj eller et vennskapelig stikk — aldri med en generell oppsummering av typen «en runde som viser …» eller «det var X sin dag», og ikke med klisjeen «kan trøste seg med».',
    'Unngå ordene «viste at», «understreker», «markerer», «imponerende», og unngå passiv form og engelske ord.',
  ].join(' ');
}

function buildUserPrompt(facts: RoundReportFacts): string {
  return `Skriv et kampreferat fra denne golfrunden, basert utelukkende på fakta-objektet under:\n\n${JSON.stringify(facts, null, 2)}`;
}

// ---------------------------------------------------------------------------
// Output sanitizer
// ---------------------------------------------------------------------------

/**
 * Cleans a raw model response before persisting it. Returns `null` when the
 * result is empty or implausibly long (> 1500 chars) — callers treat `null`
 * as a generation failure (log + skip storing), never a partial write.
 */
export function sanitizeRoundReport(raw: string): string | null {
  let text = raw.trim();
  if (text.length === 0) return null;

  text = stripWrappingFence(text);
  text = stripWrappingQuotes(text);
  text = text.trim();
  text = collapseExcessBlankLines(text);

  if (text.length === 0) return null;
  if (text.length > MAX_REPORT_LENGTH) return null;

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
