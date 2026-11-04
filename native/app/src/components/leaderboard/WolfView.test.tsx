// #2314 — Type C: regel-linja for de siste hullene står under stillingen bare
// i spill med catch-up-regelen. Tallene er `wolfCatchUpRuleLine` sine.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { WolfResult } from '../../../../../lib/scoring/modes/types';
import { ReactionsContext } from './ReactionsProvider';
import { WolfView } from './WolfView';

function resultWith(rotation: WolfResult['rotation'], n: number): WolfResult {
  return {
    kind: 'wolf',
    scoring: 'net',
    rotation,
    holes: [],
    players: Array.from({ length: n }, (_, i) => ({
      userId: `p${i + 1}`,
      teamNumber: i + 1,
      totalPoints: 0,
      wolfHolesPlayed: 0,
      blindWolfWins: 0,
      rank: 1,
      tiedWith: [],
    })),
  };
}

describe('WolfView — catch-up-regelen (#2314)', () => {
  it('viser regelen med riktige hull og terskel i et nytt spill', async () => {
    await render(
      <WolfView result={resultWith('catch_up', 4)} settlement={null} nameOf={(id) => id} />,
    );
    const line = screen.getByTestId('wolf-catch-up-rule');
    expect(line).toBeTruthy();
    expect(screen.getByText('Hull 17–18:')).toBeTruthy();
    expect(
      screen.getByText(/Ligger den som er sist, minst 4 poeng bak lederen, blir den ulv\./),
    ).toBeTruthy();
  });

  it('tre spillere: hull 16–18 og terskel 3', async () => {
    await render(
      <WolfView result={resultWith('catch_up', 3)} settlement={null} nameOf={(id) => id} />,
    );
    expect(screen.getByText('Hull 16–18:')).toBeTruthy();
    expect(screen.getByText(/minst 3 poeng bak lederen/)).toBeTruthy();
  });

  it('viser ingen regel-linje i et spill fra før', async () => {
    await render(
      <WolfView
        result={resultWith('random_with_trailing', 4)}
        settlement={null}
        nameOf={(id) => id}
      />,
    );
    expect(screen.queryByTestId('wolf-catch-up-rule')).toBeNull();
  });
});

describe('WolfView — reaksjonene (#2754)', () => {
  it('stillingen har reaksjonene én gang per spiller, og ingen andre steder', async () => {
    const openFor = jest.fn();
    await render(
      <ReactionsContext.Provider
        value={{
          loaded: true,
          canReact: true,
          showHint: false,
          target: null,
          failure: null,
          getRow: () => ({ counts: { '👏': 1 }, mine: [] }),
          openFor,
          close: jest.fn(),
          toggle: jest.fn(),
          onRowOpened: jest.fn(),
        }}
      >
        <WolfView result={resultWith('catch_up', 4)} settlement={null} nameOf={(id) => id} />
      </ReactionsContext.Provider>,
    );
    const players = resultWith('catch_up', 4).players.map((player) => player.userId);
    expect(screen.getAllByTestId(/^reaction-plate-/, { includeHiddenElements: true }).map((plate) => plate.props.testID)).toEqual(
      players.map((id) => `reaction-plate-${id}`),
    );
    expect(screen.getAllByRole('button').map((button) => button.props.testID)).toEqual(
      players.map((id) => `leaderboard-table-row-${id}`),
    );
    await fireEvent.press(screen.getByTestId(`leaderboard-table-row-${players[0]}`));
    expect(openFor).toHaveBeenCalledWith({ userId: players[0], name: players[0] });
  });
});
