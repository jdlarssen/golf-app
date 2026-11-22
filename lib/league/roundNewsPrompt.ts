/**
 * The short news story about a league round that has closed (#2979): the
 * facts the language model gets, the prompt, and the checks on what it wrote.
 *
 * Same rule as the round report (#1008): the model never works anything out.
 * It sees the numbers `buildRoundSummary` read from the league table, the gaps
 * already subtracted, and only the players who said yes to texts from the
 * language model (`lib/ai/consent.ts`). The others are left out entirely; the
 * counts stand as plain numbers.
 *
 * Three drafts on the first league's real numbers (23.11.2026) shaped the
 * prompt: one draft got a gap wrong («ti poeng» for eight), two said the
 * players «møtte opp» at a course they each play alone on a simulator, and the
 * names switched between full name, first name and nickname. Hence: the gaps
 * are in the facts and arithmetic is forbidden, the simulator rule is spelled
 * out, and each player has exactly one name.
 *
 * Pure. No I/O.
 */
import { sanitizeNarrative } from '@/lib/ai/narrative';
import type { RoundSummary } from './roundSummary';

export type RoundNewsFacts = {
  leagueName: string;
  roundLabel: string;
  nextRoundLabel: string;
  roundsPlayed: number;
  roundsTotal: number;
  countingRounds: number | null;
  /** What a round value is, and which way is best. */
  roundMetric: string;
  /** What a table total is: it follows the league's standings model, not always the round value. */
  tableMetric: string;
  /**
   * False when the round's best is not in `round` (a player who said no to
   * such texts). Then nobody in the facts won the round, and the story must
   * not say who did.
   */
  roundBestShown: boolean;
  /** The same for the table: false when the leader is not in `table`. */
  tableLeaderShown: boolean;
  courseName: string | null;
  simulator: boolean;
  playersInLeague: number;
  playedThisRound: number;
  round: Array<{ place: number; name: string; value: number; behindBest: number }>;
  table: Array<{ place: number; name: string; total: number; behindLeader: number }>;
};

export type RoundNewsPrompt = { system: string; user: string };

/** Longer than this and the model has misread the task: the story is dropped. */
const MAX_NEWS_LENGTH = 900;

/**
 * The facts for the model, with only the players in `allowedUserIds` (those
 * who said yes). Null when none of them played the round: there is nobody the
 * story may be about.
 */
export function buildRoundNewsFacts(
  summary: RoundSummary,
  nextRoundLabel: string,
  allowedUserIds: ReadonlySet<string>,
): RoundNewsFacts | null {
  const shown = <T extends { userId: string; name: string | null }>(rows: readonly T[]) =>
    rows.flatMap((row) => (allowedUserIds.has(row.userId) && row.name ? [{ ...row, name: row.name }] : []));

  const round = shown(summary.round).map((r) => ({
    place: r.place,
    name: r.name,
    value: r.value,
    behindBest: r.behind,
  }));
  if (round.length === 0) return null;

  const table = shown(summary.table).map((r) => ({
    place: r.place,
    name: r.name,
    total: r.value,
    behindLeader: r.behind,
  }));
  const roundMetric = summary.pointsBased ? 'stablefordpoeng, flest er best' : 'slag mot par, lavest er best';

  return {
    leagueName: summary.leagueName,
    roundLabel: summary.roundLabel,
    nextRoundLabel,
    roundsPlayed: summary.roundsPlayed,
    roundsTotal: summary.roundsTotal,
    countingRounds: summary.countingRounds,
    roundMetric,
    tableMetric: tableMetric(summary, roundMetric),
    roundBestShown: round.some((r) => r.place === 1),
    tableLeaderShown: table.some((r) => r.place === 1),
    courseName: summary.courseName,
    simulator: summary.simulator,
    playersInLeague: summary.playersInLeague,
    playedThisRound: summary.playedThisRound,
    round,
    table,
  };
}

/**
 * What the season total is under the league's standings model. Under the
 * placement-points model the total is league points, also in a stroke league
 * where a round value is strokes to par.
 */
function tableMetric(summary: RoundSummary, roundMetric: string): string {
  if (summary.model === 'points') return 'ligapoeng etter plassering i hver runde, flest er best';
  if (summary.model === 'average') return `snitt per runde (${roundMetric})`;
  if (summary.model === 'best_n' && summary.countingRounds !== null) {
    return `sum av de ${summary.countingRounds} beste rundene (${roundMetric})`;
  }
  return `sum av rundene (${roundMetric})`;
}

