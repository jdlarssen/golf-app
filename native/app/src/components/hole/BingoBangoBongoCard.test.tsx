// Native (#1832): den ene render-testen (Type C) for BBB-kortet.
//
// To ting kan gå galt her uten at noen ren funksjon ser det:
//
//  1. **Raden skrives hel.** Et tapp på «Bango» sender også bingo og bongo
//     med. Sender kortet bare feltet som ble rørt, nuller upserten de to
//     andre — og en registrering som allerede sto der forsvinner stille.
//  2. **Ukjent tilstand låser kortet.** Har hentingen ikke lyktes, vet vi
//     ikke hva de to andre feltene er, og da er et tapp det samme som å slette
//     dem. Knappene er låst, med en ærlig forklaring i stedet.
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
  it('skriver hele raden, tømmer med «Ingen», og låser seg når valgene ikke er hentet', async () => {
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

    // Bingoen som alt sto der følger med — ellers hadde upserten nullet den.
    // `gameStatus` går med som andre argument: finished-låsen bor i datalaget,
    // RLS håndhever den ikke.
    expect(setHoleMock).toHaveBeenCalledWith(
      {
        gameId: 'game-1',
        holeNumber: 3,
        bingoUserId: 'p1',
        bangoUserId: 'p2',
        bongoUserId: null,
      },
      'active',
    );
    expect(onSaved).toHaveBeenCalledTimes(1);

    // «Ingen» fjerner mottakeren — en retting skal faktisk kunne rette.
    await fireEvent.press(screen.getByTestId('bbb-bingoUserId-ingen'));

    expect(setHoleMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ bingoUserId: null }),
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
