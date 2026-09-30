// native/app/src/lib/display.test.ts
// Native #1889: klokkeslettet i «Sist purret kl. …».
//
// Testen finnes for tidssone-valget, ikke for strengbyggingen. Suiten kjører
// med `TZ=UTC` (pinnet i `jest.config.js`, og lastbærende: på en norsk maskin
// er «enhetens lokaltid» og «Oslo-veggklokke» det samme tallet, så en test
// skrevet der kunne aldri feilet). Under UTC er de to forskjellige — og
// forventningene under er UTC-veggklokka. Det ER poenget: appen konverterer
// bevisst ikke til Oslo, fordi Hermes ikke har tidssonene og et forsøk på å
// gjette dem alt har lagret en tee-off én time feil (#1854-fella).
//
// `formatTeeOff` og `displayName` er dekket av kallstedenes egne tester og
// gjentas ikke her.
import { formatClock, formatSignedAt, formatStampDateLocal, shortDisplayName } from './display';

describe('formatClock', () => {
  it('viser enhetens veggklokke, ikke en Oslo-konvertering', () => {
    // 12:05Z. Hadde helperen konvertert til Oslo, ville dette blitt 14.05.
    expect(formatClock('2026-09-02T12:05:00.000Z')).toBe('12:05');
  });

  it('nullpolstrer begge feltene', () => {
    expect(formatClock('2026-09-02T07:03:00.000Z')).toBe('07:03');
    expect(formatClock('2026-01-15T00:00:00.000Z')).toBe('00:00');
  });

  it('svarer null når det ikke finnes noe tidspunkt', () => {
    expect(formatClock(null)).toBeNull();
  });

  it('svarer null på en ulesbar verdi i stedet for «NaN.NaN»', () => {
    expect(formatClock('ikke en dato')).toBeNull();
  });
});

// #2262: datoen i stempelet på et levert scorekort.
describe('formatSignedAt', () => {
  it('skriver dato og klokkeslett i enhetens tid', () => {
    // 12:32Z, altså 14.32 i Oslo. Under TZ=UTC skal det stå 12:32.
    expect(formatSignedAt('2026-09-27T12:32:00.000Z')).toBe('27. september 2026 · 12:32');
  });

  it('har alle tolv månedene, og dagen uten null foran', () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      formatSignedAt(`2026-${String(i + 1).padStart(2, '0')}-05T09:04:00.000Z`),
    );
    expect(months).toEqual([
      '5. januar 2026 · 09:04',
      '5. februar 2026 · 09:04',
      '5. mars 2026 · 09:04',
      '5. april 2026 · 09:04',
      '5. mai 2026 · 09:04',
      '5. juni 2026 · 09:04',
      '5. juli 2026 · 09:04',
      '5. august 2026 · 09:04',
      '5. september 2026 · 09:04',
      '5. oktober 2026 · 09:04',
      '5. november 2026 · 09:04',
      '5. desember 2026 · 09:04',
    ]);
  });

  it('svarer null på en ulesbar verdi', () => {
    expect(formatSignedAt('ikke en dato')).toBeNull();
  });
});

// #2385: datoen i stempelet er designets korte form, i enhetens tid. Formen
// selv er den delte `formatStampDate`; her låses koblingen til klokka.
describe('formatStampDateLocal', () => {
  it('gir den korte formen i enhetens tid, og null for en ulesbar verdi', () => {
    // 12:32Z. Under TZ=UTC skal det stå 12:32.
    expect(formatStampDateLocal('2026-09-27T12:32:00.000Z')).toBe('27.09 · 12:32');
    expect(formatStampDateLocal('2026-01-05T09:04:00.000Z')).toBe('05.01 · 09:04');
    expect(formatStampDateLocal('ikke en dato')).toBeNull();
  });
});

// #2255: navnelista ved avatarene på startbilletten har bare fornavn, som i
// designet («Du, Marte og Jonas»).
describe('shortDisplayName', () => {
  it.each<[string, { name: string | null; nickname: string | null }, string]>([
    ['fornavnet av fullt navn', { name: 'Marte Holm Berg', nickname: null }, 'Marte'],
    ['kallenavnet vinner', { name: 'Jonas Rud', nickname: 'Rudi' }, 'Rudi'],
    ['tomt kallenavn teller ikke', { name: 'Jonas Rud', nickname: '  ' }, 'Jonas'],
    ['uten navn: plassholderen', { name: null, nickname: null }, 'Ukjent spiller'],
  ])('%s', (_case, player, expected) => {
    expect(shortDisplayName(player)).toBe(expected);
  });
});
