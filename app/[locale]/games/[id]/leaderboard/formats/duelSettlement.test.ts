import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Source sweep over the leaderboard format route modules (#2221).
 *
 * A finished game with exactly two players renders the head-to-head duel card
 * instead of the format view (#600), and the settlement table lived only inside
 * that view. So a finished two-player money game never showed who pays whom on
 * the web, while every other result did. The fix hands the duel card the
 * settlement through its footerSlot; this sweep keeps a later rewrite of a duel
 * branch from dropping it again.
 *
 * Like contextCallSites.test.ts, the check is textual: it catches a return of
 * the exact pattern that shipped, not every possible rewrite of it.
 */

const FORMATS_DIR = __dirname;

const SOURCES = readdirSync(FORMATS_DIR)
  .filter((name) => name.endsWith('.tsx') && !name.includes('.test.'))
  .sort()
  .map((name) => ({ name, source: readFileSync(join(FORMATS_DIR, name), 'utf8') }));

/** Modules that compute a money settlement AND render the duel card. */
const MONEY_DUELS = SOURCES.filter(
  ({ source }) => source.includes('settlementForResult(') && source.includes('<HeadToHeadResult'),
);

describe('the duel card carries the money settlement (#2221)', () => {
  it('finds the money formats with a duel branch (a sweep over nothing is vacuously green)', () => {
    expect(MONEY_DUELS.map((m) => m.name)).toEqual([
      'bingoBangoBongo.tsx',
      'nassau.tsx',
      'skins.tsx',
    ]);
  });

  it.each(MONEY_DUELS.map((m) => [m.name, m.source]))(
    '%s passes SettlementTable into the duel card',
    (_name, source) => {
      const start = source.indexOf('<HeadToHeadResult');
      // The duel card is the whole body of its `mainContent` arrow.
      const end = source.indexOf('\n      );', start);
      const duel = source.slice(start, end);
      expect(
        duel,
        'The duel branch renders HeadToHeadResult without the settlement. Pass ' +
          '<SettlementTable settlement={settlement} … /> through footerSlot, ahead ' +
          'of the incoming footerSlot, as the format views do for 3+ players.',
      ).toContain('<SettlementTable settlement={settlement}');
    },
  );
});
