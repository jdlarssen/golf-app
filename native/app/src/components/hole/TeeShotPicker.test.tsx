// #2580: den ene render-testen (Type C) for «Hvem sitt utslag ble brukt?» på
// hullsiden. Regelen (hvem som kan velges, låsen, linja) er Type A i
// lib/games/teeShots.test.ts og setningene i teeShotsCopy.test.ts. Her er
// koblingen, sjekket på struktur og tilstand: en låst knapp er sperret og får
// etiketten med «kan ikke velges nå», linja under står, et trykk melder lagets
// valg, og et trykk på det valgte navnet tømmer.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { themeFor } from '../../theme';
import type { TeeShotTeam } from '../../lib/teeShotTeams';
import { teeShotButtonLabel, teeShotsT } from '../../lib/teeShotsCopy';
import { TeeShotPicker } from './TeeShotPicker';

const team = (teamNumber: number, ids: string[]): TeeShotTeam => ({
  teamNumber,
  members: ids.map((userId) => ({ userId, name: userId, submittedAt: null, withdrawnAt: null })),
});
const TEAM = team(1, ['marte', 'jonas', 'sigrid', 'per']);

// Utslag 2b: hull 1–15 valgt (marte 6, jonas 4, sigrid 3, per 2), tre hull igjen.
const OWNERS = [
  ...Array<string>(6).fill('marte'),
  ...Array<string>(4).fill('jonas'),
  ...Array<string>(3).fill('sigrid'),
  ...Array<string>(2).fill('per'),
];
const ROWS = OWNERS.map((teeShotBy, i) => ({ teamNumber: 1, holeNumber: i + 1, teeShotBy }));

function picker(rows: typeof ROWS, onPick: jest.Mock, teams = [TEAM]) {
  return (
    <TeeShotPicker
      holeNumber={16}
      gameMode="texas_scramble"
      minimum={4}
      teams={teams}
      rows={rows}
      disabled={false}
      onPick={onPick}
    />
  );
}

describe('TeeShotPicker', () => {
  it('låser dem som har nok, melder trykket og tømmer det valgte navnet', async () => {
    const onPick = jest.fn();
    const { rerender } = await render(picker(ROWS, onPick));

    // Én blokk per lag, uten lagetikett når flighten har ett lag.
    expect(screen.getByTestId('tee-shot-team-1')).toBeTruthy();
    expect(screen.queryByText(teeShotsT('teamLabel', { team: 1 }), { exact: false })).toBeNull();

    // Låst: sperret, stiplet kant på bakgrunnen, og etiketten sier at den ikke kan velges.
    const marte = screen.getByTestId('tee-shot-marte');
    expect(marte.props.accessibilityState).toMatchObject({ disabled: true, selected: false });
    expect(marte).toHaveStyle({ borderStyle: 'dashed', backgroundColor: themeFor('light').colors.bg });
    expect(marte.props.accessibilityLabel).toBe(
      teeShotButtonLabel('marte', { userId: 'marte', count: 6, missing: 0 }, 4, false),
    );
    // Åpen: kan trykkes, og etiketten er uten tillegget.
    const per = screen.getByTestId('tee-shot-per');
    expect(per.props.accessibilityState).toMatchObject({ disabled: false, selected: false });
    expect(per.props.accessibilityLabel).toBe(teeShotButtonLabel('per', { userId: 'per', count: 2, missing: 2 }, 4, true));
    // Låsen har en linje under knappene.
    expect(screen.getByTestId('tee-shot-line-1')).toBeTruthy();

    await fireEvent.press(marte);
    expect(onPick).not.toHaveBeenCalled();
    await fireEvent.press(per);
    expect(onPick).toHaveBeenCalledWith(1, 'per');

    // per valgt på hull 16: knappen er valgt, og et nytt trykk tømmer hullet.
    onPick.mockClear();
    await rerender(picker([...ROWS, { teamNumber: 1, holeNumber: 16, teeShotBy: 'per' }], onPick));
    expect(screen.getByTestId('tee-shot-per').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('tee-shot-per'));
    expect(onPick).toHaveBeenCalledWith(1, null);

    // To lag i flighten: én blokk hver, med lagetikett.
    await rerender(picker(ROWS, onPick, [TEAM, team(2, ['kari', 'ola'])]));
    expect(screen.getByTestId('tee-shot-team-2')).toBeTruthy();
    expect(screen.getAllByText(teeShotsT('teamLabel', { team: 2 }), { exact: false })).toHaveLength(1);
  });
});
