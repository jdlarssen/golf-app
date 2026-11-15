// #2283: raden og arket for nærmest pinnen og lengste drive (Type C). Tekstene
// er låst i `sideContestCopy.test.ts`; her står koblingen: ett trykk lagrer,
// «Ferdig» lukker bare, valget hopper tilbake når lagringen feiler, og uten
// nett er linjene sperret. Skjermleseren får rolle og valgt-tilstand.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { recordSideClaim } from '../../data/sideClaims';
import { SideContestCard } from './SideContestCard';

jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());
jest.mock('../../data/sideClaims', () => ({
  recordSideClaim: jest.fn(async () => ({ ok: true })),
}));

const recordMock = recordSideClaim as jest.MockedFunction<typeof recordSideClaim>;

const PLAYERS = [
  { userId: 'jonas', label: 'Jonas Berg', shortLabel: 'Jonas', initials: 'JB' },
  { userId: 'marte', label: 'Marte Lie', shortLabel: 'Marte', initials: 'ML' },
  { userId: 'me', label: 'Deg', shortLabel: 'Deg', initials: 'ON' },
  { userId: 'tore', label: 'Tore Lunde', shortLabel: 'Tore', initials: 'TL' },
];

const NAMES: Record<string, string> = { jonas: 'Jonas', marte: 'Marte', tore: 'Tore' };

function props(over: Partial<ComponentProps<typeof SideContestCard>> = {}): ComponentProps<typeof SideContestCard> {
  return {
    gameId: 'game-1',
    holeNumber: 7,
    contest: { category: 'closest_to_pin', source: 'game' },
    players: PLAYERS,
    meId: 'me',
    claim: null,
    failed: false,
    online: true,
    savedByName: (id: string) => NAMES[id] ?? null,
    refresh: jest.fn(async () => undefined),
    ...over,
  };
}

beforeEach(() => {
  recordMock.mockReset();
  recordMock.mockResolvedValue({ ok: true });
});

