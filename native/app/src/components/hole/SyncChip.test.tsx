// #2348: render-testen (Type C) for lagringsbrikka: tre tilstander, knapperolle
// med tilstand for skjermleseren, og trykk åpner arket.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SyncChip } from './SyncChip';

describe('SyncChip', () => {
  it.each([
    ['saved', 'Alt er lagret'],
    ['pending', '3 slag på telefonen'],
    ['quarantined', '1 hull ikke lagret'],
  ] as const)('%s viser teksten og prikken', async (state, text) => {
    await render(<SyncChip state={state} text={text} expanded={false} sunlight={false} onPress={() => undefined} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByTestId(`sync-chip-dot-${state}`)).toBeTruthy();
    const chip = screen.getByRole('button', { name: 'Lagring' });
    expect(chip.props.accessibilityValue).toEqual({ text });
    expect(chip.props.accessibilityState).toMatchObject({ expanded: false });
  });

  it('trykk åpner arket, og brikka er minst 44 høy', async () => {
    const onPress = jest.fn();
    await render(<SyncChip state="pending" text="3 slag på telefonen" expanded sunlight={false} onPress={onPress} />);
    expect(screen.getByTestId('sync-chip')).toHaveStyle({ height: 44 });
    await fireEvent.press(screen.getByTestId('sync-chip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
