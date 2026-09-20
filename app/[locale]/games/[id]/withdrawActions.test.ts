import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit-tester for webbens port inn til selv-frafall (#199 chunk 11, #386 chunk 3).
 *
 * Etter #1917 er dette alt fila gjør: hent sesjonen, send en uten til /login, og
 * kall kjernen med (gameId, userId). Reglene — grenene, cup-sperren, varselet,
 * cache-utløpingen — bor i `lib/games/withdrawSelf.ts` og testes der. Casene sto
 * her til #1917 og er FLYTTET, ikke kopiert.
 *
 *   - Uautentisert → redirect /login (begge handlingene)
 *   - Autentisert → kjernen kalles med (gameId, userId), og svaret gis videre
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nb',
}));

type CoreCall = (
  gameId: string,
  userId: string,
) => Promise<{ ok: true; kept: boolean }>;

const withdrawSelfMock = vi.fn<CoreCall>(async () => ({ ok: true, kept: true }));
const undoSelfWithdrawMock = vi.fn<CoreCall>(async () => ({
  ok: true,
  kept: true,
}));
vi.mock('@/lib/games/withdrawSelf', () => ({
  withdrawSelf: (...args: Parameters<CoreCall>) => withdrawSelfMock(...args),
  undoSelfWithdraw: (...args: Parameters<CoreCall>) =>
    undoSelfWithdrawMock(...args),
}));

let serverMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '22222222-2222-2222-2222-222222222222';

function authedAsUser(): void {
  serverMock = buildSupabaseMock([]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: USER_ID } },
  });
}

function unauthed(): void {
  serverMock = buildSupabaseMock([]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: null },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock = buildSupabaseMock([]);
});

describe('withdrawFromGame', () => {
  it('uautentisert → redirect /login', async () => {
    unauthed();
    const { withdrawFromGame } = await import('./withdrawActions');

    await expect(withdrawFromGame(GAME_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/login' }),
    );
    // Porten er hele jobben: en uten sesjon skal ikke nå kjernen.
    expect(withdrawSelfMock).not.toHaveBeenCalled();
  });

  it('kaller kjernen med spillet og den innloggede brukeren', async () => {
    authedAsUser();
    const { withdrawFromGame } = await import('./withdrawActions');

    expect(await withdrawFromGame(GAME_ID)).toEqual({ ok: true, kept: true });
    expect(withdrawSelfMock).toHaveBeenCalledWith(GAME_ID, USER_ID);
  });
});

describe('undoWithdraw', () => {
  it('uautentisert → redirect /login', async () => {
    unauthed();
    const { undoWithdraw } = await import('./withdrawActions');

    await expect(undoWithdraw(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/login' }),
    );
    expect(undoSelfWithdrawMock).not.toHaveBeenCalled();
  });

  it('kaller kjernen med spillet og den innloggede brukeren', async () => {
    authedAsUser();
    const { undoWithdraw } = await import('./withdrawActions');

    expect(await undoWithdraw(GAME_ID)).toEqual({ ok: true, kept: true });
    expect(undoSelfWithdrawMock).toHaveBeenCalledWith(GAME_ID, USER_ID);
  });
});
