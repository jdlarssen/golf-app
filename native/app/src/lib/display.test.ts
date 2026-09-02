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
import { formatClock } from './display';

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
