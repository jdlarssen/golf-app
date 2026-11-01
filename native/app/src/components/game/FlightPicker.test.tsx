// #2750: raden under billetten og arket den åpner (Type C).
//
// Hva raden og arket SIER, er ren logikk og låst i `flightPicker.test.ts`. Her
// låses koblingene: at et trykk åpner arket, at hvert svar gjør det tegningen og
// kontrakten sier med arket, og at drakten står i begge fargene.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { homeBundle, homePlayer } from '../../test/homeFixtures';
import { PALETTES, ThemeScope, themeFor, type Scheme } from '../../theme';
import { FlightPicker } from './FlightPicker';

jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());

const mockJoinFlight = jest.fn();
jest.mock('../../data/joinFlight', () => ({
  joinFlight: (...args: unknown[]) => mockJoinFlight(...args),
}));

function bundle(myFlight: number | null) {
  return homeBundle({
    game: {
      id: 'game-1',
      status: 'scheduled',
      modeConfig: { kind: 'stableford', team_size: 1 },
    },
    players: [
      homePlayer({ userId: 'me', flightNumber: myFlight }),
      homePlayer({ userId: 'a', name: 'Marte', flightNumber: 1 }),
      homePlayer({ userId: 'b', name: 'Jonas', flightNumber: 1 }),
      homePlayer({ userId: 'c', name: 'Anders', flightNumber: 1 }),
      homePlayer({ userId: 'd', name: 'Kristian', flightNumber: 1 }),
      homePlayer({ userId: 'e', name: 'Eirik', flightNumber: 2 }),
    ],
  });
}

async function renderPicker(myFlight: number | null = null, scheme: Scheme = 'light') {
  const onChanged = jest.fn(async () => undefined);
  const element: ReactElement = (
    <ThemeScope theme={themeFor(scheme)}>
      <FlightPicker bundle={bundle(myFlight)} userId="me" onChanged={onChanged} />
    </ThemeScope>
  );
  await render(element);
  return { onChanged };
}

async function openSheet() {
  await fireEvent.press(screen.getByTestId('flight-row'));
}

beforeEach(() => {
  mockJoinFlight.mockReset();
  mockJoinFlight.mockResolvedValue({ ok: true });
});

