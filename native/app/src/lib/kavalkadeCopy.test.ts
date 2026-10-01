// #2265 PR 2: Kavalkadens tekster. Type A — malene er webbens tegn for tegn,
// og `formatMessage` fyller dem ut slik next-intl gjør for formene i dem.
import source from '../../../../messages/no.json';
import {
  KAVALKADE_SHARE_TEXT,
  KAVALKADE_TEXT,
  formatMessage,
  formatNumberNb,
  kavalkadeShareT,
  kavalkadeT,
} from './kavalkadeCopy';

/** Alle maler i et navnerom, med punktum-sti. */
function templates(node: unknown, prefix = ''): [string, string][] {
  if (typeof node === 'string') return [[prefix, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    templates(value, prefix ? `${prefix}.${key}` : key),
  );
}

/** En verdi for hvert argument i malen: tall til flertall, ellers tekst. */
function sampleValues(template: string, n: number): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  for (const [, name, type] of template.matchAll(/\{(\w+)(?:,\s*(\w+))?/g)) {
    values[name] = type === 'plural' ? n : `<${name}>`;
  }
  return values;
}

describe('the web’s strings', () => {
  it('are the two namespaces in messages/no.json, character for character', () => {
    expect(KAVALKADE_TEXT).toEqual(source.kavalkade);
    expect(KAVALKADE_SHARE_TEXT).toEqual(source.kavalkadeShare);
  });

  it('formats every template for one and for many, with nothing left in braces', () => {
    const all = [...templates(KAVALKADE_TEXT), ...templates(KAVALKADE_SHARE_TEXT)];
    for (const [, template] of all) {
      for (const n of [1, 3]) {
        const text = formatMessage(template, sampleValues(template, n));
        expect(text).not.toMatch(/[{}#]/);
      }
    }
  });
});

describe('formatMessage', () => {
  it('fills in plain arguments, and writes numbers with a decimal comma', () => {
    expect(kavalkadeT('heading', { year: 2026 })).toBe('Golfåret 2026');
    expect(kavalkadeT('nemesisAverage', { value: '1,25' })).toBe('1,25 over par i snitt');
    expect(kavalkadeShareT('nemesisHole.overPar', { n: 1.25 })).toBe('1,25 over par i snitt');
    expect(kavalkadeT('gangTightestLine', { leader: 'Ada', leaderBrutto: 79, runnerUp: 'Bo', runnerUpBrutto: 80 })).toBe(
      'Ada 79 mot Bo 80',
    );
  });

  it('picks «one» only for exactly 1, and writes # as the number', () => {
    expect(kavalkadeT('openingRounds', { count: 1 })).toBe('1 runde');
    expect(kavalkadeT('openingRounds', { count: 0 })).toBe('0 runder');
    expect(kavalkadeT('openingRounds', { count: 18 })).toBe('18 runder');
    expect(kavalkadeShareT('year.rounds', { n: 1 })).toBe('1 runde');
    expect(kavalkadeShareT('gangSnowmen.count', { n: 2 })).toBe('2 snowman');
  });

  it('fills arguments nested inside a plural branch', () => {
    expect(kavalkadeT('teamBestTeammate', { count: 1, names: 'Ada' })).toBe('Beste lagkamerat: Ada');
    expect(kavalkadeT('teamBestTeammate', { count: 2, names: 'Ada, Bo' })).toBe('Beste lagkamerater: Ada, Bo');
  });

  it('throws on a missing value or an unknown key instead of showing braces', () => {
    expect(() => kavalkadeT('heading')).toThrow('missing value');
    expect(() => kavalkadeShareT('year.nope')).toThrow('unknown key');
  });
});

describe('formatNumberNb', () => {
  it('writes what nb-NO writes: comma, no trailing zeros, at most three decimals', () => {
    expect(formatNumberNb(82)).toBe('82');
    expect(formatNumberNb(1.25)).toBe('1,25');
    expect(formatNumberNb(1.5, 2)).toBe('1,5');
    expect(formatNumberNb(2.3456)).toBe('2,346');
    expect(formatNumberNb(-0.5)).toBe('−0,5');
  });
});
