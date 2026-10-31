import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

// Type C (#2607, fase 2): the page without a guest is the guest card
// (screen 2); with one it is «Gjesten din» with the status and «Fjern
// gjesten» (screen 3). The gate is `bringGuestBlock`'s own test.

vi.mock('@/lib/auth/userId', () => ({ getProxyVerifiedUserId: async () => HOST }));
// redirect only runs without a logged-in user; the gate's 404 is not reached
// in these cases.
vi.mock('@/i18n/navigation', () => ({ redirect: () => {} }));
vi.mock('./actions', () => ({ bringGuest: vi.fn(), removeBroughtGuest: vi.fn() }));

let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => serverMock }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));

const HOST = '11111111-1111-1111-1111-111111111111';
const GAME = '33333333-3333-3333-3333-333333333333';

const game = {
  id: GAME,
  name: 'Lørdagsrunden',
  status: 'scheduled',
  created_by: '22222222-2222-2222-2222-222222222222',
  game_mode: 'stableford',
  registration_mode: 'manual_approval',
  registration_type: 'solo',
  signups_closed_at: null,
  tournament_id: null,
  league_round_id: null,
  courses: { name: 'Byneset North' },
  tee_boxes: null,
};

const hilde = {
  id: 'req-h',
  user_id: 'guest',
  status: 'pending',
  users: { is_guest: true, name: 'Hilde Moen', nickname: null, email: 'g@guest.tornygolf.no', hcp_index: 24.6, gender: 'ladies', level: 'normal' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/games/[id]/ta-med-gjest', () => {
  it.each([
    ['no guest yet: the guest card and the note about the organiser', [], 'bring-guest-form'],
    ['a pending guest: «Gjesten din» with the status and «Fjern gjesten»', [hilde], 'bring-guest-card'],
  ])('%s', async (_label, brought, testId) => {
    serverMock = buildSupabaseMock([{ data: game, error: null }]);
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        game_players: [{ data: { withdrawn_at: null }, error: null }],
        users: [{ data: { is_guest: false }, error: null }],
        game_registration_requests: [{ data: brought, error: null }],
      },
    });
    const { default: Page } = await import('./page');
    render(
      await Page({ params: Promise.resolve({ id: GAME }), searchParams: Promise.resolve({}) }),
    );
    expect(screen.getByTestId(testId)).toBeTruthy();
    const main = screen.getByRole('heading', { level: 1 }).parentElement!;
    expect(
      Array.from(main.querySelectorAll('h1, h2, p, span.block, [data-testid="bring-guest-status"], button'), (el) =>
        el.textContent?.trim(),
      ).filter(Boolean),
    ).toMatchSnapshot();
  });
});
