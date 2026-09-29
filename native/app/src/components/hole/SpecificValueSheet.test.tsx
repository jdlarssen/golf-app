// #2252: den ene render-testen (Type C) for «Annet»-arket: hele spennet står,
// et valg sendes og lukker arket, X fjerner, og «Stryk» står bare når
// kalleren gir den. Knappene ligger ikke inni bakgrunnen: en Pressable er ett
// element for VoiceOver, og da ville en skjermleser bare hørt «Lukk».
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { MAX_STROKES } from '../../../../../lib/scorecard/strokeEntry';
import { themeFor } from '../../theme';
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
    expect(
      within(screen.getByTestId('specific-value-backdrop')).queryByTestId('specific-value-9'),
    ).toBeNull();
    // Kanten er temaets. I lys og mørk er den 1, som før; testen biter først
    // når sollys (del 2) gir en annen verdi.
    expect(screen.getByTestId('specific-value-9')).toHaveStyle({
      borderWidth: themeFor('light').hole.borderW,
    });

    await fireEvent.press(screen.getByTestId('specific-value-9'));
    expect(onPick).toHaveBeenCalledWith(9);
    expect(onClose).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('specific-value-strike'));
    expect(onPick).toHaveBeenLastCalledWith(7);

    await fireEvent.press(screen.getByLabelText('Fjern score'));
    expect(onClear).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Lukk' }));
    expect(onClose).toHaveBeenCalledTimes(4);
    // VoiceOver: dobbelttrykk på «Lukk» og tilbake-bevegelsen lukker også.
    await fireEvent(screen.getByRole('button', { name: 'Lukk' }), 'accessibilityTap');
    expect(onClose).toHaveBeenCalledTimes(5);
    await fireEvent(screen.getByTestId('specific-value-modal'), 'accessibilityEscape');
    expect(onClose).toHaveBeenCalledTimes(6);

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
