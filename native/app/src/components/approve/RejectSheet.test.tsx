// #2577: den ene render-testen (Type C) for send-tilbake-arket.
//
// Før arket kom, fikk Android en `Alert` uten felt, og kortets eier fikk
// aldri vite hvorfor kortet kom tilbake. Arket er likt på begge plattformer;
// testen sjekker at grunnen faktisk når kallet, og at et tomt felt ikke sender noe.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, StyleSheet } from 'react-native';
import { RejectSheet } from './RejectSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...require('react-native-safe-area-context/jest/mock').default,
  // En telefon med hjem-linje, så bunnluften for den kan måles.
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

describe('RejectSheet', () => {
  it('sender grunnen, og ingen grunn når feltet er tomt', async () => {
    const onSubmit = jest.fn();
    const props = {
      name: 'Marte',
      teamCard: false,
      guest: false,
      busy: false,
      onSubmit,
      onCancel: jest.fn(),
    };

    const view = await render(<RejectSheet {...props} />);
    await fireEvent.press(screen.getByTestId('reject-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith(undefined);

    await fireEvent.changeText(screen.getByTestId('reject-reason'), 'Hull 7 var 6 slag, ikke 5.');
    await fireEvent.press(screen.getByTestId('reject-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith('Hull 7 var 6 slag, ikke 5.');
    view.unmount();
  });

  // #1954 Del B: med tastaturet oppe dekker tastaturet hjem-linja, og
  // KeyboardAvoidingView løfter arket over tastaturet. Luften for linja skal da
  // ikke legges til i tillegg.
  it('dropper luften for hjem-linja mens tastaturet er oppe', async () => {
    const listeners: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      listeners[event] = cb;
      return { remove: () => undefined };
    }) as unknown as typeof Keyboard.addListener);
    const view = await render(
      <RejectSheet name="Marte" teamCard={false} guest={false} busy={false} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    const bottom = () => StyleSheet.flatten(screen.getByTestId('reject-sheet').props.style).paddingBottom;
    expect(bottom()).toBe(24 + 34);
    await act(async () => listeners.keyboardWillShow());
    expect(bottom()).toBe(24);
    await act(async () => listeners.keyboardWillHide());
    expect(bottom()).toBe(24 + 34);
    view.unmount();
    jest.restoreAllMocks();
  });
});
