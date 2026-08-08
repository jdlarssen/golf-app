import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * #1540: mottakerlista til cup-varslene ble bygget med den request-scopede
 * klienten. RLS-en på `game_players` (`is_admin() OR is_in_game(game_id)`) lot
 * en arrangør som ikke er global admin bare se sin egen flight, så lista
 * kollapset — 4 av 12 deltakere fikk `cup_finished`, og mail-fan-outen
 * filtreres på samme liste.
 *
 * Testen låser regresjonen mekanisk: oppslaget MÅ gå via admin-klienten (den
 * eneste som ser hele deltaker-settet), og hele settet må komme ut. Én test —
 * helperen tar ikke lenger en klient, så det finnes ikke flere varianter å
 * dekke.
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
  it('leser hele deltaker-settet via admin-klienten, ikke den request-scopede', async () => {
    // 12 deltakere fordelt på 3 kamper — arrangøren (P1) spiller bare den ene.
    const games = Array.from({ length: 3 }, (_, i) => ({ id: `G${i + 1}` }));
    const players = Array.from({ length: 12 }, (_, i) => ({
      user_id: `P${i + 1}`,
      users: {
        email: `p${i + 1}@x.no`,
        name: `Spiller ${i + 1}`,
        locale: 'no',
      },
    }));
    adminMock = buildSupabaseMock([
      { data: games, error: null }, // games.select('id').eq('tournament_id', …)
      { data: players, error: null }, // game_players.select(…).in('game_id', …)
    ]);

    const { loadTournamentParticipantEmails } = await import(
      './tournamentParticipants'
    );
    const recipients = await loadTournamentParticipantEmails('T1');

    // Hele settet, ikke arrangørens flight.
    expect(recipients.map((r) => r.user_id)).toEqual(
      players.map((p) => p.user_id),
    );

    // Og det er admin-klienten som ble spurt — den request-scopede klienten
    // ville sett 4 av 12 her.
    expect(
      adminMock.__fromCalls.map((c) => c.table),
      'begge oppslagene går på admin-klienten',
    ).toEqual(expect.arrayContaining(['games', 'game_players']));
  });
});
