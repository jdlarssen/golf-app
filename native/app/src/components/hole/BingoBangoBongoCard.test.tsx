// Native (#1832): den ene render-testen (Type C) for BBB-kortet.
//
// To ting kan gå galt her uten at noen ren funksjon ser det:
//
//  1. **Bare den trykte kategorien skrives (#1950).** Et tapp på «Bango»
//     sender bare bango. Sendte kortet hele raden fra øyeblikksbildet sitt,
//     ville det nullet en kategori en i flighten registrerte i mellomtiden.
//  2. **Ukjent tilstand låser kortet.** Har hentingen ikke lyktes, vet kortet
//     ikke hva som står valgt: det viser tomme rader, og et tapp på en
//     spiller som alt står valgt ville satt i stedet for å tømme. Knappene er
//     låst, med en ærlig forklaring i stedet.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { setBingoBangoBongoHole } from '../../data/choices';
import { BingoBangoBongoCard } from './BingoBangoBongoCard';

jest.mock('../../data/choices', () => ({
  setBingoBangoBongoHole: jest.fn(async () => ({ ok: true })),
}));

const setHoleMock = setBingoBangoBongoHole as jest.MockedFunction<
  typeof setBingoBangoBongoHole
>;

const PLAYERS = [
  { userId: 'p1', name: 'Per Persen' },
  { userId: 'p2', name: 'Ada Aas' },
];

describe('BingoBangoBongoCard', () => {
  it('skriver bare den trykte kategorien, tømmer med «Ingen», og låser seg når valgene ikke er hentet', async () => {
    const onSaved = jest.fn(async () => undefined);
    const { rerender } = await render(
      <BingoBangoBongoCard
        gameId="game-1"
        holeNumber={3}
        gameStatus="active"
        players={PLAYERS}
        saved={{
          holeNumber: 3,
          bingoUserId: 'p1',
          bangoUserId: null,
          bongoUserId: null,
        }}
        loaded
        onSaved={onSaved}
      />,
    );

    await fireEvent.press(screen.getByTestId('bbb-bangoUserId-p2'));

    // Bare bango sendes. Bingoen som alt står, rører kortet ikke (#1950).
    // `gameStatus` går med som andre argument: finished-låsen bor i datalaget,
    // RLS håndhever den ikke.
    expect(setHoleMock).toHaveBeenCalledWith(
      { gameId: 'game-1', holeNumber: 3, key: 'bangoUserId', userId: 'p2' },
      'active',
    );
    expect(onSaved).toHaveBeenCalledTimes(1);

    // «Ingen» fjerner mottakeren — en retting skal faktisk kunne rette.
    await fireEvent.press(screen.getByTestId('bbb-bingoUserId-ingen'));

    expect(setHoleMock).toHaveBeenLastCalledWith(
      { gameId: 'game-1', holeNumber: 3, key: 'bingoUserId', userId: null },
      'active',
    );

    // Et avsluttet spill svarer med låsen, på norsk.
    setHoleMock.mockResolvedValueOnce({ ok: false, error: 'game_finished' });
    await fireEvent.press(screen.getByTestId('bbb-bongoUserId-p1'));

    expect(screen.getByTestId('bbb-error').props.children).toBe(
      'Runden er avsluttet. Nå kan ingenting registreres mer.',
    );

    // Hentingen har ikke lyktes: kortet sier fra og tar ikke imot tapp.
    const callsBefore = setHoleMock.mock.calls.length;
    await rerender(
      <BingoBangoBongoCard
        gameId="game-1"
        holeNumber={3}
        gameStatus="active"
        players={PLAYERS}
        saved={null}
        loaded={false}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByTestId('bbb-notice')).toBeTruthy();
    expect(screen.getByTestId('bbb-bingoUserId-p1')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('bbb-bingoUserId-p1'));
    expect(setHoleMock.mock.calls.length).toBe(callsBefore);
  });
});
