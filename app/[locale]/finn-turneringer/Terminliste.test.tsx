import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Terminliste } from './Terminliste';
import type { GameSeats } from '@/lib/games/terminliste';
import type { DiscoverableOpenGame } from '@/lib/games/getDiscoverableGames';

/**
 * Type C — ONE render test for the terminliste (#2258): the chips (links, the
 * active one marked), «Klubben min» without club rounds, a day heading, the
 * capacity line on a capped row against the friend line on an uncapped one, a
 * full row without a button, and «Lag din egen runde». The numbers, the
 * grouping and the filters are Type A (`lib/games/terminliste.test.ts`).
 */

const NOW = new Date('2026-10-01T10:00:00Z');

function open(over: Partial<DiscoverableOpenGame>): DiscoverableOpenGame {
  return {
    id: 'g',
    name: 'Runde',
    short_id: 'abcd0000',
    scheduled_tee_off_at: '2026-10-03T07:20:00Z',
    course_name: 'Byneset North',
    registration_mode: 'open',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    hole_segment: 'full',
    ...over,
  };
}

describe('Terminliste', () => {
  it('renders chips, days, the three kinds of rows and the create card', () => {
    const seats = new Map<string, GameSeats>([
      ['capped', { kind: 'capped', cap: 40, held: 8 }],
      ['full', { kind: 'capped', cap: 16, held: 16 }],
    ]);
    render(
      <Terminliste
        data={{
          clubGames: [],
          friendGames: [],
          pendingRequests: [],
          openGames: [
            open({
              id: 'capped',
              name: 'Høstscramble',
              short_id: 'capd0001',
              game_mode: 'texas_scramble',
              mode_config: {
                kind: 'texas_scramble',
                team_size: 4,
                teams_count: 2,
                team_handicap_pct: 10,
              },
            }),
            open({ id: 'friends', name: 'Onsdagsgolfen', short_id: 'frnd0001' }),
            open({
              id: 'full',
              name: 'Skinsrunden',
              short_id: 'full0001',
              game_mode: 'skins',
              mode_config: { kind: 'skins', team_size: 1, skins_scoring: 'net' },
            }),
          ],
        }}
        socialProof={{
          friends: { joinedCount: 2, knownFriendNames: ['Jonas B.', 'Marte L.'], knownFriendOverflow: 0 },
        }}
        seats={seats}
        filter="alle"
        now={NOW}
      />,
    );

    // Chips: links in a nav, the active one marked; «Klubben min» without club rounds.
    const nav = screen.getByRole('navigation');
    const chips = within(nav).getAllByRole('link');
    expect(chips.map((c) => c.textContent)).toEqual(['Alle', 'Denne helga', 'Klubben min']);
    expect(chips[0]).toHaveAttribute('aria-current', 'page');
    expect(chips[1]).not.toHaveAttribute('aria-current');
    expect(chips[2]).toHaveAttribute('href', '/finn-turneringer?vis=klubb');

    // One day heading with its relative label.
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(/^Lørdag 3\. oktober/);
    expect(heading).toHaveTextContent('om 2 dager');

    // Capped row: capacity line and «lag på 4»; the button opens the poster.
    const capped = screen.getByRole('link', { name: 'Meld meg på Høstscramble' });
    expect(capped).toHaveAttribute('href', '/signup/capd0001');
    expect(capped).toHaveTextContent('Meld på');
    const cappedRow = capped.closest('li') as HTMLElement;
    expect(cappedRow).toHaveTextContent('plasser ledige');
    expect(cappedRow).toHaveTextContent('lag på 4');

    // Uncapped row: the friends by first name, no capacity line.
    const friendRow = screen
      .getByRole('link', { name: 'Meld meg på Onsdagsgolfen' })
      .closest('li') as HTMLElement;
    expect(friendRow).toHaveTextContent('Jonas og Marte er med');
    expect(friendRow).not.toHaveTextContent('plasser');

    // Full row: «Fullt», no button, the whole row links to the poster.
    expect(screen.queryByRole('link', { name: 'Meld meg på Skinsrunden' })).toBeNull();
    const fullRow = screen.getByRole('link', { name: /Skinsrunden/ });
    expect(fullRow).toHaveAttribute('href', '/signup/full0001');
    expect(fullRow).toHaveTextContent('Fullt');

    // «Lag din egen runde».
    expect(
      screen.getByRole('link', { name: 'Fant du ikke noe? Lag din egen runde' }),
    ).toHaveAttribute('href', '/opprett-spill');
  });
});
