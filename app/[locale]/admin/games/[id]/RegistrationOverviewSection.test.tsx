import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * #2293: a failed count of pending requests hides «Venter» instead of claiming
 * 0 are waiting — same rule as the «Styr spillere» link (#2440).
 */

let serverMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));
vi.mock('./flightActions', () => ({
  toggleSignupsClosed: vi.fn(),
}));

const PROPS = {
  gameId: 'game-1',
  registrationMode: 'manual_approval' as const,
  gameStatus: 'scheduled' as const,
  signupsClosedAt: null,
  shortId: 'abc123',
  selfRegisteredCount: 0,
};

describe('RegistrationOverviewSection', () => {
  it.each<{ name: string; count: QueryResult; shown: string | null }>([
    { name: 'tellingen feiler', count: { data: null, error: { message: 'boom' }, count: null }, shown: null },
    { name: 'tre venter', count: { data: null, error: null, count: 3 }, shown: '3' },
  ])('$name → «Venter» $shown', async ({ count, shown }) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    serverMock = buildSupabaseMock([count]);

    const { RegistrationOverviewSection } = await import('./RegistrationOverviewSection');
    render(await RegistrationOverviewSection(PROPS));

    if (shown === null) {
      expect(screen.queryByTestId('pending-count')).toBeNull();
      expect(screen.queryByText('0')).toBeNull();
    } else {
      expect(screen.getByTestId('pending-count').textContent).toBe(shown);
    }
    cleanup();
  });
});
