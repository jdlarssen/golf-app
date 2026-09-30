// #2256 PR 3: «Del bag-taggen» (Type C, én render-test).
//
// Hva bildet og arket gjør, er `lib/shareBagTag.test.ts` sitt (Type A). Her
// låses koblingene bare en render kan bekrefte: uten de native delene finnes
// ingen knapp, knappen deler deleversjonen av kortet (med ordmerket, skjult for
// skjermleseren), og en feil gir linja under knappen. Ingen layout-asserts.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { BagTagModel } from '../../lib/bagTag';
import { PROFILE_TEXT } from '../../lib/profileCopy';
import { canShareBagTag, shareBagTagImage } from '../../lib/shareBagTag';
import { ShareBagTagButton } from './ShareBagTagButton';

jest.mock('../../lib/shareBagTag', () => ({
  canShareBagTag: jest.fn(),
  shareBagTagImage: jest.fn(),
}));
const canShareMock = canShareBagTag as jest.Mock;
const shareMock = shareBagTagImage as jest.Mock;

const HIDDEN = { includeHiddenElements: true };

const MODEL: BagTagModel = {
  kicker: 'Losby GK',
  name: 'Kari Nordmann',
  subline: 'Dame · Junior · med siden 2026',
  hcpText: '14,2',
  hcpAge: { stale: false, text: 'Oppdatert 26. sep' },
  initials: 'KN',
};

describe('ShareBagTagButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deler deleversjonen av kortet, viser feil under knappen, og skjuler seg i et bygg uten modulene', async () => {
    canShareMock.mockReturnValue(true);
    shareMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    const { unmount } = await render(<ShareBagTagButton model={MODEL} trend={null} />);

    // Deleversjonen står i treet, skjult for skjermleseren, med ordmerket.
    expect(screen.getByTestId('share-bag-tag-card', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('share-bag-tag-card')).toBeNull();
    expect(screen.getByTestId('share-wordmark', HIDDEN)).toHaveTextContent(PROFILE_TEXT.shareWordmark);

    // Første trykk feiler: linja står. Andre lykkes: linja går bort.
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.shareBagTag }));
    });
    const [ref] = shareMock.mock.calls[0] as [{ current: unknown }];
    expect(ref.current).toBeTruthy();
    expect(screen.getByTestId('profile-share-error')).toHaveTextContent(PROFILE_TEXT.shareBagTagFailed);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.shareBagTag }));
    });
    expect(screen.queryByTestId('profile-share-error')).toBeNull();
    await unmount();

    // Et bygg uten de native delene: ingen knapp og ikke noe kort.
    canShareMock.mockReturnValue(false);
    await render(<ShareBagTagButton model={MODEL} trend={null} />);
    expect(screen.queryByTestId('profile-share-bag-tag')).toBeNull();
    expect(screen.queryByTestId('share-bag-tag-card', HIDDEN)).toBeNull();
  });
});
