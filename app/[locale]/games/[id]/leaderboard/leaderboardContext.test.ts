import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * getResultReadClient — ETT hjem for regelen «hvem får lese resultat-dataene»
 * (#1542).
 *
 * Bakgrunn: RLS-policyen `scores select gating per mode` krever i sin
 * finished-gren at leseren er deltaker i DET spillet. Leaderboard-ruta slipper
 * samtidig alle innloggede inn på ferdige spill, så en cup-tilskuer traff et
 * tomt kort. Regelen bodde i tre kommentarer og én policy som var uenige;
 * denne funksjonen er nå det ene stedet den håndheves.
 *
 * Testen er Type A (ren beslutningslogikk): den eneste oppførselen som betyr
 * noe er HVILKEN klient som kommer ut, så vi mocker begge klient-fabrikkene
 * ved system-grensen og asserter på identitet.
 */

const adminClient = { __kind: 'admin' } as unknown as SupabaseClient<Database>;
const cookieClient = { __kind: 'cookie' } as unknown as SupabaseClient<Database>;
const passedClient = { __kind: 'passed' } as unknown as SupabaseClient<Database>;

const getAdminClientMock = vi.fn(() => adminClient);
const getServerClientMock = vi.fn(async () => cookieClient);

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => getAdminClientMock(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => getServerClientMock(),
}));
vi.mock('@/lib/auth/userId', () => ({
  getProxyVerifiedUserId: async () => 'viewer-1',
}));

const { getResultReadClient } = await import('./leaderboardContext');

describe('getResultReadClient', () => {
  beforeEach(() => {
    getAdminClientMock.mockClear();
    getServerClientMock.mockClear();
  });

  it('leser et FERDIG spill med service-role-klienten', async () => {
    // Uten denne ville RLS gitt 0 rader til alle som ikke selv spilte kampen
    // — nøyaktig feilen i #1542.
    await expect(getResultReadClient('finished')).resolves.toBe(adminClient);
    expect(getServerClientMock).not.toHaveBeenCalled();
  });

  it('ignorerer fallback-klienten når spillet er ferdig', async () => {
    await expect(getResultReadClient('finished', passedClient)).resolves.toBe(
      adminClient,
    );
  });

  it.each(['draft', 'scheduled', 'active'] as const)(
    'beholder innsenderens klient på et %s spill',
    async (status) => {
      // Spectate-ruta sender inn sin egen admin-klient for live-følging;
      // den må overleve uendret, ellers mister anonyme tilskuere tavla.
      await expect(getResultReadClient(status, passedClient)).resolves.toBe(
        passedClient,
      );
      expect(getAdminClientMock).not.toHaveBeenCalled();
    },
  );

  it('faller tilbake til cookie-klienten når ingen sendes inn og spillet går', async () => {
    await expect(getResultReadClient('active')).resolves.toBe(cookieClient);
    expect(getAdminClientMock).not.toHaveBeenCalled();
  });
});
