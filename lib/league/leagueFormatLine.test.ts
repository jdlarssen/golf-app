import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import messages from '@/messages/no.json';
import { leagueFormatLine, type FormatLineLeague, type FormatLineT } from './leagueFormatLine';

// Type A (#2660): the web league page's format line, with the real Norwegian
// messages. The app's `formatLine` (native/app/src/lib/leagueCopy.test.ts)
// asserts the same lines.

const t = createTranslator({ locale: 'no', messages, namespace: 'liga.player.formatLine' }) as unknown as FormatLineT;
const label = messages.liga.manage.formatLabel;

const league: FormatLineLeague = {
  format: 'stableford',
  scoring: 'net',
  standingsModel: 'best_n',
  bestN: 5,
  hcpAllowancePct: 75,
  hcpMaxStrokes: 32,
};

describe('leagueFormatLine', () => {
  it.each<[string, FormatLineLeague]>([
    ['Stableford netto 75\u00A0% · maks 32 slag · beste 5 av 7', league],
    ['Stableford netto 95\u00A0% · beste 5 av 7', { ...league, hcpAllowancePct: 95, hcpMaxStrokes: null }],
    ['Stableford netto 100\u00A0% · beste 5 av 7', { ...league, hcpAllowancePct: 100, hcpMaxStrokes: null }],
    ['Stableford brutto · beste 5 av 7', { ...league, scoring: 'gross', hcpAllowancePct: 100, hcpMaxStrokes: null }],
    ['Slagspill netto 95\u00A0% · sum av alle runder', { ...league, format: 'stroke', standingsModel: 'total', hcpAllowancePct: 95, hcpMaxStrokes: null }],
    ['Stableford netto 75\u00A0% · maks 32 slag · snitt per runde', { ...league, standingsModel: 'average' }],
    ['Stableford netto 75\u00A0% · maks 32 slag · poeng per plassering', { ...league, standingsModel: 'points' }],
    ['Stableford netto 75\u00A0% · maks 32 slag · beste runder teller', { ...league, bestN: null }],
  ])('%s', (expected, l) => {
    expect(leagueFormatLine(t, label[l.format], l, 7)).toBe(expected);
  });
});
