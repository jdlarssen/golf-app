// #2577: den ene render-testen (Type C) for send-tilbake-arket.
//
// Før arket kom, fikk Android en `Alert` uten felt, og kortets eier fikk
// aldri vite hvorfor kortet kom tilbake. Arket er likt på begge plattformer;
// testen sjekker at grunnen faktisk når kallet, og at et tomt felt ikke sender noe.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RejectSheet } from './RejectSheet';

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

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
});
