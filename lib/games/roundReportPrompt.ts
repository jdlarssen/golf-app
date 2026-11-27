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

import { findWeekday, numbersNotIn, sanitizeNarrative } from '@/lib/ai/narrative';
import type { RoundReportFacts } from './roundReportFacts';

export type RoundReportPrompt = {
  system: string;
  user: string;
};

const MAX_REPORT_LENGTH = 1500;
const THIN_DATA_HOLE_THRESHOLD = 9;

/**
 * `previousFault` is what `checkRoundReport` said about the draft before this
 * one (#2983): the second attempt is the same task, with one more line that
 * says why the first draft was dropped.
 */
export function buildRoundReportPrompt(
  facts: RoundReportFacts,
  previousFault: string | null = null,
): RoundReportPrompt {
  const system = buildSystemPrompt(facts);
  const retry =
    previousFault === null
      ? ''
      : `\n\nEt tidligere utkast ble forkastet. ${previousFault} Skriv referatet på nytt og følg alle reglene.`;
  const user = buildUserPrompt(facts) + retry;
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
    // #2983: a report named a weekday 22.11, and it was wrong. The facts hold
    // no date any more, and `checkRoundReport` drops a weekday.
    'Bruk KUN fakta og tall fra fakta-objektet under — finn ALDRI på tall, hull eller hendelser som ikke står der. Nevn vinneren. Nevn aldri ukedag eller dato.',
    `Skrivestil: varier setningslengden, noen korte. ${nameRule(facts)} Sammensatte ord skrives i ett («andreplass», ikke «andre plass»). Maks én tankestrek i hele referatet; bruk heller komma, punktum eller parentes.`,
    'Ikke åpne med resultatlinjen («X vant … med N poeng») — åpne med det mest dramatiske eller morsomste i fakta-objektet, og la resultatet komme etterpå.',
    'Avslutt med en konkret detalj eller et vennskapelig stikk — aldri med en generell oppsummering av typen «en runde som viser …» eller «det var X sin dag», og ikke med klisjeen «kan trøste seg med».',
    'Unngå ordene «viste at», «understreker», «markerer», «imponerende», og unngå passiv form og engelske ord.',
    // #2561 PR B: players without AI consent are left out of the facts.
    'Noen spillere kan mangle i fakta-objektet fordi de selv har sagt nei til tekster fra språkmodellen. Nevn bare spillerne som står der, og antyd aldri at noen mangler. Er winnerName null, kårer du ingen vinner. Er gameName null, nevner du ikke navnet på spillet.',
    ...flightRules(facts),
  ].join(' ');
}

/**
 * #2983: a league flight names each player the way the league's news story
 * does («Jørgen L.», `reportName`), so the nickname rule does not fit there.
 */
function nameRule(facts: RoundReportFacts): string {
  return facts.leagueFlight
    ? 'Navn: bruk navnet NØYAKTIG slik det står i fakta-objektet, hver gang. Aldri fullt navn, aldri kallenavn, aldri anførselstegn rundt navn.'
    : 'Fullt navn maks én gang per spiller, deretter bare kallenavnet. Kallenavn skrives med «anførselstegn» (selv om fakta-objektet bruker rette).';
}

/** #2983: the rules for a flight of one and for the league block, only when the facts have them. */
function flightRules(facts: RoundReportFacts): string[] {
  const rules: string[] = [];
  if (facts.soloFlight) {
    rules.push(
      'Er soloFlight true, spilte spilleren alene i flighten. Ingen andre var med, og ingen mangler. Skriv aldri at noen skjuler kortet, holder noe tilbake eller ikke har levert.',
    );
  }
  if (facts.league) {
    rules.push(
      '«league» sier hvordan spillerne står i ligaen akkurat nå. Runden er ikke stengt, og flere kan spille den før fristen, så alle plassene er foreløpige: skriv «foreløpig» eller «så langt» om hver plass du nevner.',
      'roundPlace er plassen i runden så langt, og playedThisRound er hvor mange som har spilt runden. tablePlace er plassen i tabellen nå, og tablePlaceBefore er plassen før denne flighten ble levert. move er ferdig regnet: et positivt tall er antall plasser spilleren har klatret, et negativt tall er antall plasser spilleren har falt. Er en verdi null, sier du ingenting om den.',
      'Regn aldri ut en plass, en bevegelse eller en avstand selv. Bruk tallene i «league».',
      'passed er spillerne som spilleren gikk forbi i tabellen: nevn bare navnene i passed, og gjett aldri hvem andre som er passert.',
      'Skriv «poeng», aldri «stablefordpoeng» eller «stableford».',
    );
  }
  return rules;
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
 *
 * Vasken selv bor i `lib/ai/narrative.ts`, delt med Kavalkadens innledning
 * (#2128) så de to AI-tekstene ikke kan drifte fra hverandre. Her står bare
 * lengdegrensen, som er referatets egen.
 */
export function sanitizeRoundReport(raw: string): string | null {
  return sanitizeNarrative(raw, MAX_REPORT_LENGTH);
}

/**
 * What `checkRoundReport` found: the report as it may be stored, or why the
 * draft is dropped. The fault is a sentence for the model, so that a second
 * attempt knows what to leave out.
 */
export type RoundReportCheck = { report: string; fault: null } | { report: null; fault: string };

/**
 * The model's answer, cleaned and checked (#2983). The report must not be
 * stored when it is empty, too long, or names a weekday (`findWeekday`; a word
 * that stands in the facts, like the game name «Lørdagscup», is a name). In a
 * league flight it must also hold no number that is not in the facts
 * (`numbersNotIn`): the places and moves there are the league's, and the
 * model must never work one out. Other reports do not get the number check
 * yet; their facts are not shaped for it.
 */
export function checkRoundReport(raw: string, facts: RoundReportFacts): RoundReportCheck {
  const text = sanitizeRoundReport(raw);
  if (text === null) return { report: null, fault: 'Utkastet var tomt eller for langt.' };

  const known = JSON.stringify(facts);
  const faults: string[] = [];
  const weekday = findWeekday(text, known);
  if (weekday !== null) {
    faults.push(`Utkastet nevnte en ukedag («${weekday}»). Nevn aldri ukedag eller dato.`);
  }
  if (facts.leagueFlight) {
    const unknown = numbersNotIn(text, known);
    if (unknown.length > 0) {
      faults.push(`Utkastet inneholdt tall som ikke står i fakta-objektet: ${unknown.join(', ')}.`);
    }
  }
  return faults.length > 0 ? { report: null, fault: faults.join(' ') } : { report: text, fault: null };
}
