// #2252: den ene render-testen (Type C) for en rad i flighten. Formen og tonen
// er delt kode (lib/scoring/scoreShape, scoreTone) og poengene er
// lib/scorecard/railPoints. Her er det koblingen: linja under navnet sier
// slagene og hva raden venter på (#2385), formen regnes av netto, en låst rad
// kan ikke velges, aktiv rad er hvit med skogkant, og sollys-raden har
// poengene til høyre og «?». `strokesLine` er en ren funksjon (Type A).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { themeFor } from '../../theme';
import { FlightRow, strokesLine, type FlightRowProps } from './FlightRow';

const BASE: FlightRowProps = {
  seatId: 'p1',
  name: 'Marte Moe',
  a11yName: 'Marte Moe (deg)',
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

const HIDDEN = { includeHiddenElements: true };

describe('FlightRow', () => {
  it('viser merkene og statuslinja, gir setet videre ved trykk, og låser en levert rad', async () => {
    const onSelect = jest.fn();
    const { rerender } = await render(<FlightRow {...BASE} onSelect={onSelect} />);

    expect(screen.getByTestId('flight-row-p1-note').props.children).toBe(
      'Marte slår ut · Tast scoren nedenfor',
    );
    expect(screen.queryByTestId('flight-row-p1-points')).toBeNull();
    expect(screen.getByTestId('flight-row-p1-score').props.children).toBe(3);
    // Netto (eierens svar): 3 slag med ett slag på par 4 er netto ørn, to ringer.
    expect(screen.getByTestId('flight-row-p1-shape').props.children[0]).toHaveLength(2);
    expect(screen.getByTestId('flight-row-p1')).toHaveStyle({
      borderWidth: 2,
      backgroundColor: themeFor('light').colors.surface,
    });
    expect(screen.getByLabelText('Marte Moe (deg): 3 slag')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('flight-row-p1'));
    expect(onSelect).toHaveBeenCalledWith('p1');

    // Tastet og ikke på tur: slagene og poengene.
    await rerender(<FlightRow {...BASE} active={false} note={null} onSelect={onSelect} />);
    expect(screen.getByTestId('flight-row-p1-note').props.children).toBe('Får 1 slag · 3 poeng');

    // Ikke tastet og ikke på tur: «venter» og en blek skive.
    await rerender(
      <FlightRow
        {...BASE}
        score={null}
        points={null}
        active={false}
        locked
        submitted
        note={null}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByTestId('flight-row-p1-note').props.children).toBe('Får 1 slag · venter');
    expect(screen.getByTestId('flight-row-p1-avatar-waiting', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('flight-row-p1-submitted')).toBeTruthy();
    expect(screen.getByLabelText('Marte Moe (deg): ingen score ennå, levert')).toBeTruthy();
    expect(screen.getByTestId('flight-row-p1-score', HIDDEN)).toHaveTextContent('–');
    expect(screen.getByTestId('flight-row-p1')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('flight-row-p1'));
    expect(onSelect).toHaveBeenCalledTimes(1);

    // Sollys: fornavn, «din tur», «?» og poengene til høyre, ingen skive.
    await rerender(
      <FlightRow {...BASE} name="Marte" score={null} points={null} sunlight onSelect={onSelect} />,
    );
    expect(screen.getByText('Marte · din tur')).toBeTruthy();
    expect(screen.getByTestId('flight-row-p1-score').props.children).toBe('?');
    expect(screen.queryByTestId('flight-row-p1-avatar', HIDDEN)).toBeNull();
    await rerender(<FlightRow {...BASE} name="Marte" active={false} sunlight onSelect={onSelect} />);
    expect(screen.getByTestId('flight-row-p1-points').props.children).toBe('3 p');
  });
});

describe('strokesLine', () => {
  it.each([
    [1, 'Får 1 slag'],
    [2, 'Får 2 slag'],
    [0, 'Scratch'],
    [-1, null],
    [null, null],
  ] as const)('%s slag gir %s', (extra, text) => {
    expect(strokesLine(extra)).toBe(text);
  });
});
