import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * #1540: mottakerlista til cup-varslene ble bygget med den request-scopede
 * klienten. RLS-en på `game_players` (`is_admin() OR is_in_game(game_id)`) lot
 * en arrangør som ikke er global admin bare se sin egen flight, så lista
 * kollapset — 4 av 12 deltakere fikk `cup_finished`, og mail-fan-outen
 * filtreres på samme liste.
 *
 * Én test, fordi helperen ikke lenger tar en klient og det derfor ikke finnes
 * flere varianter å dekke. Den låser fire ting samtidig, alle nødvendige for at
 * «hele deltaker-settet» skal stemme:
 *   1. oppslaget går på admin-klienten (den eneste som ser hele settet),
 *   2. det er scopet til RIKTIG cup — admin-klienten har ingen RLS igjen som
 *      backstop, så en tapt `tournament_id`-filter ville varslet hele basen,
 *   3. en spiller som går flere kamper telles én gang,
 *   4. rader uten e-post droppes.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));
// Ingen mock av @/lib/supabase/server: modulen skal ikke røre den i det hele
// tatt. Et importforsøk ville krasje testen — som er poenget.

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadTournamentParticipantEmails (#1540)', () => {
  it('leser hele deltaker-settet via admin-klienten, scopet til cupen', async () => {
    // 12 deltakere over 3 kamper — arrangøren (P1) spiller bare den ene, og går
    // dessuten to kamper (splittet dag), så dedup-en må slå inn.
    const games = [{ id: 'G1' }, { id: 'G2' }, { id: 'G3' }];
    const players = [
      ...Array.from({ length: 12 }, (_, i) => ({
        user_id: `P${i + 1}`,
        users: {
          email: `p${i + 1}@x.no`,
          name: `Spiller ${i + 1}`,
          locale: 'no',
        },
      })),
      // P1 igjen fra kamp 2 — samme spiller, ny rad.
      {
        user_id: 'P1',
        users: { email: 'p1@x.no', name: 'Spiller 1', locale: 'no' },
      },
      // Rad uten e-post har ingen kanal å varsles på og skal droppes.
      { user_id: 'P99', users: { email: '', name: 'Uten e-post', locale: null } },
    ];
    adminMock = buildSupabaseMock([
      { data: games, error: null }, // games.select('id').eq('tournament_id', …)
      { data: players, error: null }, // game_players.select(…).in('game_id', …)
    ]);

    const { loadTournamentParticipantEmails } = await import(
      './tournamentParticipants'
    );
    const recipients = await loadTournamentParticipantEmails('T1');

    // Hele settet, hver spiller én gang, ingen e-postløse.
    expect(recipients.map((r) => r.user_id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `P${i + 1}`),
    );
    expect(recipients[0]).toEqual({
      user_id: 'P1',
      email: 'p1@x.no',
      name: 'Spiller 1',
      locale: 'no',
    });

    // Det er admin-klienten som ble spurt — den request-scopede ville sett 4 av
    // 12 — og spørringene er scopet til denne cupen og dens kamper. Uten
    // RLS-en som backstop er scopingen det eneste som holder fan-outen inne.
    expect(adminMock.__fromCalls).toEqual(
      expect.arrayContaining([
        { table: 'games', method: 'eq', args: ['tournament_id', 'T1'] },
        { table: 'game_players', method: 'in', args: ['game_id', ['G1', 'G2', 'G3']] },
      ]),
    );
  });
});
