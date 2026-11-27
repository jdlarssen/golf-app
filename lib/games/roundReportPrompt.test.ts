/**
 * Tests for buildRoundReportPrompt / sanitizeRoundReport (#1008 — AI round-
 * report prompt builder + output sanitizer). Written FIRST (TDD); run
 * `npx vitest run lib/games/roundReportPrompt.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { RoundReportFacts } from './roundReportFacts';
import { buildRoundReportPrompt, checkRoundReport, sanitizeRoundReport } from './roundReportPrompt';

const FACTS: RoundReportFacts = {
  gameName: 'Lørdagscup',
  courseName: 'Oslo GK',
  formatLabel: 'Slagspill',
  band: 'placement',
  winnerName: 'Alice',
  standings: [
    { rank: 1, name: 'Alice', scoreLabel: '−2' },
    { rank: 2, name: 'Bob', scoreLabel: '+3' },
  ],
  scoredHoles: 18,
};

describe('buildRoundReportPrompt', () => {
  it.each([
    ['the subject', 'golfrunde'],
    ['the language', 'norsk bokmål'],
    // #2561: players without AI consent are missing on purpose, and a null
    // winnerName means no winner is named.
    ['a null winnerName', 'Er winnerName null, kårer du ingen vinner.'],
    // #2561: a null gameName named someone who said no.
    ['a null gameName', 'Er gameName null, nevner du ikke navnet på spillet.'],
  ])('system prompt says what holds for %s', (_label, phrase) => {
    expect(buildRoundReportPrompt(FACTS).system).toContain(phrase);
  });

  it('system prompt has no stray English sentences', () => {
    expect(buildRoundReportPrompt(FACTS).system).not.toMatch(/[a-z]{4,}\s(the|and|score|winner)\s/i);
  });

  it('system prompt caps sentence count to 3 when scoredHoles < 9', () => {
    const thin: RoundReportFacts = { ...FACTS, scoredHoles: 6 };
    const { system: thinSystem } = buildRoundReportPrompt(thin);
    const { system: fullSystem } = buildRoundReportPrompt(FACTS);
    expect(thinSystem).toMatch(/maks 3 setninger/);
    expect(fullSystem).not.toMatch(/maks 3 setninger/);
  });

  it('user string embeds the facts object verbatim as JSON, including exact fasit numbers/names', () => {
    const { user } = buildRoundReportPrompt(FACTS);
    const embedded = JSON.parse(user.slice(user.indexOf('{')));
    expect(embedded).toEqual(FACTS);
    // Spot-check the fasit numbers/names appear textually too.
    expect(user).toContain('Alice');
    expect(user).toContain('−2');
    expect(user).toContain('"scoredHoles": 18');
  });

  it('user string is a short Norwegian instruction followed by the JSON', () => {
    const { user } = buildRoundReportPrompt(FACTS);
    const jsonStart = user.indexOf('{');
    expect(jsonStart).toBeGreaterThan(0);
    const instruction = user.slice(0, jsonStart);
    expect(instruction.length).toBeGreaterThan(0);
    expect(instruction).toMatch(/golfrunde|referat/);
  });
});

describe('sanitizeRoundReport', () => {
  it.each([
    ['clean text passes unchanged', 'Alice vant Lørdagscup med god margin.', 'Alice vant Lørdagscup med god margin.'],
    [
      'fenced text is unwrapped',
      '```\nAlice vant Lørdagscup med god margin.\n```',
      'Alice vant Lørdagscup med god margin.',
    ],
    [
      'wrapping double-quotes are stripped',
      '"Alice vant Lørdagscup med god margin."',
      'Alice vant Lørdagscup med god margin.',
    ],
    [
      'excess blank lines collapse to at most one blank line',
      'Første setning.\n\n\n\nAndre setning.',
      'Første setning.\n\nAndre setning.',
    ],
    ['leading/trailing whitespace is trimmed', '   Alice vant.   ', 'Alice vant.'],
  ])('%s', (_label, input, expected) => {
    expect(sanitizeRoundReport(input)).toBe(expected);
  });

  it('returns null for empty input', () => {
    expect(sanitizeRoundReport('')).toBeNull();
    expect(sanitizeRoundReport('   ')).toBeNull();
  });

  it('returns null for output over 1500 chars', () => {
    const tooLong = 'a'.repeat(1501);
    expect(sanitizeRoundReport(tooLong)).toBeNull();
  });

  it('accepts output at exactly 1500 chars', () => {
    const atLimit = 'a'.repeat(1500);
    expect(sanitizeRoundReport(atLimit)).toBe(atLimit);
  });
});

// ---------------------------------------------------------------------------
// #2983: a league flight knows the league; no report names a weekday
// ---------------------------------------------------------------------------
const FLIGHT: RoundReportFacts = {
  gameName: 'Vinterligaen – Runde 2',
  courseName: 'Byneset North',
  formatLabel: 'Stableford',
  band: 'placement',
  winnerName: null,
  standings: [{ name: 'Kari N.', scoreLabel: '39 p' }],
  scoredHoles: 18,
  leagueFlight: true,
  soloFlight: true,
  league: {
    leagueName: 'Vinterligaen',
    roundLabel: 'Runde 2',
    provisional: true,
    playedThisRound: 4,
    playersInLeague: 11,
    tableSize: 10,
    players: [{ name: 'Kari N.', roundPlace: 1, tablePlace: 2, tablePlaceBefore: 5, move: 3, passed: ['Bo B.'] }],
  },
};

describe('buildRoundReportPrompt: #2983', () => {
  it('no report may name a date or a weekday', () => {
    const { system } = buildRoundReportPrompt(FACTS);
    expect(system).toContain('Nevn aldri ukedag eller dato.');
    expect(system).not.toContain('Datoen kan du nevne');
  });

  it('a league flight gets the league rules, a flight of one the solo rule, and the names as they stand', () => {
    const { system } = buildRoundReportPrompt(FLIGHT);
    expect(system).toContain('foreløpig');
    expect(system).toContain('Regn aldri ut en plass, en bevegelse eller en avstand selv.');
    expect(system).toContain('nevn bare navnene i passed');
    expect(system).toContain('Er soloFlight true');
    expect(system).toContain('aldri «stablefordpoeng»');
    expect(system).toContain('bruk navnet NØYAKTIG slik det står');
    expect(system).not.toContain('Kallenavn skrives med');
  });

  it('another game gets none of the league rules, and keeps the nickname rule', () => {
    const { system } = buildRoundReportPrompt(FACTS);
    expect(system).not.toContain('foreløpig');
    expect(system).not.toContain('Er soloFlight true');
    expect(system).toContain('Kallenavn skrives med');
  });

  it('a second attempt is the same task, with the reason the first draft was dropped', () => {
    const first = buildRoundReportPrompt(FLIGHT);
    const second = buildRoundReportPrompt(FLIGHT, 'Utkastet nevnte en ukedag («lørdag»). Nevn aldri ukedag eller dato.');
    expect(second.system).toBe(first.system);
    expect(second.user.slice(first.user.length)).toBe(
      '\n\nEt tidligere utkast ble forkastet. Utkastet nevnte en ukedag («lørdag»). Nevn aldri ukedag eller dato. Skriv referatet på nytt og følg alle reglene.',
    );
  });
});

describe('checkRoundReport (#2983)', () => {
  it('a report that keeps the rules goes out, cleaned', () => {
    const report = '  Kari N. leverte 39 p på Byneset North og ligger foreløpig på 2. plass, tre plasser opp.  ';
    expect(checkRoundReport(report, FLIGHT)).toEqual({ report: report.trim(), fault: null });
  });

  it.each([
    ['plain', 'Kari N. leverte på lørdag.', 'lørdag'],
    ['inflected', 'Søndagskvelden ble god for Kari N.', 'Søndagskvelden'],
  ])('a weekday drops the report, %s', (_name, report, word) => {
    expect(checkRoundReport(report, FACTS)).toEqual({
      report: null,
      fault: `Utkastet nevnte en ukedag («${word}»). Nevn aldri ukedag eller dato.`,
    });
  });

  it('a game named after a day keeps its report', () => {
    // FACTS.gameName is «Lørdagscup».
    expect(checkRoundReport('Alice tok Lørdagscup foran Bob.', FACTS).report).not.toBeNull();
  });

  it('in a league flight a number not in the facts drops the report; elsewhere it does not', () => {
    expect(checkRoundReport('Kari N. klatret 7 plasser.', FLIGHT)).toEqual({
      report: null,
      fault: 'Utkastet inneholdt tall som ikke står i fakta-objektet: 7.',
    });
    expect(checkRoundReport('Alice satte inn birdie på hull 7.', FACTS).report).not.toBeNull();
  });

  it('an empty or far too long answer drops the report', () => {
    const fault = 'Utkastet var tomt eller for langt.';
    expect(checkRoundReport('  ', FACTS)).toEqual({ report: null, fault });
    expect(checkRoundReport('a'.repeat(1501), FACTS)).toEqual({ report: null, fault });
  });
});

