import { describe, it, expect } from 'vitest';
import { buildSettlementText } from './settlementText';
import { computeSettlement, type Settlement } from '@/lib/scoring/settlement';

// The text «Kopier til gruppechatten» puts on the clipboard (#2296). Type B:
// the snapshot is what lands in the group chat.

const NAMES: Record<string, string> = {
  marte: 'Marte',
  kristian: 'Kristian',
  jonas: 'Jonas',
  anders: 'Anders',
};

const nameOf = (userId: string) => NAMES[userId] ?? '(ukjent spiller)';

const labels = {
  heading: 'Oppgjør: Lørdagsrunden (Skins)',
  stake: '20 kr per skin · 4 spillere',
  payment: (from: string, to: string, amount: string) => `${from} betaler ${to} ${amount}`,
  totalsHeading: 'Sluttsum:',
};

const FOUR_PLAYERS: Settlement = {
  krPerUnit: 20,
  unitLabel: 'skin',
  perPlayer: [
    { userId: 'marte', units: 4, netKr: 40 },
    { userId: 'kristian', units: 3, netKr: 20 },
    { userId: 'anders', units: 1, netKr: -20 },
    { userId: 'jonas', units: 0, netKr: -40 },
  ],
  payments: [
    { fromUserId: 'jonas', toUserId: 'marte', kr: 40 },
    { fromUserId: 'anders', toUserId: 'kristian', kr: 20 },
  ],
};

describe('buildSettlementText', () => {
  it('four players, two payments: heading, stake, payments, totals', () => {
    expect(buildSettlementText(FOUR_PLAYERS, nameOf, labels)).toMatchInlineSnapshot(`
      "Oppgjør: Lørdagsrunden (Skins)
      20 kr per skin · 4 spillere

      Jonas betaler Marte 40 kr
      Anders betaler Kristian 20 kr

      Sluttsum:
      Marte +40 kr
      Kristian +20 kr
      Anders −20 kr
      Jonas −40 kr"
    `);
  });

  it('a settlement with a rounding remainder keeps the engine’s whole kroner', () => {
    // 10 kr per skin, 1 skin among 3: the exact shares are +6.67 / −3.33 / −3.33,
    // and the engine hands the leftover krone to one of the losers.
    const settlement = computeSettlement({
      units: [
        { userId: 'marte', units: 1 },
        { userId: 'jonas', units: 0 },
        { userId: 'anders', units: 0 },
      ],
      krPerUnit: 10,
      unitLabel: 'skin',
    });
    expect(settlement).not.toBeNull();
    expect(
      buildSettlementText(settlement!, nameOf, {
        ...labels,
        stake: '10 kr per skin · 3 spillere',
      }),
    ).toMatchInlineSnapshot(`
      "Oppgjør: Lørdagsrunden (Skins)
      10 kr per skin · 3 spillere

      Jonas betaler Marte 4 kr
      Anders betaler Marte 3 kr

      Sluttsum:
      Marte +7 kr
      Anders −3 kr
      Jonas −4 kr"
    `);
  });

  it('uses the real minus sign and carries no link', () => {
    const text = buildSettlementText(FOUR_PLAYERS, nameOf, labels);
    expect(text).toContain('Jonas −40 kr');
    expect(text).not.toContain('http');
  });
});