describe('SideContestCard', () => {
  it('raden åpner arket, ett trykk lagrer for flighten, og «Ferdig» lukker uten å lagre noe mer', async () => {
    const p = props();
    await render(<SideContestCard {...p} />);

    expect(screen.getByText('Meld inn')).toBeTruthy();
    expect(screen.getByTestId('side-contest-closest_to_pin-subtitle')).toHaveTextContent('Sidekonkurranse');

    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin'));
    // Arket henter på nytt når det åpnes: flightnøkkelen kan ha byttet (#2891).
    expect(p.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Sidekonkurranse · hull 7')).toBeTruthy();
    expect(screen.getByText('Hvem i flighten lå nærmest på green etter utslaget?')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Nærmest pinnen' })).toBeTruthy();

    const marte = screen.getByTestId('side-contest-closest_to_pin-line-marte');
    expect(marte.props.accessibilityRole).toBe('radio');
    expect(marte.props.accessibilityState).toEqual({ checked: false, disabled: false });

    await fireEvent.press(marte);
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock).toHaveBeenCalledWith({
      gameId: 'game-1',
      category: 'closest_to_pin',
      holeNumber: 7,
      winnerUserId: 'marte',
      distanceM: null,
    });
    expect(screen.getByTestId('side-contest-closest_to_pin-line-marte').props.accessibilityState.checked).toBe(true);
    expect(p.refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('side-contest-closest_to_pin-sheet-status')).toHaveTextContent(
      'Lagret av deg. Alle i flighten kan endre.',
    );

    // Avstanden står bare når en spiller er valgt. + fra tomt felt er en halv meter.
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-distance-plus'));
    expect(recordMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ winnerUserId: 'marte', distanceM: 0.5 }),
    );

    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-sheet-done'));
    expect(screen.queryByTestId('side-contest-closest_to_pin-sheet')).toBeNull();
    expect(recordMock).toHaveBeenCalledTimes(2);
  });

  it('viser det flighten har meldt inn, og hvem som lagret', async () => {
    const claim = {
      category: 'closest_to_pin' as const,
      holeNumber: 7,
      winnerUserId: 'marte',
      distanceM: 2.5,
      enteredBy: 'tore',
      updatedAt: '2026-11-15T10:00:00Z',
    };
    await render(<SideContestCard {...props({ claim })} />);
    expect(screen.getByTestId('side-contest-closest_to_pin-subtitle')).toHaveTextContent('Marte · 2,5 m');
    expect(screen.queryByText('Meld inn')).toBeNull();

    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin'));
    expect(screen.getByTestId('side-contest-closest_to_pin-line-marte').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('side-contest-closest_to_pin-distance-input').props.value).toBe('2,5');
    expect(screen.getByTestId('side-contest-closest_to_pin-sheet-status')).toHaveTextContent(
      'Lagret av Tore. Alle i flighten kan endre.',
    );

    // Avstanden kan skrives, med komma, og lagres når feltet forlates.
    const input = screen.getByTestId('side-contest-closest_to_pin-distance-input');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(screen.getByTestId('side-contest-closest_to_pin-distance-input'), '2,4');
    await fireEvent(screen.getByTestId('side-contest-closest_to_pin-distance-input'), 'endEditing');
    expect(recordMock).toHaveBeenLastCalledWith(expect.objectContaining({ winnerUserId: 'marte', distanceM: 2.4 }));
    // Et ugyldig tall lagres ikke, og feltet viser det som står.
    recordMock.mockClear();
    await fireEvent(screen.getByTestId('side-contest-closest_to_pin-distance-input'), 'focus');
    await fireEvent.changeText(screen.getByTestId('side-contest-closest_to_pin-distance-input'), '120');
    await fireEvent(screen.getByTestId('side-contest-closest_to_pin-distance-input'), 'endEditing');
    expect(recordMock).not.toHaveBeenCalled();

    // «Ingen på green» tar bort avstanden.
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-line-none'));
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({ winnerUserId: null, distanceM: null }));
    expect(screen.queryByTestId('side-contest-closest_to_pin-distance')).toBeNull();
  });

  it('valget hopper tilbake når lagringen feiler, og feilen står i arket', async () => {
    recordMock.mockResolvedValueOnce({ ok: false, error: 'db_error' });
    await render(<SideContestCard {...props()} />);
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin'));
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-line-jonas'));

    expect(screen.getByTestId('side-contest-closest_to_pin-line-jonas').props.accessibilityState.checked).toBe(false);
    const notice = screen.getByTestId('side-contest-closest_to_pin-sheet-notice');
    expect(notice).toHaveTextContent('Fikk ikke lagret. Sjekk nettet og prøv igjen.');
    expect(notice.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByTestId('side-contest-closest_to_pin-sheet-status')).toHaveTextContent(
      'Svaret deles med hele flighten. Arrangøren kårer vinneren til slutt.',
    );
  });

  it('uten nett er raden og linjene sperret, med forklaring', async () => {
    const p = props();
    const view = await render(<SideContestCard {...p} />);
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin'));

    await view.rerender(<SideContestCard {...p} online={false} />);
    expect(screen.getByTestId('side-contest-closest_to_pin-sheet-notice')).toHaveTextContent(
      'Du er uten nett. Kom tilbake til dette hullet og meld inn når du har dekning.',
    );
    const line = screen.getByTestId('side-contest-closest_to_pin-line-marte');
    expect(line.props.accessibilityState).toEqual({ checked: false, disabled: true });
    await fireEvent.press(line);
    expect(recordMock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-sheet-close'));
    const row = screen.getByTestId('side-contest-closest_to_pin');
    expect(screen.getByTestId('side-contest-closest_to_pin-subtitle')).toHaveTextContent('Uten nett. Meld inn senere.');
    expect(row.props.accessibilityState).toEqual({ disabled: true });
  });

  it('når hentingen ikke har lyktes, sier raden fra og kan ikke åpnes', async () => {
    await render(<SideContestCard {...props({ claim: undefined, failed: true })} />);
    expect(screen.getByTestId('side-contest-closest_to_pin-subtitle')).toHaveTextContent(
      'Fikk ikke hentet. Prøver igjen.',
    );
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin'));
    expect(screen.queryByTestId('side-contest-closest_to_pin-sheet')).toBeNull();
  });

  it('raske trykk: valget står til siste lagring er ferdig, og neste trykk regner fra det', async () => {
    const answers: ((result: { ok: true }) => void)[] = [];
    recordMock.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const p = props();
    const view = await render(<SideContestCard {...p} />);
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin'));
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-line-marte'));
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-distance-plus'));
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-distance-plus'));
    expect(screen.getByTestId('side-contest-closest_to_pin-distance-input').props.value).toBe('1,0');

    // Første lagring lander, og hentingen gir serverens svar fra den: Marte uten avstand.
    await act(async () => answers[0]({ ok: true }));
    const first = {
      category: 'closest_to_pin' as const,
      holeNumber: 7,
      winnerUserId: 'marte',
      distanceM: null,
      enteredBy: 'me',
      updatedAt: '2026-11-15T10:00:01Z',
    };
    await view.rerender(<SideContestCard {...p} claim={first} />);
    // To lagringer står fortsatt i kø: feltet viser siste trykk, ikke serverens mellomsvar.
    expect(screen.getByTestId('side-contest-closest_to_pin-distance-input').props.value).toBe('1,0');
    expect(screen.getByTestId('side-contest-closest_to_pin-subtitle')).toHaveTextContent('Marte · 1,0 m');

    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-distance-plus'));
    for (let i = 1; i < 4; i++) {
      await act(async () => answers[i]?.({ ok: true }));
    }
    expect(recordMock.mock.calls.map(([write]) => write.distanceM)).toEqual([null, 0.5, 1, 1.5]);
  });

  it('feiler siste henting, står siste trykk, ikke et mellomsvar', async () => {
    const answers: ((result: { ok: true }) => void)[] = [];
    recordMock.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const claim = (distanceM: number | null, updatedAt: string) => ({
      category: 'closest_to_pin' as const,
      holeNumber: 7,
      winnerUserId: 'marte',
      distanceM,
      enteredBy: 'me',
      updatedAt,
    });
    const refresh = jest
      .fn()
      .mockResolvedValueOnce({ side: [claim(null, 't1')] })
      .mockResolvedValueOnce({ side: [claim(0.5, 't2')] })
      // Siste henting feiler (useSideClaims gir null).
      .mockResolvedValueOnce(null);
    const p = props({ refresh });
    const view = await render(<SideContestCard {...p} />);
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin'));
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-line-marte'));
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-distance-plus'));
    await act(async () => answers[0]({ ok: true }));
    await view.rerender(<SideContestCard {...p} claim={claim(null, 't1')} />);
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-distance-plus'));
    await act(async () => answers[1]({ ok: true }));
    await view.rerender(<SideContestCard {...p} claim={claim(0.5, 't2')} />);
    await act(async () => answers[2]({ ok: true }));
    // Lagret 1,0 m, men hentingen etterpå feilet: feltet viser det som ble lagret.
    expect(screen.getByTestId('side-contest-closest_to_pin-distance-input').props.value).toBe('1,0');
  });

  it('en feil fra en tidligere lagring forsvinner når en senere lagring går gjennom', async () => {
    const answers: ((result: Awaited<ReturnType<typeof recordSideClaim>>) => void)[] = [];
    recordMock.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    await render(<SideContestCard {...props()} />);
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin'));
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-line-jonas'));
    // Marte trykkes mens Jonas fortsatt lagres. Jonas feiler, Marte går gjennom.
    await fireEvent.press(screen.getByTestId('side-contest-closest_to_pin-line-marte'));
    await act(async () => answers[0]({ ok: false, error: 'db_error' }));
    await act(async () => answers[1]({ ok: true }));
    expect(screen.queryByTestId('side-contest-closest_to_pin-sheet-notice')).toBeNull();
    expect(screen.getByTestId('side-contest-closest_to_pin-line-marte').props.accessibilityState.checked).toBe(true);
  });

  it('svaret i raden står i tekstfargen, poenglinja og feilen i den dempede', async () => {
    const claim = {
      category: 'closest_to_pin' as const,
      holeNumber: 7,
      winnerUserId: 'marte',
      distanceM: 2.5,
      enteredBy: 'tore',
      updatedAt: 't',
    };
    const { PALETTES } = require('../../theme') as typeof import('../../theme');
    const view = await render(<SideContestCard {...props({ claim })} />);
    const color = () => StyleSheet.flatten(screen.getByTestId('side-contest-closest_to_pin-subtitle').props.style).color;
    expect(color()).toBe(PALETTES.light.text);
    await view.rerender(<SideContestCard {...props({ claim: null })} />);
    expect(color()).toBe(PALETTES.light.muted);
  });

  it('lengste drive i cup: kampen, poengene og ingen avstand', async () => {
    await render(
      <SideContestCard {...props({ contest: { category: 'longest_drive', source: 'cup', points: 2 } })} />,
    );
    expect(screen.getByTestId('side-contest-longest_drive-subtitle')).toHaveTextContent('+2 p til laget');
    await fireEvent.press(screen.getByTestId('side-contest-longest_drive'));
    expect(screen.getByText('Sidepoeng · hull 7 · +2 p til laget')).toBeTruthy();
    expect(screen.getByText('Hvem i kampen slo lengst ut på fairway?')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByTestId('side-contest-longest_drive-line-tore'));
    });
    expect(screen.queryByTestId('side-contest-longest_drive-distance')).toBeNull();
    expect(screen.getByText('Ingen på fairway')).toBeTruthy();
  });
});
