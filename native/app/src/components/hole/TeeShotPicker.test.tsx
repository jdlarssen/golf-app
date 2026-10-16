// #2580: den ene render-testen (Type C) for «Hvem sitt utslag ble brukt?» på
// hullsiden. Regelen (hvem som kan velges, låsen, linja) er Type A i
// lib/games/teeShots.test.ts og tekstene i teeShotsCopy.test.ts. Her er
// koblingen: en låst knapp er sperret og sier «kan ikke velges nå», linja under
// står, et trykk melder lagets valg, og et trykk på det valgte navnet tømmer.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { themeFor } from '../../theme';
import type { TeeShotTeam } from '../../lib/teeShotTeams';
import { TeeShotPicker } from './TeeShotPicker';

const TEAM: TeeShotTeam = {
  teamNumber: 1,
  members: ['marte', 'jonas', 'sigrid', 'per'].map((userId) => ({
    userId,
    name: userId[0]!.toUpperCase() + userId.slice(1),
    submittedAt: null,
    withdrawnAt: null,
  })),
};

// Utslag 2b: hull 1–15 valgt (Marte 6, Jonas 4, Sigrid 3, Per 2), tre hull igjen.
const OWNERS = [
  ...Array<string>(6).fill('marte'),
  ...Array<string>(4).fill('jonas'),
  ...Array<string>(3).fill('sigrid'),
  ...Array<string>(2).fill('per'),
];
const ROWS = OWNERS.map((teeShotBy, i) => ({ teamNumber: 1, holeNumber: i + 1, teeShotBy }));

describe('TeeShotPicker', () => {
  it('låser dem som har nok, melder trykket og tømmer det valgte navnet', async () => {
    const onPick = jest.fn();
    const { rerender } = await render(
      <TeeShotPicker
        holeNumber={16}
        gameMode="texas_scramble"
        minimum={4}
        teams={[TEAM]}
        rows={ROWS}
        disabled={false}
        onPick={onPick}
      />,
    );

    // Ett lag i flighten: ingen lagetikett.
    expect(screen.getByText('Hvem sitt utslag ble brukt?')).toBeTruthy();
    const marte = screen.getByLabelText('Marte, har 6 utslag, kan ikke velges nå');
    expect(marte.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('tee-shot-marte')).toHaveStyle({
      borderStyle: 'dashed',
      backgroundColor: themeFor('light').colors.bg,
    });
    expect(screen.getByTestId('tee-shot-line-1').props.children).toBe(
      'Sigrid og Per trenger utslagene på de tre hullene som er igjen.',
    );

    await fireEvent.press(screen.getByTestId('tee-shot-marte'));
    expect(onPick).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Per, 2 av 4 utslag'));
    expect(onPick).toHaveBeenCalledWith(1, 'per');

    // Per valgt på hull 16: et nytt trykk på Per tømmer hullet.
    onPick.mockClear();
    await rerender(
      <TeeShotPicker
        holeNumber={16}
        gameMode="texas_scramble"
        minimum={4}
        teams={[TEAM]}
        rows={[...ROWS, { teamNumber: 1, holeNumber: 16, teeShotBy: 'per' }]}
        disabled={false}
        onPick={onPick}
      />,
    );
    expect(screen.getByTestId('tee-shot-per').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('tee-shot-per'));
    expect(onPick).toHaveBeenCalledWith(1, null);
  });
});
