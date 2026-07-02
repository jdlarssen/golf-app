/**
 * Tests for buildRoundReportPrompt / sanitizeRoundReport (#1008 — AI round-
 * report prompt builder + output sanitizer). Written FIRST (TDD); run
 * `npx vitest run lib/games/roundReportPrompt.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { RoundReportFacts } from './roundReportFacts';
import { buildRoundReportPrompt, sanitizeRoundReport } from './roundReportPrompt';

const FACTS: RoundReportFacts = {
  gameName: 'Lørdagscup',
  courseName: 'Oslo GK',
  endedAt: '2026-07-01T18:00:00.000Z',
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
  it('system prompt is Norwegian, forbids invented numbers, mentions the winner requirement', () => {
    const { system } = buildRoundReportPrompt(FACTS);
    expect(system).toContain('golfrunde');
    expect(system).toContain('norsk bokmål');
    expect(system).not.toMatch(/[a-z]{4,}\s(the|and|score|winner)\s/i); // no stray English sentences
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
