import { describe, expect, it } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';
import { fitsPlayerCount, soloPlayerCap } from '@/lib/wizard/fitsPlayerCount';
import { rotationSlotRange } from '@/lib/games/assignRotationSlots';
import {
  START_COUNT_MODES,
  startPlayerCountRange,
} from '@/lib/games/startPlayerCount';

describe('startPlayerCountRange (#2071)', () => {
  it.each([
    ['wolf', 3, 5],
    ['round_robin', 4, 4],
    ['acey_deucey', 4, 4],
    ['nines', 3, 3],
    ['nassau', 2, 16],
    ['skins', 2, 16],
    ['bingo_bango_bongo', 2, 16],
  ] as const)('%s → %i–%i', (mode, min, max) => {
    expect(startPlayerCountRange(mode)).toEqual({ min, max });
  });

  it.each(['stableford', 'singles_matchplay', 'texas_scramble', 'fourball_matchplay'])(
    '%s har ingen startgrense',
    (mode) => {
      expect(startPlayerCountRange(mode)).toBeNull();
    },
  );

  it('lista over formater har samme sju som hjelperen gir område for', () => {
    expect([...START_COUNT_MODES].sort()).toEqual(
      [
        'acey_deucey',
        'bingo_bango_bongo',
        'nassau',
        'nines',
        'round_robin',
        'skins',
        'wolf',
      ].sort(),
    );
  });
});

// Felle 4: grensen lever i startvakta, veiviser-filteret og påmeldingstaket.
// Endres én av dem alene, blir denne rød.
describe('startPlayerCountRange samsvarer med fitsPlayerCount og soloPlayerCap', () => {
  it.each([...START_COUNT_MODES])('%s', (mode) => {
    const range = startPlayerCountRange(mode);
    expect(range).not.toBeNull();
    const { min, max } = range!;
    for (let n = 1; n <= 17; n++) {
      expect({ n, fits: fitsPlayerCount(mode as GameMode, n) }).toEqual({
        n,
        fits: n >= min && n <= max,
      });
    }
    const cap = soloPlayerCap(mode as GameMode);
    if (cap !== null) expect(max).toBe(cap);
  });

  it('rotationSlotRange leser de samme tallene for wolf og round_robin', () => {
    expect(rotationSlotRange('wolf')).toEqual(startPlayerCountRange('wolf'));
    expect(rotationSlotRange('round_robin')).toEqual(
      startPlayerCountRange('round_robin'),
    );
    expect(rotationSlotRange('acey_deucey')).toBeNull();
    expect(rotationSlotRange('nines')).toBeNull();
  });
});

// Varselet og banneret leser tekstene sine fra messages; en format-setning som
// mangler, gir arrangøren den generelle teksten i stedet.
describe('meldingene for startvakta (#2071)', () => {
  it.each([...START_COUNT_MODES])('%s har format-setning på norsk og engelsk', (mode) => {
    const key = `rotation_player_count_${mode}`;
    for (const messages of [noMessages, enMessages]) {
      const errors = messages.admin.game.errors as Record<string, string>;
      expect(errors[key]).toContain('{count}');
    }
  });

  it('varselårsaken nevner ikke rotasjon — den gjelder flere formater', () => {
    expect(noMessages.inbox.blockReasons.rotation_player_count).not.toMatch(
      /rotasjon/i,
    );
    expect(enMessages.inbox.blockReasons.rotation_player_count).not.toMatch(
      /rotation/i,
    );
  });
});
