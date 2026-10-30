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
import { WOLF_FLOW_HINT, WOLF_FLOW_STEPS, type WolfHoleState } from '../../lib/wolfHole';
import { WolfChoiceCard } from './WolfChoiceCard';

jest.mock('../../data/choices', () => ({
  setWolfChoice: jest.fn(async () => ({ ok: true })),
}));

const setWolfChoiceMock = setWolfChoice as jest.MockedFunction<typeof setWolfChoice>;

const IM_WOLF: WolfHoleState = {
  wolfUserId: 'p1',
  catchUp: false,
  catchUpLine: null,
  flowLine: null,
  iAmWolf: true,
  choice: null,
  badgeText: 'Du er Wolf på dette hullet',
  notice: null,
  partnerOptions: [
    { userId: 'p2', name: 'Ada Aas', standing: null, accessibilityLabel: 'Partner: Ada Aas' },
    { userId: 'p3', name: 'Kari Kvist', standing: null, accessibilityLabel: 'Partner: Kari Kvist' },
    { userId: 'p4', name: 'Ola Olsen', standing: null, accessibilityLabel: 'Partner: Ola Olsen' },
  ],
  showChoiceUi: true,
  stake: 1,
  payout: { partnerEach: 2, lone: 4, blind: 6 },
  choiceTexts: {
    partnerSubtitle: 'Vinner-siden får 2 hver',
    loneSubtitle: 'Alene mot resten. Vinner du, får du 4.',
    blindSubtitle: 'Meldt før utslag. Vinner du, får du 6.',
    stakeLine: null,
  },
};

describe('WolfChoiceCard', () => {
  it('skriver wolfens valg, holder knappene åpne ved feil, og gir andre bare badgen', async () => {
    const onSaved = jest.fn(async () => undefined);
    const { rerender } = await render(
      <WolfChoiceCard gameId="game-1" holeNumber={7} state={IM_WOLF} onSaved={onSaved} />,
    );

    expect(screen.getByTestId('wolf-badge').props.children).toBe(
      'Du er Wolf på dette hullet',
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
      'Wolf: Per Persen — venter på valg',
    );
    expect(screen.queryByTestId('wolf-choices')).toBeNull();
  });

  // #2314: gangen i hullet står over valgene, og «Velg før utslag» er borte:
  // det gjaldt bare Blind Wolf.
  it('viser de fire stegene og hinten, ikke «Velg før utslag»', async () => {
    await render(
      <WolfChoiceCard gameId="game-1" holeNumber={7} state={IM_WOLF} onSaved={jest.fn()} />,
    );
    expect(screen.queryByText('Velg før utslag')).toBeNull();
    expect(screen.getByText('Slik går hullet')).toBeTruthy();
    expect(screen.getByTestId('wolf-flow-steps').props.accessibilityRole).toBe('list');
    for (const step of WOLF_FLOW_STEPS) expect(screen.getByText(step)).toBeTruthy();
    expect(screen.getByText(WOLF_FLOW_HINT)).toBeTruthy();
    expect(screen.queryByTestId('wolf-catch-up')).toBeNull();
  });

  it('viser catch-up-merket og linja bare på et catch-up-hull', async () => {
    await render(
      <WolfChoiceCard
        gameId="game-1"
        holeNumber={17}
        state={{
          ...IM_WOLF,
          catchUp: true,
          catchUpLine: 'Du ligger 5 poeng bak lederen, så du er ulv på dette hullet.',
        }}
        onSaved={jest.fn()}
      />,
    );
    expect(screen.getByTestId('wolf-catch-up').props.children).toBe('CATCH-UP');
    expect(screen.getByTestId('wolf-catch-up-line').props.children).toBe(
      'Du ligger 5 poeng bak lederen, så du er ulv på dette hullet.',
    );
  });

  it('i en blind runde som pågår står merket alene', async () => {
    await render(
      <WolfChoiceCard
        gameId="game-1"
        holeNumber={17}
        state={{ ...IM_WOLF, catchUp: true, catchUpLine: null, payout: null }}
        onSaved={jest.fn()}
      />,
    );
    expect(screen.getByTestId('wolf-catch-up')).toBeTruthy();
    expect(screen.queryByTestId('wolf-catch-up-line')).toBeNull();
  });

  it('de andre ser gang-linja og ingen steg', async () => {
    const flowLine =
      'Per Persen slår sist og sier ja eller nei rett etter hvert utslag. Blind Wolf meldes før noen slår.';
    await render(
      <WolfChoiceCard
        gameId="game-1"
        holeNumber={7}
        state={{
          ...IM_WOLF,
          iAmWolf: false,
          badgeText: 'Wolf: Per Persen — venter på valg',
          flowLine,
          partnerOptions: [],
          showChoiceUi: false,
        }}
        onSaved={jest.fn()}
      />,
    );
    expect(screen.getByTestId('wolf-flow-line').props.children).toBe(flowLine);
    expect(screen.queryByTestId('wolf-flow-steps')).toBeNull();
  });

  it('partnerknappen viser stillingen når den finnes', async () => {
    await render(
      <WolfChoiceCard
        gameId="game-1"
        holeNumber={7}
        state={{
          ...IM_WOLF,
          partnerOptions: [
            {
              userId: 'p2',
              name: 'Ada Aas',
              standing: '1. · 14 p',
              accessibilityLabel: 'Partner: Ada Aas, 1. plass, 14 poeng',
            },
          ],
        }}
        onSaved={jest.fn()}
      />,
    );
    expect(screen.getByText('1. · 14 p')).toBeTruthy();
    expect(screen.getByTestId('wolf-partner-p2').props.accessibilityLabel).toBe(
      'Partner: Ada Aas, 1. plass, 14 poeng',
    );
  });
});
