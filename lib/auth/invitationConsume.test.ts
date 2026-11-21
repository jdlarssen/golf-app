import { describe, expect, it, vi } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { withoutReceiptInvitations, withoutReceipts } from './invitationConsume';

const GAME = { id: 'game', game_id: 'g-1' };
const JOINED = { id: 'joined', game_id: null };
const RECEIPT = { id: 'receipt', game_id: null };

describe('withoutReceipts (0252)', () => {
  it('drops the marked rows and keeps the rest', () => {
    expect(withoutReceipts([GAME, JOINED, RECEIPT], new Set(['receipt']))).toEqual([GAME, JOINED]);
  });
});

describe('withoutReceiptInvitations (0252)', () => {
  it('asks for the marks of the game-less rows only, and drops the marked one', async () => {
    const admin = buildSupabaseMock([{ data: [{ invitation_id: 'receipt' }], error: null }]);
    expect(await withoutReceiptInvitations(admin as never, [GAME, JOINED, RECEIPT], 'test')).toEqual([
      GAME,
      JOINED,
    ]);
    const asked = admin.__fromCalls.find((c) => c.method === 'in');
    expect(asked?.table).toBe('invitation_receipts');
    expect(asked?.args).toEqual(['invitation_id', ['joined', 'receipt']]);
  });

  it('does not ask when there is no game-less row', async () => {
    const admin = buildSupabaseMock([]);
    expect(await withoutReceiptInvitations(admin as never, [GAME], 'test')).toEqual([GAME]);
    expect(admin.__fromCalls).toHaveLength(0);
  });

  // Fail closed: «we could not read the marks» must never read as «no marks».
  it('returns no game-less row when the marks cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = buildSupabaseMock([{ data: null, error: { message: 'nede' } }]);
    expect(await withoutReceiptInvitations(admin as never, [GAME, JOINED, RECEIPT], 'test')).toEqual([GAME]);
  });
});
