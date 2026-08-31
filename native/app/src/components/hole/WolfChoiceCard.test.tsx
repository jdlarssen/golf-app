// Native (#1832): den ene render-testen (Type C) for wolf-kortet.
//
// Den svarer på det ingen ren funksjon kan svare på — tre ting, i den
// rekkefølgen de skjer på banen:
//
//  1. Et tapp på «Lone Wolf» havner i datalaget med RIKTIG `wolfUserId`, og
//     valgene hentes på nytt med en gang etterpå.
//  2. Feiler skrivingen, blir knappene STÅENDE. Et kort som ser ferdig ut
//     etter en feilet skriving er den ene tilstanden formatet ikke tåler.
//  3. En spiller som ikke er Wolf ser badgen og ingenting annet. RLS ville
//     avvist ham uansett, og en knapp som garantert feiler er verre enn ingen.
//
// Selve tilstanden er `wolfHoleState`s, og den er dekket i `lib/wolfHole.test.ts`.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { setWolfChoice } from '../../data/choices';
import type { WolfHoleState } from '../../lib/wolfHole';
import { WolfChoiceCard } from './WolfChoiceCard';

jest.mock('../../data/choices', () => ({
  setWolfChoice: jest.fn(async () => ({ ok: true })),
}));

const setWolfChoiceMock = setWolfChoice as jest.MockedFunction<typeof setWolfChoice>;

const IM_WOLF: WolfHoleState = {
  wolfUserId: 'p1',
  iAmWolf: true,
  choice: null,
  badgeText: 'Du er Wolf på dette hullet',
  notice: null,
  partnerOptions: [
    { userId: 'p2', name: 'Ada Aas' },
    { userId: 'p3', name: 'Kari Kvist' },
    { userId: 'p4', name: 'Ola Olsen' },
  ],
  showChoiceUi: true,
};

describe('WolfChoiceCard', () => {
  it('skriver wolfens valg, holder knappene åpne ved feil, og gir andre bare badgen', async () => {
    const onSaved = jest.fn(async () => undefined);
    const { rerender } = await render(
      <WolfChoiceCard gameId="game-1" holeNumber={7} state={IM_WOLF} onSaved={onSaved} />,
    );

    expect(screen.getByTestId('wolf-badge').props.children).toBe(
      '🐺 Du er Wolf på dette hullet',
    );
    // Alle tre andre er partner-alternativer, og lone/blind står under.
    expect(screen.getByTestId('wolf-partner-p3')).toBeTruthy();
    expect(screen.getByTestId('wolf-blind')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('wolf-lone'));

    // `wolfUserId` er hullets Wolf, ikke «den som taster» — bytter de to
    // plass, skriver appen et valg i feil manns navn.
    expect(setWolfChoiceMock).toHaveBeenCalledWith({
      gameId: 'game-1',
      holeNumber: 7,
      wolfUserId: 'p1',
      choice: 'lone',
      partnerUserId: null,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('wolf-error')).toBeNull();

    // Offline midt i runden: valget gikk ikke inn, og kortet sier det.
    setWolfChoiceMock.mockResolvedValueOnce({ ok: false, error: 'db_error' });
    await fireEvent.press(screen.getByTestId('wolf-blind'));

    expect(screen.getByTestId('wolf-error').props.children).toBe(
      'Fikk ikke lagret valget. Sjekk nettet og prøv igjen.',
    );
    expect(screen.getByTestId('wolf-choices')).toBeTruthy();
    expect(onSaved).toHaveBeenCalledTimes(1);

    // Samme hull sett fra en medspiller: badgen står, knappene finnes ikke.
    await rerender(
      <WolfChoiceCard
        gameId="game-1"
        holeNumber={7}
        state={{
          ...IM_WOLF,
          iAmWolf: false,
          badgeText: 'Wolf: Per Persen — venter på valg',
          partnerOptions: [],
          showChoiceUi: false,
        }}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByTestId('wolf-badge').props.children).toBe(
      '🐺 Wolf: Per Persen — venter på valg',
    );
    expect(screen.queryByTestId('wolf-choices')).toBeNull();
  });
});
