// #2252: den ene render-testen (Type C) for en rad i flighten. Formen og tonen
// er delt kode (lib/scoring/scoreShape, scoreTone) og poengene er
// lib/scorecard/railPoints. Her er det koblingen: merkene står, en låst rad kan
// ikke velges, og aktiv rad får streken fra temaets mål.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { themeFor } from '../../theme';
import { FlightRow, type FlightRowProps } from './FlightRow';

const BASE: FlightRowProps = {
  seatId: 'p1',
  name: 'Marte Moe',
  initial: 'MM',
  extraStrokes: 1,
  score: 3,
  par: 4,
  active: true,
  locked: false,
  submitted: false,
  points: 3,
  note: 'Marte slår ut',
  onSelect: jest.fn(),
};

describe('FlightRow', () => {
  it('viser merkene, gir setet videre ved trykk, og låser en levert rad', async () => {
    const onSelect = jest.fn();
    const { rerender } = await render(<FlightRow {...BASE} onSelect={onSelect} />);

    expect(screen.getByTestId('flight-row-p1-strokes').props.children).toBe('+1 SLAG');
    expect(screen.getByTestId('flight-row-p1-points').props.children).toBe('3 p');
    expect(screen.getByTestId('flight-row-p1-note').props.children).toBe('Marte slår ut');
    expect(screen.getByTestId('flight-row-p1-score').props.children).toBe(3);
    // Birdie er én ring.
    expect(screen.getByTestId('flight-row-p1-shape').props.children[0]).toHaveLength(1);
    const { hole } = themeFor('light');
    expect(screen.getByTestId('flight-row-p1')).toHaveStyle({
      borderLeftWidth: hole.activeBarW,
      borderWidth: hole.borderW,
    });
    expect(screen.getByLabelText('Marte Moe: 3 slag')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('flight-row-p1'));
    expect(onSelect).toHaveBeenCalledWith('p1');

    await rerender(
      <FlightRow
        {...BASE}
        score={null}
        points={null}
        active={false}
        locked
        submitted
        onSelect={onSelect}
      />,
    );
    expect(screen.getByTestId('flight-row-p1-submitted')).toBeTruthy();
    expect(screen.getByLabelText('Marte Moe: ingen score ennå, levert')).toBeTruthy();
    expect(screen.getByTestId('flight-row-p1-score').props.children).toBe('—');
    expect(screen.queryByTestId('flight-row-p1-points')).toBeNull();
    expect(screen.getByTestId('flight-row-p1')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('flight-row-p1'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
