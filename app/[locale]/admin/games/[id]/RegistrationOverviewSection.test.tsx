import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  shortId: 'abc123',
  signupsClosedAt: null as string | null,
  selfRegisteredCount: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

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
      // The whole «Venter» block is gone, not just the number.
      expect(screen.queryByTestId('pending-block')).toBeNull();
      expect(screen.queryByTestId('pending-count')).toBeNull();
      expect(screen.queryByText('0')).toBeNull();
    } else {
      expect(screen.getByTestId('pending-block')).toBeTruthy();
      expect(screen.getByTestId('pending-count').textContent).toBe(shown);
    }
  });

  // #2570: the copy field and the poster follow isPubliclyViewable, the same
  // rule as the poster page and «Styr spillere».
  it.each<{ name: string; props: Partial<typeof PROPS>; shown: boolean }>([
    { name: 'planlagt, godkjenning, åpen påmelding', props: {}, shown: true },
    { name: 'planlagt, åpen påmelding', props: { registrationMode: 'open' as never }, shown: true },
    { name: 'påmeldingen stengt', props: { signupsClosedAt: '2026-10-18T10:00:00Z' }, shown: false },
    { name: 'bare inviterte', props: { registrationMode: 'invite_only' as never }, shown: false },
    { name: 'utkast', props: { gameStatus: 'draft' as never }, shown: false },
  ])('$name → delelenke $shown', async ({ props, shown }) => {
    serverMock = buildSupabaseMock([{ data: null, error: null, count: 0 }]);
    const { RegistrationOverviewSection } = await import('./RegistrationOverviewSection');
    render(await RegistrationOverviewSection({ ...PROPS, ...props }));
    expect(screen.queryByTestId('poster-link') !== null).toBe(shown);
    expect(screen.queryByDisplayValue('https://tornygolf.no/signup/abc123') !== null).toBe(shown);
  });
});
