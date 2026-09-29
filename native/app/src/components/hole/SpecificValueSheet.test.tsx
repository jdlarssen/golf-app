// #2252: den ene render-testen (Type C) for «Annet»-arket: hele spennet står,
// et valg sendes og lukker arket, X fjerner, og «Stryk» står bare når
// kalleren gir den.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MAX_STROKES } from '../../../../../lib/scorecard/strokeEntry';
import { SpecificValueSheet } from './SpecificValueSheet';

describe('SpecificValueSheet', () => {
  it('setter et tall, fjerner med X, og viser «Stryk» bare i stableford', async () => {
    const onPick = jest.fn();
    const onClear = jest.fn();
    const onClose = jest.fn();
    const { rerender } = await render(
      <SpecificValueSheet
        open
        par={4}
        onPick={onPick}
        onClear={onClear}
        onClose={onClose}
        strike={{ value: 7, label: 'Stryk · 0 p' }}
      />,
    );

    expect(screen.getByTestId('specific-value-1')).toBeTruthy();
    expect(screen.getByTestId(`specific-value-${MAX_STROKES}`)).toBeTruthy();
    expect(screen.queryByTestId(`specific-value-${MAX_STROKES + 1}`)).toBeNull();

    await fireEvent.press(screen.getByTestId('specific-value-9'));
    expect(onPick).toHaveBeenCalledWith(9);
    expect(onClose).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('specific-value-strike'));
    expect(onPick).toHaveBeenLastCalledWith(7);

    await fireEvent.press(screen.getByLabelText('Fjern score'));
    expect(onClear).toHaveBeenCalledTimes(1);

    await rerender(
      <SpecificValueSheet open par={4} onPick={onPick} onClear={onClear} onClose={onClose} />,
    );
    expect(screen.queryByTestId('specific-value-strike')).toBeNull();

    await rerender(
      <SpecificValueSheet
        open={false}
        par={4}
        onPick={onPick}
        onClear={onClear}
        onClose={onClose}
      />,
    );
    expect(screen.queryByTestId('specific-value-sheet')).toBeNull();
  });
});