export function buildRoundNewsPrompt(facts: RoundNewsFacts): RoundNewsPrompt {
  const system = [
    'Du er Tørnys utsendte reporter og skriver en kort nyhetssak om en ferdigspilt runde i en golfliga blant kompiser som kjenner hverandre godt. Alle i ligaen får samme tekst, sammen med beskjeden om at neste runde er åpen. Målet: en sak gjengen har lyst til å lese høyt i gruppechatten.',
    'Skriv 4–6 komplette setninger, høyst 700 tegn.',
    'Ren løpende tekst på norsk bokmål — ingen markdown, ingen overskrifter, ingen punktlister, ingen emoji.',
    'Tone: sportsjournalistikk med glimt i øyet. Skryt av rundens beste med snert, og ert dem som havnet bakerst — minst ett godmodig stikk. Det skal humres, men aldri bli slemt.',
    'Bruk KUN fakta og tall fra fakta-objektet under — finn ALDRI på tall, hull, slag, vær eller hendelser som ikke står der. Du vet ingenting om hvordan rundene ble spilt, bare verdiene og plassene.',
    'Regn ALDRI ut noe selv. Avstanden til rundens beste står i behindBest, og avstanden til lederen av tabellen i behindLeader. Trenger du en annen avstand, lar du den være.',
    'Nevn aldri ukedag eller dato.',
    'Er simulator true, spiller hver spiller runden alene på simulator når det passer. Skriv da aldri at spillerne møttes, møtte opp, samlet seg eller sto på banen sammen. Banen er den de spilte på skjermen.',
    'Ligaen går over flere runder. «round» er resultatet i runden som nettopp stengte, «table» er tabellen etter den. Er roundsPlayed 1, er de to like: skriv da om runden og om at tabellen er satt for første gang. Ellers skriver du både om rundens beste og om hvem som leder tabellen.',
    'Lik plass betyr delt plass. Si aldri at noen «vant» en delt plass.',
    'Er roundBestShown false, står ikke rundens beste i fakta-objektet. Skriv da ALDRI at noen vant runden, var best eller tok førsteplassen, og kall ingen «rundens beste». Skriv om plassene som står der. Er tableLeaderShown false, gjelder det samme for tabellen: skriv aldri hvem som leder den.',
    'Verdien i «round» er roundMetric. Totalen i «table» er tableMetric, som kan være noe annet enn rundeverdien.',
    'Navn: bruk navnet NØYAKTIG slik det står i «name», hver eneste gang. Aldri fullt navn, aldri bare fornavn når navnet har en bokstav bak, aldri kallenavn, aldri anførselstegn rundt navn. Du trenger ikke nevne alle.',
    'Noen spillere mangler i fakta-objektet fordi de selv har sagt nei til tekster fra språkmodellen, og noen har ikke spilt runden. Nevn bare spillerne som står der. Du kan si hvor mange som spilte (playedThisRound av playersInLeague), men gjett aldri hvem som mangler eller hvorfor.',
    'Skrivestil: varier setningslengden, noen korte. Sammensatte ord skrives i ett («tredjeplass», ikke «tredje plass»). Høyst én tankestrek i hele saken.',
    'Ikke åpne med resultatlinjen («X vant … med N poeng») — åpne med det mest overraskende eller morsomste i fakta-objektet.',
    'Avslutt med at neste runde (nextRoundLabel) er åpen nå — aldri med en generell oppsummering, og ikke med klisjeen «kan trøste seg med».',
    'Unngå ordene «viste at», «understreker», «markerer», «imponerende», og unngå passiv form og engelske ord.',
  ].join(' ');

  const user = `Skriv en nyhetssak om denne ligarunden, basert utelukkende på fakta-objektet under:\n\n${JSON.stringify(facts, null, 2)}`;
  return { system, user };
}

/**
 * The model's answer, cleaned and checked. Null when the story must not go
 * out: empty, too long, or holding a number that is not in the facts.
 *
 * The number check reads digits only: every run of digits in the story must
 * also be a run of digits in the facts as the model saw them. It catches an
 * invented score or place. It does not catch a number written as a word, or
 * a number from the facts used about the wrong thing; the prompt is the only
 * guard there.
 */
export function checkRoundNews(raw: string, facts: RoundNewsFacts): string | null {
  const text = sanitizeNarrative(raw, MAX_NEWS_LENGTH);
  if (text === null) return null;

  const known = new Set(digitRuns(JSON.stringify(facts)));
  return digitRuns(text).every((n) => known.has(n)) ? text : null;
}

/** Every run of digits, with a decimal comma read as a point («41,5» → «41.5»). */
function digitRuns(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}
