import { it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NeedsYouList } from './NeedsYouList';

/**
 * #2268, Type C: «Trenger deg» is a list where each row has at most one
 * control. Structure only; the counts and names come from
 * `lib/games/organizerDesk.ts`, tested there.
 */
it('gives each row its one control: a link, a button, or none', () => {
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
        },
        {
          key: 'e',
          names: 'E',
          people: 1,
          holes: '4',
          holeCount: 1,
          where: { kind: 'entered', hole: 6 },
        },
      ]}
    />,
  );

  const list = screen.getByRole('list');
  expect(within(list).getAllByRole('listitem')).toHaveLength(4);

  const pending = screen.getByTestId('pult-row-pending');
  expect(within(pending).getAllByRole('link')).toHaveLength(1);
  expect(within(pending).getByRole('link')).toHaveAttribute('href', '#leverte-scorekort');
  expect(within(pending).queryByRole('button')).toBeNull();

  const finished = screen.getByTestId('pult-row-finished');
  expect(within(finished).getAllByRole('button')).toHaveLength(1);
  expect(within(finished).queryByRole('link')).toBeNull();

  const gaps = screen.getAllByTestId('pult-row-gap');
  expect(gaps).toHaveLength(2);
  for (const gap of gaps) {
    expect(within(gap).queryByRole('link')).toBeNull();
    expect(within(gap).queryByRole('button')).toBeNull();
  }
});
