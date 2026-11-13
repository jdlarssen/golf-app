// #2754 (Type C): de enkle formatene har reaksjonene på stillingen, én gang per
// spiller. Lag og matchplay går ikke gjennom disse radene (#977), og Skins har
// en slank stilling uten reaksjoner (#2317).
import { render, screen } from '@testing-library/react-native';
import { fours, nassauResult } from '../../../../../lib/leaderboard/__fixtures__/nassauResult';
import type { ModeResult } from '../../../../../lib/scoring/modes/types';
import { ReactionsContext, type ReactionsContextValue } from './ReactionsProvider';
import { ResultView } from './ResultView';

const PLAYERS = ['a', 'b', 'c'];

const value: ReactionsContextValue = {
  loaded: true,
  canReact: true,
  showHint: false,
  target: null,
  failure: null,
  getRow: () => ({ counts: { '👏': 1 }, mine: [] }),
  openFor: jest.fn(),
  close: jest.fn(),
  toggle: jest.fn(),
  onRowOpened: jest.fn(),
};

const players = (fields: object) =>
  PLAYERS.map((userId, index) => ({ userId, rank: index + 1, tiedWith: [], ...fields }));

const RESULTS: [string, object, string][] = [
  // #2755: Nassau har egen tavla; resultatet kommer fra den ekte motoren.
  ['nassau', nassauResult({ a: fours(3), b: fours(3), c: fours(3) }), 'nassau-row'],
  ['nines', { kind: 'nines', players: players({ totalPoints: 0, holesScored: 3 }) }, 'leaderboard-table-row'],
  ['round_robin', { kind: 'round_robin', players: players({ totalHoleWins: 0, totalHolesLost: 0 }) }, 'leaderboard-table-row'],
  ['acey_deucey', { kind: 'acey_deucey', players: players({ total: 0, aces: 0 }) }, 'leaderboard-table-row'],
  ['bingo_bango_bongo', { kind: 'bingo_bango_bongo', players: players({ bingos: 0, bangos: 0, bongos: 0, totalPoints: 0 }) }, 'bbb-player'],
];

it.each(RESULTS)('%s: ett skilt og én knapp per spiller, og ingen andre steder', async (_name, result, prefix) => {
  await render(
    <ReactionsContext.Provider value={value}>
      <ResultView
        result={result as ModeResult}
        status="active"
        settlement={null}
        nameOf={(id) => id}
      />
    </ReactionsContext.Provider>,
  );
  expect(
    screen.getAllByTestId(/^reaction-plate-/, { includeHiddenElements: true }).map((plate) => plate.props.testID),
  ).toEqual(PLAYERS.map((id) => `reaction-plate-${id}`));
  expect(screen.getAllByRole('button').map((button) => button.props.testID)).toEqual(
    PLAYERS.map((id) => `${prefix}-${id}`),
  );
});
