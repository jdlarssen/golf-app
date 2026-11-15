// #2283: raden og arket for nærmest pinnen og lengste drive (Type C). Tekstene
// er låst i `sideContestCopy.test.ts`; her står koblingen: ett trykk lagrer,
// «Ferdig» lukker bare, valget hopper tilbake når lagringen feiler, og uten
// nett er linjene sperret. Skjermleseren får rolle og valgt-tilstand.
//
// Kortet kjøres gjennom den ekte `useSideClaims` mot en falsk server
// (`test/sideClaimsServer.ts`), så hver henting og lagring går som i appen.
// Serveren er fasit (eierens valg B, 15.11): et trykk gjelder mens lagringen
// pågår, og til en henting som startet etterpå har svart.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { resetServer, server, sideClaimsModule, writeSideAs } from '../../test/sideClaimsServer';
import { useSideClaims } from '../../lib/useSideClaims';
import { PALETTES } from '../../theme';
import { SideContestCard } from './SideContestCard';

// `useSideClaims` drar inn polle-intervallet fra `useChoices`, som drar inn klienten.
jest.mock('../../supabase', () => require('../../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());
jest.mock('../../data/sideClaims', () => require('../../test/sideClaimsServer').sideClaimsModule);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect: effect } = require('react') as typeof import('react');
    effect(callback, [callback]);
  },
}));

const PLAYERS = [
  { userId: 'jonas', label: 'Jonas Berg', shortLabel: 'Jonas', initials: 'JB' },
  { userId: 'marte', label: 'Marte Lie', shortLabel: 'Marte', initials: 'ML' },
  { userId: 'me', label: 'Deg', shortLabel: 'Deg', initials: 'ON' },
  { userId: 'tore', label: 'Tore Lunde', shortLabel: 'Tore', initials: 'TL' },
];
const NAMES: Record<string, string> = { jonas: 'Jonas', marte: 'Marte', tore: 'Tore' };

type CardProps = ComponentProps<typeof SideContestCard>;
type HarnessProps = Partial<Pick<CardProps, 'contest' | 'online'>>;

/** Pollen: samme henting som intervallet i `useSideClaims`. */
const harness: { poll: () => Promise<void> } = { poll: async () => undefined };

function Harness({ contest = { category: 'closest_to_pin', source: 'game' }, online = true }: HarnessProps) {
  const claims = useSideClaims('game-1', 7, { side: true, gir: false });
  useEffect(() => {
    harness.poll = claims.refresh;
  });
  return (
    <SideContestCard
      gameId="game-1"
      holeNumber={7}
      contest={contest}
      players={PLAYERS}
      meId="me"
      claim={claims.side === undefined ? undefined : (claims.side.find((c) => c.category === contest.category) ?? null)}
      failed={claims.failed}
      online={online}
      savedByName={(id) => NAMES[id] ?? null}
      refresh={claims.refresh}
      snapshotSeq={claims.snapshotSeq}
      startedSeq={claims.startedSeq}
    />
  );
}

const ID = 'side-contest-closest_to_pin';
const record = sideClaimsModule.recordSideClaim;
const distances = () => record.mock.calls.map(([w]) => w.distanceM);
const field = () => screen.getByTestId(`${ID}-distance-input`).props.value;
const checked = (who: string) => screen.getByTestId(`${ID}-line-${who}`).props.accessibilityState.checked;

async function renderLoaded(props: HarnessProps = {}) {
  const view = await render(<Harness {...props} />);
  await waitFor(() => expect(sideClaimsModule.fetchSideClaims).toHaveBeenCalled());
  await act(async () => undefined);
  return view;
}

async function openSheet(id = ID) {
  await fireEvent.press(screen.getByTestId(id));
}

beforeEach(() => {
  resetServer();
  jest.clearAllMocks();
});

