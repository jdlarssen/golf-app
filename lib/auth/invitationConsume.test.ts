import { describe, expect, it } from 'vitest';
import { isReceiptForExistingAccount } from './invitationConsume';

const ACCOUNT = '2026-03-01T10:00:00.000Z';
const BEFORE = '2026-02-20T10:00:00.000Z';
const AFTER = '2026-03-05T10:00:00.000Z';

describe('isReceiptForExistingAccount (0252)', () => {
  it('a game-less invitation written after the account existed is left alone', () => {
    expect(isReceiptForExistingAccount({ game_id: null, created_at: AFTER }, ACCOUNT)).toBe(true);
  });

  it('a game-less invitation the person joined on is taken', () => {
    expect(isReceiptForExistingAccount({ game_id: null, created_at: BEFORE }, ACCOUNT)).toBe(false);
  });

  it('a game invitation is taken as before, whenever it was written', () => {
    expect(isReceiptForExistingAccount({ game_id: 'g', created_at: AFTER }, ACCOUNT)).toBe(false);
  });

  it('without an account row yet, the invitation is taken', () => {
    expect(isReceiptForExistingAccount({ game_id: null, created_at: AFTER }, null)).toBe(false);
  });
});
