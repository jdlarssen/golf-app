import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InviteToGameClient } from './InviteToGameClient';

/**
 * #1017: the «Gjest»-chip must mark shadow users (users.is_guest) in the admin
 * invite-card candidate list. One render test on this representative surface —
 * the same isGuest → GuestBadge threading is reused verbatim in
 * CreatorRosterClient, TeamRegistrationForm and PlayersListClient.
 */

vi.mock('./inviteToGameActions', () => ({
  addExistingPlayerToGame: vi.fn(),
  inviteEmailToGame: vi.fn(),
}));
vi.mock('@/app/[locale]/games/guestPlayerActions', () => ({
  addGuestToGame: vi.fn(),
}));

describe('InviteToGameClient — gjest-chip (#1017)', () => {
  it('viser «Gjest»-chip kun for gjest-kandidaten, ikke for en vanlig spiller', () => {
    render(
      <InviteToGameClient
        gameId="g1"
        disabled={false}
        candidates={[
          {
            id: 'u1',
            name: 'Kari Nordmann',
            nickname: null,
            email: 'kari@example.com',
            hcpIndex: 12.3,
            isGuest: false,
          },
          {
            id: 'u2',
            name: 'Gjesten',
            nickname: null,
            email: 'gjest@example.com',
            hcpIndex: 20,
            isGuest: true,
          },
        ]}
      />,
    );

    // Both candidates render; exactly one carries the guest chip.
    expect(screen.getByText('Kari Nordmann')).toBeInTheDocument();
    expect(screen.getByText('Gjesten')).toBeInTheDocument();
    expect(screen.getAllByTestId('guest-badge')).toHaveLength(1);
  });
});