describe('SideContestCard', () => {
  it('raden åpner arket, ett trykk lagrer for flighten, og «Ferdig» lukker uten å lagre noe mer', async () => {
    await renderLoaded();
    expect(screen.getByText('Meld inn')).toBeTruthy();
    expect(screen.getByTestId(`${ID}-subtitle`)).toHaveTextContent('Sidekonkurranse');

    const readsBefore = sideClaimsModule.fetchSideClaims.mock.calls.length;
    await openSheet();
    // Arket henter på nytt når det åpnes: flightnøkkelen kan ha byttet (#2891).
    expect(sideClaimsModule.fetchSideClaims.mock.calls.length).toBe(readsBefore + 1);
    expect(screen.getByText('Sidekonkurranse · hull 7')).toBeTruthy();
    expect(screen.getByText('Hvem i flighten lå nærmest på green etter utslaget?')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Nærmest pinnen' })).toBeTruthy();

    const marte = screen.getByTestId(`${ID}-line-marte`);
    expect(marte.props.accessibilityRole).toBe('radio');
    expect(marte.props.accessibilityState).toEqual({ checked: false, disabled: false });

    await fireEvent.press(marte);
    expect(record).toHaveBeenCalledWith({
      gameId: 'game-1',
      category: 'closest_to_pin',
      holeNumber: 7,
      winnerUserId: 'marte',
      distanceM: null,
    });
    expect(checked('marte')).toBe(true);
    expect(screen.getByTestId(`${ID}-sheet-status`)).toHaveTextContent('Lagret av deg. Alle i flighten kan endre.');

    // Avstanden står bare når en spiller er valgt. + fra tomt felt er en halv meter.
    await fireEvent.press(screen.getByTestId(`${ID}-distance-plus`));
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ winnerUserId: 'marte', distanceM: 0.5 }));

    // Avstanden kan skrives, med komma, og lagres når feltet forlates.
    await fireEvent(screen.getByTestId(`${ID}-distance-input`), 'focus');
    await fireEvent.changeText(screen.getByTestId(`${ID}-distance-input`), '2,4');
    await fireEvent(screen.getByTestId(`${ID}-distance-input`), 'endEditing');
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ winnerUserId: 'marte', distanceM: 2.4 }));
    expect(field()).toBe('2,4');
    // Et ugyldig tall lagres ikke.
    const saves = record.mock.calls.length;
    await fireEvent(screen.getByTestId(`${ID}-distance-input`), 'focus');
    await fireEvent.changeText(screen.getByTestId(`${ID}-distance-input`), '120');
    await fireEvent(screen.getByTestId(`${ID}-distance-input`), 'endEditing');
    expect(record.mock.calls.length).toBe(saves);

    await fireEvent.press(screen.getByTestId(`${ID}-sheet-done`));
    expect(screen.queryByTestId(`${ID}-sheet`)).toBeNull();
    expect(record.mock.calls.length).toBe(saves);
    expect(screen.getByTestId(`${ID}-subtitle`)).toHaveTextContent('Marte · 2,4 m');
  });

  it('viser det flighten har meldt inn, og hvem som lagret', async () => {
    writeSideAs('tore', { category: 'closest_to_pin', holeNumber: 7, winnerUserId: 'marte', distanceM: 2.5 });
    await renderLoaded();
    expect(screen.getByTestId(`${ID}-subtitle`)).toHaveTextContent('Marte · 2,5 m');
    expect(screen.queryByText('Meld inn')).toBeNull();

    await openSheet();
    expect(checked('marte')).toBe(true);
    expect(field()).toBe('2,5');
    expect(screen.getByTestId(`${ID}-sheet-status`)).toHaveTextContent('Lagret av Tore. Alle i flighten kan endre.');

    // «Ingen på green» tar bort avstanden.
    await fireEvent.press(screen.getByTestId(`${ID}-line-none`));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ winnerUserId: null, distanceM: null }));
    expect(screen.queryByTestId(`${ID}-distance`)).toBeNull();
  });

  it('valget hopper tilbake når lagringen feiler, og feilen står i arket', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await fireEvent.press(screen.getByTestId(`${ID}-line-jonas`));
    expect(checked('jonas')).toBe(true);
    await act(async () => server.heldWrites[0].release({ ok: false, error: 'db_error' }));

    expect(checked('jonas')).toBe(false);
    const notice = screen.getByTestId(`${ID}-sheet-notice`);
    expect(notice).toHaveTextContent('Fikk ikke lagret. Sjekk nettet og prøv igjen.');
    expect(notice.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByTestId(`${ID}-sheet-status`)).toHaveTextContent(
      'Svaret deles med hele flighten. Arrangøren kårer vinneren til slutt.',
    );
  });

  it('uten nett er raden og linjene sperret, med forklaring', async () => {
    const view = await renderLoaded();
    await openSheet();
    await view.rerender(<Harness online={false} />);
    expect(screen.getByTestId(`${ID}-sheet-notice`)).toHaveTextContent(
      'Du er uten nett. Kom tilbake til dette hullet og meld inn når du har dekning.',
    );
    const line = screen.getByTestId(`${ID}-line-marte`);
    expect(line.props.accessibilityState).toEqual({ checked: false, disabled: true });
    await fireEvent.press(line);
    expect(record).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId(`${ID}-sheet-close`));
    expect(screen.getByTestId(`${ID}-subtitle`)).toHaveTextContent('Uten nett. Meld inn senere.');
    expect(screen.getByTestId(ID).props.accessibilityState).toEqual({ disabled: true });
  });

  it('når hentingen ikke har lyktes, sier raden fra og kan ikke åpnes', async () => {
    server.failReads = 1;
    await renderLoaded();
    expect(screen.getByTestId(`${ID}-subtitle`)).toHaveTextContent('Fikk ikke hentet. Prøver igjen.');
    await openSheet();
    expect(screen.queryByTestId(`${ID}-sheet`)).toBeNull();
  });

  it('raske trykk (S1): valget står til siste lagring er ferdig, og neste trykk regner fra det', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    await fireEvent.press(screen.getByTestId(`${ID}-distance-plus`));
    await fireEvent.press(screen.getByTestId(`${ID}-distance-plus`));
    expect(field()).toBe('1,0');
    // Første lagring lander, og hentingen etterpå viser Marte uten avstand.
    await act(async () => server.heldWrites[0].release());
    expect(field()).toBe('1,0');
    expect(screen.getByTestId(`${ID}-subtitle`)).toHaveTextContent('Marte · 1,0 m');
    await fireEvent.press(screen.getByTestId(`${ID}-distance-plus`));
    for (let i = 1; i < 4; i++) await act(async () => server.heldWrites[i]?.release());
    expect(distances()).toEqual([null, 0.5, 1, 1.5]);
    expect(field()).toBe('1,5');
  });

  it('feiler hentingen rett etter lagringen (S6), står trykket til neste henting, uten å flimre', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    await fireEvent.press(screen.getByTestId(`${ID}-distance-plus`));
    await fireEvent.press(screen.getByTestId(`${ID}-distance-plus`));
    await act(async () => server.heldWrites[0].release());
    await act(async () => server.heldWrites[1].release());
    server.failReads = 1;
    await act(async () => server.heldWrites[2].release());
    // Lagret 1,0 m, men hentingen etterpå feilet: feltet viser 1,0, ikke 0,5.
    expect(field()).toBe('1,0');
    await act(() => harness.poll());
    expect(field()).toBe('1,0');
    expect(screen.getByTestId(`${ID}-subtitle`)).toHaveTextContent('Marte · 1,0 m');
  });

  it('en kamerat skriver mellom din lagring og hentingen (S8): kameratens svar står, og neste trykk bygger på det', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    await act(async () => {
      server.heldWrites[0].release();
      // Tore lagrer Jonas på 2 m før hentingen din går ut.
      writeSideAs('tore', { category: 'closest_to_pin', holeNumber: 7, winnerUserId: 'jonas', distanceM: 2 });
    });
    expect(checked('jonas')).toBe(true);
    expect(field()).toBe('2,0');
    expect(screen.getByTestId(`${ID}-sheet-status`)).toHaveTextContent('Lagret av Tore. Alle i flighten kan endre.');
    await act(() => harness.poll());
    expect(checked('jonas')).toBe(true);

    await fireEvent.press(screen.getByTestId(`${ID}-distance-plus`));
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ winnerUserId: 'jonas', distanceM: 2.5 }));
  });

  it('hentingen etter lagringen henger, en poll henter kameratens svar, og så feiler den (S9): kameratens svar står', async () => {
    await renderLoaded();
    await openSheet();
    server.holdReads = true;
    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    expect(server.heldReads).toHaveLength(1);
    writeSideAs('tore', { category: 'closest_to_pin', holeNumber: 7, winnerUserId: 'jonas', distanceM: 2 });
    server.holdReads = false;
    await act(() => harness.poll());
    expect(checked('jonas')).toBe(true);
    await act(async () => server.heldReads[0].fail());
    expect(checked('jonas')).toBe(true);
    expect(screen.getByTestId(`${ID}-subtitle`)).toHaveTextContent('Jonas · 2,0 m');
  });

  it('en feil fra en tidligere lagring forsvinner når en senere lagring går gjennom', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await fireEvent.press(screen.getByTestId(`${ID}-line-jonas`));
    // Marte trykkes mens Jonas fortsatt lagres. Jonas feiler, Marte går gjennom.
    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    await act(async () => server.heldWrites[0].release({ ok: false, error: 'db_error' }));
    expect(checked('marte')).toBe(true);
    await act(async () => server.heldWrites[1].release());
    expect(screen.queryByTestId(`${ID}-sheet-notice`)).toBeNull();
    expect(checked('marte')).toBe(true);
  });

  it('svaret i raden står i tekstfargen, poenglinja i den dempede', async () => {
    const color = () => StyleSheet.flatten(screen.getByTestId(`${ID}-subtitle`).props.style).color;
    await renderLoaded();
    expect(color()).toBe(PALETTES.light.muted);
    writeSideAs('tore', { category: 'closest_to_pin', holeNumber: 7, winnerUserId: 'marte', distanceM: 2.5 });
    await act(() => harness.poll());
    expect(color()).toBe(PALETTES.light.text);
  });

  it('lengste drive i cup: kampen, poengene og ingen avstand', async () => {
    await renderLoaded({ contest: { category: 'longest_drive', source: 'cup', points: 2 } });
    expect(screen.getByTestId('side-contest-longest_drive-subtitle')).toHaveTextContent('+2 p til laget');
    await openSheet('side-contest-longest_drive');
    expect(screen.getByText('Sidepoeng · hull 7 · +2 p til laget')).toBeTruthy();
    expect(screen.getByText('Hvem i kampen slo lengst ut på fairway?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('side-contest-longest_drive-line-tore'));
    expect(screen.queryByTestId('side-contest-longest_drive-distance')).toBeNull();
    expect(screen.getByText('Ingen på fairway')).toBeTruthy();
  });
});
