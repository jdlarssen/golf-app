import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

// Type C (#2607): DELTAKERE marks a guest with the «Gjest» chip, as «Styr
// spillere» does, and nobody else.

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('./gameContext', () => ({
  getGameContext: async () => ({ supabase: supabaseMock, userId: 'me' }),
}));

describe('FlightRoster', () => {
  it('the guest row carries the «Gjest» chip', async () => {
    const user = (name: string, is_guest: boolean) => ({ name, nickname: null, hcp_index: 18, is_guest });
    supabaseMock = buildSupabaseMock(
      [
        {
          data: [
            { user_id: 'me', flight_number: null, accepted_at: '2026-10-31T10:00:00Z', users: user('Ola Vert', false) },
            { user_id: 'guest', flight_number: null, accepted_at: '2026-10-31T10:00:00Z', users: user('Hilde Moen', true) },
            { user_id: 'mate', flight_number: null, accepted_at: '2026-10-31T10:00:00Z', users: user('Kari Venn', false) },
          ],
          error: null,
        },
      ],
      { incomplete_profile_ids: [] },
    );
    const { FlightRoster } = await import('./FlightRoster');
    render(await FlightRoster({ gameId: 'game', flightNumber: null, currentUserId: 'me', testId: 'list' }));

    const rows = Array.from(screen.getByTestId('list').querySelectorAll('li'), (li) => ({
      text: li.textContent,
      guest: li.querySelector('[data-testid="guest-badge"]') !== null,
    }));
    expect(rows.map((r) => r.guest)).toEqual([false, true, false]);
    expect(rows[1]!.text).toContain('Gjest');
  });
});
