import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BringGuestRow } from './BringGuestRow';

// Type C (#2607, fase 2): the row on the game page, without and with the
// guest. Who sees it at all is `bringGuestBlock` (lib/games/bringGuest.test.ts).

describe('BringGuestRow', () => {
  it('links to the page and says who the guest is and where they stand', async () => {
    const guest = (status: 'pending' | 'approved') => ({
      requestId: 'req',
      userId: 'guest',
      name: 'Hilde Moen',
      status,
      hcpIndex: 24.6,
      tee: 'D' as const,
    });
    const rows = await Promise.all(
      [null, guest('approved'), guest('pending')].map(async (g) => {
        const { getByTestId, unmount } = render(await BringGuestRow({ gameId: 'game-1', guest: g }));
        const row = getByTestId('bring-guest-row');
        const out = [row.getAttribute('href'), row.textContent];
        unmount();
        return out;
      }),
    );
    expect(rows).toMatchInlineSnapshot(`
      [
        [
          "/games/game-1/ta-med-gjest",
          "Ta med en gjest›",
        ],
        [
          "/games/game-1/ta-med-gjest",
          "Hilde Moen er med som gjesten din›",
        ],
        [
          "/games/game-1/ta-med-gjest",
          "Hilde Moen venter på arrangøren›",
        ],
      ]
    `);
  });
});
