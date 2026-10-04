import { it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NeedsYouList } from './NeedsYouList';

/**
 * #2268, Type C: «Trenger deg» is a list where each row has exactly one
 * control. Structure only; the counts and names come from
 * `lib/games/organizerDesk.ts`, tested there.
 */
it('gives each row its one control: «Se over» a link, «Påminn» a button', () => {
  render(
    <NeedsYouList
      pendingApproval={{ count: 2, names: 'A og B' }}
      finished={{ count: 1, names: 'C', remindAction: async () => {} }}
      gaps={[
        {
          key: 'd',
          names: 'D',
          people: 1,
          holes: '10',
          holeCount: 1,
          where: { kind: 'group', group: 'Flight 2', hole: 12 },
          remind: { action: async () => {}, names: 'D', people: 1 },
        },
        {
          key: 'e',
          names: 'E',
          people: 1,
          holes: '4',
          holeCount: 1,
          where: { kind: 'entered', hole: 6 },
          remind: { action: async () => {}, names: 'E', people: 1 },
        },
        {
          // Guests only: the row stands, with no control.
          key: 'g',
          names: 'G',
          people: 1,
          holes: '7',
          holeCount: 1,
          where: { kind: 'entered', hole: 9 },
          remind: null,
        },
      ]}
    />,
  );

  const list = screen.getByRole('list');
  expect(within(list).getAllByRole('listitem')).toHaveLength(5);

  const pending = screen.getByTestId('pult-row-pending');
  expect(within(pending).getAllByRole('link')).toHaveLength(1);
  expect(within(pending).getByRole('link')).toHaveAttribute('href', '#leverte-scorekort');
  expect(within(pending).queryByRole('button')).toBeNull();

  const finished = screen.getByTestId('pult-row-finished');
  expect(within(finished).getAllByRole('button')).toHaveLength(1);
  expect(within(finished).queryByRole('link')).toBeNull();

  const gaps = screen.getAllByTestId('pult-row-gap');
  expect(gaps).toHaveLength(3);
  // #2268, the owner's choice B: a skipped-hole row has «Påminn» too…
  for (const gap of gaps.slice(0, 2)) {
    expect(within(gap).getAllByRole('button')).toHaveLength(1);
    expect(within(gap).queryByRole('link')).toBeNull();
  }
  // …except a row of guests only, which no one can be reminded about.
  expect(within(gaps[2]).queryByRole('button')).toBeNull();
  expect(within(gaps[2]).queryByRole('link')).toBeNull();
});