describe('raden', () => {
  it('uten flight: stiplet rav, og et trykk åpner arket med fersk liste', async () => {
    const { onChanged } = await renderPicker(null);

    const row = screen.getByTestId('flight-row');
    expect(row).toHaveStyle({
      borderStyle: 'dashed',
      borderWidth: 1.5,
      borderColor: PALETTES.light.warning,
      minHeight: 64,
    });
    expect(row).toHaveAccessibleName('Velg flight. Du er ikke plassert i en flight ennå.');
    expect(screen.queryByTestId('flight-sheet')).toBeNull();

    await openSheet();

    expect(screen.getByTestId('flight-sheet')).toBeTruthy();
    expect(screen.getByTestId('flight-sheet-hint')).toHaveTextContent(
      'Du er ikke plassert i en flight ennå. Trykk på en flight for å bli med.',
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('i en flight: vanlig kant, og det står hvor du er', async () => {
    await renderPicker(2);

    expect(screen.getByTestId('flight-row')).toHaveStyle({
      borderWidth: 1,
      borderColor: PALETTES.light.border,
    });
    expect(screen.getByTestId('flight-row-sub')).toHaveTextContent('Du står i flight 2.');
  });
});

describe('arket', () => {
  it('min egen og fulle flighter kan ikke trykkes, og leses opp med plass og navn', async () => {
    await renderPicker(2);
    await openSheet();

    const mine = screen.getByTestId('flight-option-2');
    expect(mine).toBeDisabled();
    expect(mine).toBeSelected();
    expect(mine).toHaveAccessibleName('Flight 2, 2 av 4, Du og Eirik. Din');

    const full = screen.getByTestId('flight-option-1');
    expect(full).toBeDisabled();
    expect(full).toHaveAccessibleName('Flight 1, 4 av 4, Marte, Jonas, Anders og Kristian. Full');

    await fireEvent.press(mine);
    await fireEvent.press(full);
    expect(mockJoinFlight).not.toHaveBeenCalled();

    expect(screen.getByTestId('flight-option-3')).toBeEnabled();
    expect(screen.getByTestId('flight-option-3')).toHaveStyle({ minHeight: 60 });
  });

  it('ok: henter bundelen og lukker arket', async () => {
    const { onChanged } = await renderPicker(null);
    await openSheet();
    onChanged.mockClear();

    await fireEvent.press(screen.getByTestId('flight-option-2'));

    await waitFor(() => expect(screen.queryByTestId('flight-sheet')).toBeNull());
    expect(mockJoinFlight).toHaveBeenCalledWith('game-1', 2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['flight_full', 'Den flighten ble nettopp full. Velg en annen.'],
    ['bad_flight', 'Den flighten finnes ikke lenger. Velg en annen.'],
  ])('%s: feilen tar hintens plass, lista hentes, og arket står', async (reason, text) => {
    mockJoinFlight.mockResolvedValue({ ok: false, reason });
    const { onChanged } = await renderPicker(null);
    await openSheet();
    onChanged.mockClear();

    await fireEvent.press(screen.getByTestId('flight-option-2'));

    expect(await screen.findByTestId('flight-sheet-notice')).toHaveTextContent(text);
    expect(screen.queryByTestId('flight-sheet-hint')).toBeNull();
    expect(screen.getByTestId('flight-sheet')).toBeTruthy();
    expect(onChanged).toHaveBeenCalledTimes(1);
    // Et nytt forsøk er mulig igjen.
    expect(screen.getByTestId('flight-option-2')).toBeEnabled();
  });

  it('runden har startet: lukker arket og henter bundelen, så stubben skifter', async () => {
    mockJoinFlight.mockResolvedValue({ ok: false, reason: 'game_not_scheduled' });
    const { onChanged } = await renderPicker(null);
    await openSheet();
    onChanged.mockClear();

    await fireEvent.press(screen.getByTestId('flight-option-2'));

    await waitFor(() => expect(screen.queryByTestId('flight-sheet')).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('uten nett: lista står, et trykk gir en ærlig feil, og ingenting hentes', async () => {
    mockJoinFlight.mockResolvedValue({ ok: false, reason: 'offline' });
    const { onChanged } = await renderPicker(null);
    await openSheet();
    onChanged.mockClear();

    await fireEvent.press(screen.getByTestId('flight-option-2'));

    expect(await screen.findByTestId('flight-sheet-notice')).toHaveTextContent(
      'Du er uten nett. Prøv igjen når nettet er tilbake.',
    );
    expect(screen.getByTestId('flight-option-2')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('mens et kall pågår er arket sperret: et dobbelttrykk gir ett kall', async () => {
    let answer!: (value: { ok: true }) => void;
    mockJoinFlight.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    await renderPicker(null);
    await openSheet();

    const option = screen.getByTestId('flight-option-2');
    await fireEvent.press(option);
    await fireEvent.press(option);

    expect(mockJoinFlight).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('flight-option-3')).toBeDisabled();

    await act(async () => {
      answer({ ok: true });
    });
    await waitFor(() => expect(screen.queryByTestId('flight-sheet')).toBeNull());
  });

  it('en feil forsvinner når arket lukkes og åpnes igjen', async () => {
    mockJoinFlight.mockResolvedValue({ ok: false, reason: 'flight_full' });
    await renderPicker(null);
    await openSheet();
    await fireEvent.press(screen.getByTestId('flight-option-2'));
    await screen.findByTestId('flight-sheet-notice');

    await fireEvent.press(screen.getByTestId('flight-sheet-close'));
    expect(screen.queryByTestId('flight-sheet')).toBeNull();
    await openSheet();

    expect(screen.queryByTestId('flight-sheet-notice')).toBeNull();
    expect(screen.getByTestId('flight-sheet-hint')).toBeTruthy();
  });

  it('natt: tegningens farger på de tre radene', async () => {
    await renderPicker(2, 'dark');
    await openSheet();
    const c = PALETTES.dark;

    expect(screen.getByTestId('flight-option-2')).toHaveStyle({
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    });
    expect(screen.getByTestId('flight-option-1')).toHaveStyle({
      borderColor: c.border,
      backgroundColor: c.bg,
    });
    expect(screen.getByTestId('flight-option-3')).toHaveStyle({
      borderColor: c.fieldBorder,
      backgroundColor: c.surface,
    });
  });

  it('lys: den fulle raden står på `surface2`', async () => {
    await renderPicker(2);
    await openSheet();

    expect(screen.getByTestId('flight-option-1')).toHaveStyle({
      backgroundColor: PALETTES.light.surface2,
    });
  });
});
