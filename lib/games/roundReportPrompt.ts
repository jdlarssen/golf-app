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
      : 'Skriv 3–6 komplette setninger.';

  return [
    'Du er sportsjournalist for Tørny og skriver et kort kampreferat fra en golfrunde blant venner.',
    lengthRule,
    'Skriv ren løpende tekst — ingen markdown, ingen overskrifter, ingen punktlister, ingen emoji.',
    'Tone: sporty og leken, på norsk bokmål.',
    'Bruk KUN fakta og tall fra fakta-objektet under — finn ALDRI på tall, hull eller hendelser som ikke står der.',
    'Nevn vinneren av runden.',
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
