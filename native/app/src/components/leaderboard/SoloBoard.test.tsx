// #2579 (Type C): tavla tegner modellen den får. Tallene og tekstene er låst i
// `lib/soloBoard.test.ts`; her gjelder det formen: rader i modellens
// rekkefølge, gullskiva bare på lederen, prikkene og tegnforklaringen live,
// likt-linja og ingen hull-kolonne ferdig, «Vis alle» over seks rader, og
// stripas knapp.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SoloBoardModel, SoloBoardRow } from '../../lib/soloBoard';
import { BoardStrip, SoloBoard } from './SoloBoard';

const row = (userId: string, rank: number, extra: Partial<SoloBoardRow> = {}): SoloBoardRow => ({
  userId,
  name: userId,
  place: String(rank),
  leader: rank === 1,
  you: false,
  holesPlayed: 7,
  total: String(30 - rank),
  movement: 0,
  recent: ['under', 'par', 'over1', 'over2', 'par'],
  note: null,
  a11y: userId,
  ...extra,
});

const live: SoloBoardModel = {
  variant: 'live',
  pill: { text: 'pill', live: true },
  totalHeading: 'total',
  showHoles: true,
  rows: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) =>
    row(id, i + 1, id === 'g' ? { you: true, movement: 2 } : {}),
  ),
  viewerId: 'g',
  strip: null,
};

it('tegner live og ferdig tavle i modellens form, og stripas knapp virker', async () => {
  const { rerender } = await render(<SoloBoard model={live} />);

  // Sammenfoldet: de fem første, et hopp og din rad.
  expect(screen.getAllByTestId(/^board-row-[a-z]$/).map((r) => r.props.testID)).toEqual([
    'board-row-a',
    'board-row-b',
    'board-row-c',
    'board-row-d',
    'board-row-e',
    'board-row-g',
  ]);
  expect(screen.getByTestId('board-gap')).toBeTruthy();
  expect(screen.getAllByTestId('board-leader-disc')).toHaveLength(1);
  expect(screen.getAllByTestId('board-dot')).toHaveLength(6 * 5);
  expect(screen.getByTestId('board-legend')).toBeTruthy();
  expect(screen.getByTestId('board-row-g-holes')).toBeTruthy();
  // Skjermleseren får radens linje fra modellen, ikke skiltene hver for seg.
  expect(screen.getByTestId('board-row-g')).toHaveProp('accessibilityLabel', 'g');

  await fireEvent.press(screen.getByTestId('board-toggle'));
  expect(screen.getAllByTestId(/^board-row-[a-z]$/)).toHaveLength(8);
  expect(screen.queryByTestId('board-gap')).toBeNull();

  const finished: SoloBoardModel = {
    ...live,
    variant: 'finished',
    showHoles: false,
    rows: [row('a', 1), row('b', 2), row('c', 3, { you: true, note: 'note' })].map((r) => ({
      ...r,
      movement: null,
      recent: [],
    })),
    viewerId: 'c',
  };
  await rerender(<SoloBoard model={finished} />);
  expect(screen.queryByTestId('board-legend')).toBeNull();
  expect(screen.queryAllByTestId('board-dot')).toHaveLength(0);
  expect(screen.queryByTestId('board-toggle')).toBeNull();
  expect(screen.queryByTestId('board-row-a-holes')).toBeNull();
  expect(screen.getAllByTestId('board-tie-note')).toHaveLength(1);
  expect(screen.getAllByTestId('board-leader-disc')).toHaveLength(1);

  const onAction = jest.fn();
  await rerender(
    <BoardStrip
      strip={{ kicker: 'k', text: 't', action: { kind: 'scorecard', label: 'l' } }}
      finished
      bottom={20}
      onAction={onAction}
    />,
  );
  await fireEvent.press(screen.getByTestId('board-strip-action'));
  expect(onAction).toHaveBeenCalledTimes(1);
});
