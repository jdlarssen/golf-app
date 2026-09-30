// #2385: den ene render-testen (Type C) for hullstripa. Den låser det som
// bare kan sees her: ni hull i halvdelen du står i, brikken som bytter til de
// andre ni, skjermleserens tekst per hull, og at et trykk gir hullet videre.
import { fireEvent, render, screen } from '@testing-library/react-native';
import source from '../../../../../messages/no.json';
import { HoleStrip, STRIP_LABELS } from './HoleStrip';

describe('HoleStrip', () => {
  it('bruker webbens skjermleser-tekster ordrett', () => {
    const web = source.holes.entry;
    expect(STRIP_LABELS).toEqual({
      plain: web.hullAriaLabel,
      done: web.hullAriaLabelDone,
      missing: web.hullAriaLabelMissing,
    });
  });

  it('viser halvdelen du står i, bytter halvdel med brikken, og går til hullet du trykker på', async () => {
    const onGo = jest.fn();
    await render(<HoleStrip holeNumber={7} holeCount={18} filled={[1, 2, 3]} onGo={onGo} />);
    const current = screen.getByTestId('hole-strip-7');

    expect(screen.getByTestId('hole-strip-9')).toBeTruthy();
    expect(screen.queryByTestId('hole-strip-10')).toBeNull();
    expect(current).toBeSelected();
    expect(screen.getByLabelText('Hull 2 – score ført')).toBeTruthy();
    expect(screen.getByLabelText('Hull 5 – mangler score')).toBeTruthy();
    expect(screen.getByLabelText('Hull 8')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Vis hull 10–18'));
    expect(screen.getByTestId('hole-strip-18')).toBeTruthy();
    expect(screen.queryByTestId('hole-strip-9')).toBeNull();
    expect(screen.getByLabelText('Vis hull 1–9')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('hole-strip-12'));
    expect(onGo).toHaveBeenCalledWith(12);
  });
});
