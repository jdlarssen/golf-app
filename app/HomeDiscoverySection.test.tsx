import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeDiscoverySection } from './HomeDiscoverySection';
import type { DiscoverableOpenGame } from '@/lib/games/getDiscoverableGames';

// SmartLink/LinkButton lener seg på next/link → useRouter for prefetch.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: () => {} }),
  usePathname: () => '/',
}));

function openGame(over: Partial<DiscoverableOpenGame>): DiscoverableOpenGame {
  return {
    id: 'g1',
    name: 'Turnering',
    short_id: 'abc123xy',
    scheduled_tee_off_at: null,
    course_name: null,
    registration_mode: 'open',
    ...over,
  };
}

describe('HomeDiscoverySection', () => {
  // Påmeldingsmåten ER synligheten (#357): CTA-en speiler modus, men begge
  // lenker til samme /signup-side som ruter videre på registration_mode.
  it('viser «Meld meg på» for open og «Be om å bli med» for manual_approval', () => {
    render(
      <HomeDiscoverySection
        data={{
          openGames: [
            openGame({ id: 'g1', short_id: 'open0001', registration_mode: 'open' }),
            openGame({
              id: 'g2',
              short_id: 'appr0002',
              registration_mode: 'manual_approval',
            }),
          ],
          pendingRequests: [],
        }}
      />,
    );

    const meldDeg = screen.getByRole('link', { name: 'Meld meg på' });
    const beOm = screen.getByRole('link', { name: 'Be om å bli med' });

    expect(meldDeg).toHaveAttribute('href', '/signup/open0001');
    expect(beOm).toHaveAttribute('href', '/signup/appr0002');
  });
});
