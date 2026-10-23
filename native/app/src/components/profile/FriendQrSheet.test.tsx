// #2627: arket med QR-koden i stort format (Type C, én render-test).
//
// At koden kan leses, er `lib/qrMatrix.test.ts` sitt. Her låses koblingene
// bare en render kan bekrefte: navnet er arkets overskrift, koden (med
// Tørny-merket i midten) og linja står, og «Lukk», hinnen og Android-tilbake
// lukker arket. Ingen layout-asserts.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikken heises over importene */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { PROFILE_TEXT } from '../../lib/profileCopy';
import { FriendQrSheet } from './FriendQrSheet';

jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());

const URL = 'https://tornygolf.no/venner/legg-til/abcd1234';

describe('FriendQrSheet', () => {
  it('viser navnet og koden, og lukkes med knappen, hinnen og tilbake', async () => {
    const onClose = jest.fn();
    const { rerender } = await render(
      <FriendQrSheet visible={false} name="Sigrid Aas" url={URL} onClose={onClose} />,
    );
    expect(screen.queryByTestId('friend-qr-sheet')).toBeNull();

    await rerender(<FriendQrSheet visible name="Sigrid Aas" url={URL} onClose={onClose} />);
    expect(screen.getByRole('header')).toHaveTextContent('Sigrid Aas');
    expect(screen.getByText(PROFILE_TEXT.friendQrSheetBody)).toBeTruthy();
    expect(screen.getByTestId('friend-qr-sheet-code')).toBeTruthy();
    // Tørny-merket står midt i koden (pynt for skjermleseren).
    expect(
      within(screen.getByTestId('friend-qr-sheet-code')).getByTestId('qr-torny-mark', { includeHiddenElements: true }),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.friendQrClose }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Hinnen er skjult for skjermleseren (arket er modalt for VoiceOver).
    await fireEvent.press(screen.getByTestId('friend-qr-sheet-scrim', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    // Android-tilbake: modalens `onRequestClose`.
    await fireEvent(screen.getByTestId('friend-qr-sheet'), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(3);

    // Mens profilraden lastes, finnes ikke navnet ennå: ingen tom overskrift.
    await rerender(<FriendQrSheet visible name="" url={URL} onClose={onClose} />);
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.getByTestId('friend-qr-sheet-code')).toBeTruthy();
  });
});
