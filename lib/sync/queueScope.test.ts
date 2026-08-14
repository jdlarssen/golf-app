import { describe, it, expect } from 'vitest';
import type { SyncQueueItem } from './db';
import { belongsToGame, isActiveForGame, isBlockingItem } from './queueScope';

/**
 * Type A (#1370): pure scoping rules for the Dexie sync queue. Every UI that
 * reports queue status reads the WHOLE queue, so the "does this item belong to
 * the round I'm looking at" decision lives here — once — and is asserted here
 * only. The consuming render tests must not re-assert these numbers.
 */

const GAME = '11111111-1111-4111-8111-111111111111';
const SIBLING = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

function item(
  overrides: Partial<SyncQueueItem> & { scoreId: string },
): SyncQueueItem {
  return {
    id: overrides.scoreId,
    attemptCount: 0,
    lastError: null,
    createdAt: '2026-08-14T10:00:00.000Z',
    abandonedAt: null,
    ...overrides,
  };
}

describe('belongsToGame', () => {
  it('matcher elementer fra samme spill', () => {
    expect(belongsToGame(`${GAME}:u1:7`, GAME)).toBe(true);
  });

  it('matcher ikke elementer fra et annet spill', () => {
    expect(belongsToGame(`${STRANGER}:u1:7`, GAME)).toBe(false);
  });

  it('en gameId som er prefiks av en annen treffer ikke (kolon-delt nøkkel)', () => {
    // Uten kolonet i prefikset ville 'g1' matchet 'g11:u1:3' og omvendt.
    expect(belongsToGame('g11:u1:3', 'g1')).toBe(false);
    expect(belongsToGame('g1:u1:3', 'g11')).toBe(false);
    expect(belongsToGame('g1:u1:3', 'g1')).toBe(true);
  });

  it('en uparsbar scoreId tilhører ingen runde', () => {
    expect(belongsToGame('not-a-score-key', GAME)).toBe(false);
  });
});

describe('isActiveForGame', () => {
  it('aktivt element i denne runden teller', () => {
    expect(isActiveForGame(item({ scoreId: `${GAME}:u1:7` }), GAME)).toBe(true);
  });

  it('aktivt element fra en annen runde teller ikke', () => {
    expect(isActiveForGame(item({ scoreId: `${STRANGER}:u1:7` }), GAME)).toBe(
      false,
    );
  });

  it('karantenesatt element i denne runden er ikke aktivt', () => {
    expect(
      isActiveForGame(
        item({ scoreId: `${GAME}:u1:7`, abandonedAt: '2026-08-14T10:05:00Z' }),
        GAME,
      ),
    ).toBe(false);
  });

  it('element skrevet før abandonedAt-feltet fantes regnes som aktivt', () => {
    const legacy = item({ scoreId: `${GAME}:u1:7` });
    delete legacy.abandonedAt;
    expect(isActiveForGame(legacy, GAME)).toBe(true);
  });
});

describe('isBlockingItem', () => {
  // Leveringen fryser BÅDE denne runden og en evt. split-cup-søskenrunde
  // (#1466), så sperren må dekke begge — ellers slettes søskenets køede slag.
  const blocking = [GAME, SIBLING];

  it('eget ventende slag sperrer', () => {
    expect(isBlockingItem(item({ scoreId: `${GAME}:u1:7` }), blocking)).toBe(
      true,
    );
  });

  it('slag i split-cup-søskenrunden sperrer selv om gameId er en annen', () => {
    expect(isBlockingItem(item({ scoreId: `${SIBLING}:u1:7` }), blocking)).toBe(
      true,
    );
  });

  it('slag fra en urelatert runde sperrer ikke', () => {
    expect(isBlockingItem(item({ scoreId: `${STRANGER}:u1:7` }), blocking)).toBe(
      false,
    );
  });

  it('karantenesatt slag sperrer ikke — det drainer aldri', () => {
    expect(
      isBlockingItem(
        item({ scoreId: `${GAME}:u1:7`, abandonedAt: '2026-08-14T10:05:00Z' }),
        blocking,
      ),
    ).toBe(false);
  });

  it('tom liste over spill leveringen berører sperrer ikke', () => {
    expect(isBlockingItem(item({ scoreId: `${GAME}:u1:7` }), [])).toBe(false);
  });
});
