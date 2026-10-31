import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ScheduledActionsCard } from './ScheduledActionsCard';

// Type B (#2607, the owner's answer 31.10): the drawing's list card under
// «Du er påmeldt». With the guest row it opens with «Ta med en gjest» (or the
// guest and where they stand); without it the same card has calendar and map.
// Calendar stays a plain link to the .ics route (#945), map opens a new tab.
// Who gets the guest row is `bringGuestBlock` (lib/games/bringGuest.test.ts).

const CALENDAR = '/no/games/game-1/calendar';
const MAP = 'https://www.google.com/maps/search/?api=1&query=Byneset%20North';

const guest = (status: 'pending' | 'approved') => ({
  requestId: 'req',
  userId: 'guest',
  name: 'Hilde Moen',
  status,
  hcpIndex: 24.6,
  tee: 'D' as const,
});

async function rows(props: Parameters<typeof ScheduledActionsCard>[0]) {
  const node = await ScheduledActionsCard(props);
  if (node === null) return null;
  const { container, unmount } = render(node);
  const card = container.querySelector('[data-testid="scheduled-actions"]')!;
  const out = Array.from(card.querySelectorAll('a'), (a) =>
    [a.dataset.testid, a.getAttribute('href'), a.getAttribute('target'), a.textContent].join(' | '),
  );
  unmount();
  return out;
}

describe('ScheduledActionsCard', () => {
  it('with the guest row: the guest first, then calendar and map', async () => {
    const both = { gameId: 'game-1', calendarHref: CALENDAR, mapHref: MAP };
    expect({
      noGuestYet: await rows({ ...both, guestRow: { guest: null } }),
      guestIn: await rows({ ...both, guestRow: { guest: guest('approved') } }),
      guestWaiting: await rows({ ...both, guestRow: { guest: guest('pending') } }),
    }).toMatchInlineSnapshot(`
      {
        "guestIn": [
          "bring-guest-row | /games/game-1/ta-med-gjest |  | Hilde Moen er med som gjesten din›",
          "calendar-row | /no/games/game-1/calendar |  | Legg i kalenderen›",
          "map-row | https://www.google.com/maps/search/?api=1&query=Byneset%20North | _blank | Vis på kart›",
        ],
        "guestWaiting": [
          "bring-guest-row | /games/game-1/ta-med-gjest |  | Hilde Moen venter på arrangøren›",
          "calendar-row | /no/games/game-1/calendar |  | Legg i kalenderen›",
          "map-row | https://www.google.com/maps/search/?api=1&query=Byneset%20North | _blank | Vis på kart›",
        ],
        "noGuestYet": [
          "bring-guest-row | /games/game-1/ta-med-gjest |  | Ta med en gjest›",
          "calendar-row | /no/games/game-1/calendar |  | Legg i kalenderen›",
          "map-row | https://www.google.com/maps/search/?api=1&query=Byneset%20North | _blank | Vis på kart›",
        ],
      }
    `);
  });

  it('without the guest row: the same card with calendar and map only', async () => {
    expect({
      both: await rows({ gameId: 'game-1', guestRow: null, calendarHref: CALENDAR, mapHref: MAP }),
      noTeeOff: await rows({ gameId: 'game-1', guestRow: null, calendarHref: null, mapHref: MAP }),
      nothing: await rows({ gameId: 'game-1', guestRow: null, calendarHref: null, mapHref: null }),
    }).toMatchInlineSnapshot(`
      {
        "both": [
          "calendar-row | /no/games/game-1/calendar |  | Legg i kalenderen›",
          "map-row | https://www.google.com/maps/search/?api=1&query=Byneset%20North | _blank | Vis på kart›",
        ],
        "noTeeOff": [
          "map-row | https://www.google.com/maps/search/?api=1&query=Byneset%20North | _blank | Vis på kart›",
        ],
        "nothing": null,
      }
    `);
  });
});
