// #2579 (Type C): tavla tegner modellen den får. Tallene og tekstene er låst i
// `lib/soloBoard.test.ts`; her gjelder det formen: rader i modellens
// rekkefølge, gullskiva bare på lederen, prikkene og tegnforklaringen live,
// likt-linja og ingen hull-kolonne ferdig, «Vis alle» over seks rader, og
// stripas knapp.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SoloBoardModel, SoloBoardRow } from '../../lib/soloBoard';
import type { ReactionRowState } from '../../lib/useGameReactions';
import { ReactionsContext, type ReactionsContextValue } from './ReactionsProvider';
import { BoardStrip, SoloBoard } from './SoloBoard';

const row = (userId: string, rank: number, extra: Partial<SoloBoardRow> = {}): SoloBoardRow => ({
  userId,
  name: userId,
  shortName: userId,
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

describe('reaksjonene på tavla (#2754)', () => {
  const finished: SoloBoardModel = {
    ...live,
    variant: 'finished',
    showHoles: false,
    rows: ['a', 'b'].map((id, i) => row(id, i + 1, { movement: null, recent: [] })),
  };
  const value = (overrides: Partial<ReactionsContextValue> = {}): ReactionsContextValue => ({
    loaded: true,
    canReact: true,
    showHint: false,
    target: null,
    failure: null,
    getRow: (userId): ReactionRowState =>
      userId === 'a' ? { counts: { '👏': 3, '🔥': 2 }, mine: [] } : { counts: {}, mine: [] },
    openFor: jest.fn(),
    close: jest.fn(),
    toggle: jest.fn(),
    onRowOpened: jest.fn(),
    ...overrides,
  });
  const board = (model: SoloBoardModel, ctx: ReactionsContextValue) => (
    <ReactionsContext.Provider value={ctx}>
      <SoloBoard model={model} />
    </ReactionsContext.Provider>
  );

  it('uten provider er raden ingen knapp', async () => {
    await render(<SoloBoard model={live} />);
    expect(screen.queryAllByRole('button').map((b) => b.props.testID)).toEqual(['board-toggle']);
  });

  it('raden åpner stripa med fornavnet, og skiltet står på raden, live og ferdig', async () => {
    const ctx = value();
    const { rerender } = await render(board(live, ctx));
    expect(screen.getByTestId('reaction-plate-a', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('reaction-plate-b', { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(screen.getByTestId('board-row-a'));
    expect(ctx.openFor).toHaveBeenCalledWith({ userId: 'a', name: 'a' });

    await rerender(board(finished, ctx));
    expect(screen.getByTestId('reaction-plate-a', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('board-row-b'));
    expect(ctx.openFor).toHaveBeenCalledWith({ userId: 'b', name: 'b' });
  });

  it('den åpne raden får ringen på navneskiltet, og bare den', async () => {
    await render(board(live, value({ target: { userId: 'b', name: 'b' } })));
    const shadow = (id: string) => {
      const style = screen.getByTestId(`board-row-${id}-name`).props.style;
      return Object.assign({}, ...style.flat(2).filter(Boolean)).boxShadow as string;
    };
    expect(shadow('b')).toContain('0 0 0 2px');
    expect(shadow('c')).not.toContain('0 0 0 2px');
  });

  it('hjelpelinja står på tavla bare når hooken sier det', async () => {
    const { rerender } = await render(board(live, value({ showHint: true })));
    expect(screen.getByTestId('reaction-hint')).toBeTruthy();
    await rerender(board(live, value()));
    expect(screen.queryByTestId('reaction-hint')).toBeNull();
  });

  it('den som ikke kan reagere ser tallene, men raden er ingen knapp', async () => {
    await render(board(live, value({ canReact: false })));
    expect(screen.getByTestId('reaction-plate-a', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryAllByRole('button').map((b) => b.props.testID)).toEqual(['board-toggle']);
    expect(screen.getByTestId('board-row-a').props.accessibilityLabel).toBe(
      'a. Reaksjoner: Klappe 3, Ild 2',
    );
  });
});
