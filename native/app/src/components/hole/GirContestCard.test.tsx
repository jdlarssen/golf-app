// #2283: GIR-raden og arket i cup (Type C). Hver ball er en av/på-linje, et
// trykk lagrer bare den ballen, «Ingen traff greenen» setter alle til bommet,
// og en foursomes-side er én linje.
//
// Kortet kjøres gjennom den ekte `useSideClaims` mot en falsk server
// (`test/sideClaimsServer.ts`). Serveren er fasit (eierens valg B, 15.11): et
// trykk gjelder mens lagringen pågår, og til en henting som startet etterpå har
// svart, per ball.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ComponentProps } from 'react';
import { useSideClaims } from '../../lib/useSideClaims';
import { resetServer, server, sideClaimsModule, writeGirAs } from '../../test/sideClaimsServer';
import { GirContestCard } from './GirContestCard';

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

const ball = (id: string, label: string, initials: string) => ({ key: id, userIds: [id], label, faces: [{ initials }] });
const FOURBALL = [
  ball('me', 'Deg', 'JB'),
  ball('marte', 'Marte Lie', 'ML'),
  ball('tore', 'Tore Lunde', 'TL'),
  ball('kari', 'Kari Nilsen', 'KN'),
];
const SIDES = [
  { key: 'side-1', userIds: ['me', 'marte'], label: 'Deg og Marte', faces: [{ initials: 'JB' }, { initials: 'ML' }] },
  { key: 'side-2', userIds: ['tore', 'kari'], label: 'Tore og Kari', faces: [{ initials: 'TL' }, { initials: 'KN' }] },
];
const NAMES: Record<string, string> = { marte: 'Marte', tore: 'Tore', kari: 'Kari' };

type HarnessProps = Partial<Pick<ComponentProps<typeof GirContestCard>, 'balls' | 'oneBallPerSide' | 'online'>>;

/** Pollen: samme henting som intervallet i `useSideClaims`. */
const harness: { poll: () => Promise<void> } = { poll: async () => undefined };

function Harness({ balls = FOURBALL, oneBallPerSide = false, online = true }: HarnessProps) {
  const claims = useSideClaims('game-1', 5, { side: false, gir: true });
  useEffect(() => {
    harness.poll = claims.refresh;
  });
  return (
    <GirContestCard
      gameId="game-1"
      holeNumber={5}
      par={4}
      contest={{ category: 'gir', source: 'cup', points: 1.5, maxPerTeam: 2 }}
      balls={balls}
      oneBallPerSide={oneBallPerSide}
      meId="me"
      claims={claims.gir}
      failed={claims.failed}
      online={online}
      savedByName={(id) => NAMES[id] ?? null}
      refresh={claims.refresh}
      snapshotSeq={claims.snapshotSeq}
      startedSeq={claims.startedSeq}
    />
  );
}

const ID = 'side-contest-gir';
const record = sideClaimsModule.recordGirClaims;
const checked = (key: string) => screen.getByTestId(`${ID}-line-${key}`).props.accessibilityState.checked;
const subtitle = () => screen.getByTestId(`${ID}-subtitle`);

async function renderLoaded(props: HarnessProps = {}) {
  const view = await render(<Harness {...props} />);
  await waitFor(() => expect(sideClaimsModule.fetchGirClaims).toHaveBeenCalled());
  await act(async () => undefined);
  return view;
}

async function openSheet() {
  await fireEvent.press(screen.getByTestId(ID));
}

beforeEach(() => {
  resetServer();
  jest.clearAllMocks();
});

describe('GirContestCard', () => {
  it('to trykk lagrer to treff, hver ball for seg, og «Ingen traff greenen» setter alle til bommet', async () => {
    await renderLoaded();
    expect(subtitle()).toHaveTextContent('+1,5 p per GIR');

    await openSheet();
    expect(screen.getByText('Sidepoeng · hull 5 · +1,5 p per GIR')).toBeTruthy();
    expect(screen.getByText('Hvem var på greenen på to slag? Trykk på alle som traff.')).toBeTruthy();
    expect(screen.getByTestId(`${ID}-line-marte`).props.accessibilityRole).toBe('checkbox');

    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    await fireEvent.press(screen.getByTestId(`${ID}-line-tore`));
    expect(record).toHaveBeenNthCalledWith(1, { gameId: 'game-1', holeNumber: 5, userIds: ['marte'], hit: true });
    expect(record).toHaveBeenNthCalledWith(2, { gameId: 'game-1', holeNumber: 5, userIds: ['tore'], hit: true });
    expect(checked('marte')).toBe(true);
    expect(checked('tore')).toBe(true);
    expect(checked('kari')).toBe(false);
    expect(subtitle()).toHaveTextContent('2 av 4 traff');
    expect(screen.getByTestId(`${ID}-sheet-status`)).toHaveTextContent('Lagret av deg. Hvert lag får poeng for høyst 2.');

    await fireEvent.press(screen.getByTestId(`${ID}-line-none`));
    expect(record).toHaveBeenLastCalledWith({
      gameId: 'game-1',
      holeNumber: 5,
      userIds: ['me', 'marte', 'tore', 'kari'],
      hit: false,
    });
    expect(checked('none')).toBe(true);
    expect(subtitle()).toHaveTextContent('Ingen traff greenen');

    // Et nytt trykk på en ball som traff, tar treffet bort igjen.
    await fireEvent.press(screen.getByTestId(`${ID}-line-me`));
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ userIds: ['me'], hit: true }));
    await fireEvent.press(screen.getByTestId(`${ID}-line-me`));
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ userIds: ['me'], hit: false }));
  });

  it('leser det kampen har meldt inn, og hvem som lagret sist', async () => {
    writeGirAs('kari', { holeNumber: 5, userIds: ['marte'], hit: true });
    writeGirAs('kari', { holeNumber: 5, userIds: ['kari'], hit: false });
    writeGirAs('tore', { holeNumber: 5, userIds: ['tore'], hit: true });
    await renderLoaded();
    expect(subtitle()).toHaveTextContent('2 av 4 traff');
    await openSheet();
    expect(screen.getByTestId(`${ID}-sheet-status`)).toHaveTextContent('Lagret av Tore. Hvert lag får poeng for høyst 2.');
    expect(checked('none')).toBe(false);
  });

  it('ballen hopper tilbake når lagringen feiler', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await fireEvent.press(screen.getByTestId(`${ID}-line-kari`));
    expect(checked('kari')).toBe(true);
    await act(async () => server.heldWrites[0].release({ ok: false, error: 'db_error' }));
    expect(checked('kari')).toBe(false);
    expect(screen.getByTestId(`${ID}-sheet-notice`)).toHaveTextContent('Fikk ikke lagret. Sjekk nettet og prøv igjen.');
  });

  it('foursomes: én linje per side, og et trykk sender begge på siden', async () => {
    await renderLoaded({ balls: SIDES, oneBallPerSide: true });
    await openSheet();
    expect(screen.getByText('Deg og Marte')).toBeTruthy();
    expect(screen.getByTestId(`${ID}-sheet-status`)).toHaveTextContent(
      'Svaret deles med kampen. Laget spiller én ball, så det teller én gang.',
    );
    await fireEvent.press(screen.getByTestId(`${ID}-line-side-2`));
    expect(record).toHaveBeenCalledWith({ gameId: 'game-1', holeNumber: 5, userIds: ['tore', 'kari'], hit: true });
    expect(subtitle()).toHaveTextContent('1 av 2 traff');
  });

  it('raske trykk (G1): av og på igjen står til siste lagring er ferdig', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    expect(checked('marte')).toBe(false);
    // Første lagring lander, og hentingen etterpå viser Marte som truffet.
    await act(async () => server.heldWrites[0].release());
    expect(checked('marte')).toBe(false);
    await act(async () => server.heldWrites[1].release());
    expect(checked('marte')).toBe(false);
    expect(record.mock.calls.map(([w]) => w.hit)).toEqual([true, false]);
  });

  it('en kamerats retting står når du lagrer en annen ball (G2)', async () => {
    await renderLoaded();
    await openSheet();
    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    expect(checked('marte')).toBe(true);
    // Tore retter Marte til bommet, og pollen henter det.
    writeGirAs('tore', { holeNumber: 5, userIds: ['marte'], hit: false });
    await act(() => harness.poll());
    expect(checked('marte')).toBe(false);
    // Du huker av Tore. Mens den lagringen pågår, står Marte som bommet.
    server.holdWrites = true;
    await fireEvent.press(screen.getByTestId(`${ID}-line-tore`));
    expect(checked('marte')).toBe(false);
    expect(subtitle()).toHaveTextContent('1 av 4 traff');
    await act(async () => server.heldWrites[0].release());
    expect(checked('marte')).toBe(false);
  });

  it('en feil midt i køen tar ikke et senere trykk på samme ball (G3)', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    // På, av, på igjen. Den første lagringen feiler.
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    await act(async () => server.heldWrites[0].release({ ok: false, error: 'db_error' }));
    expect(checked('marte')).toBe(true);
    await act(async () => server.heldWrites[1].release());
    await act(async () => server.heldWrites[2].release());
    expect(record.mock.calls.map(([w]) => w.hit)).toEqual([true, false, true]);
    expect(checked('marte')).toBe(true);
    expect(screen.queryByTestId(`${ID}-sheet-notice`)).toBeNull();
  });

  it('en kamerat skriver samme ball mellom din lagring og hentingen (G7): kameratens svar står', async () => {
    server.holdWrites = true;
    await renderLoaded();
    await openSheet();
    await fireEvent.press(screen.getByTestId(`${ID}-line-marte`));
    await act(async () => {
      server.heldWrites[0].release();
      writeGirAs('tore', { holeNumber: 5, userIds: ['marte'], hit: false });
    });
    expect(checked('marte')).toBe(false);
    expect(screen.getByTestId(`${ID}-sheet-status`)).toHaveTextContent('Lagret av Tore. Hvert lag får poeng for høyst 2.');
    await act(() => harness.poll());
    expect(checked('marte')).toBe(false);
  });

  it('uten nett er linjene sperret', async () => {
    const view = await renderLoaded();
    await openSheet();
    await view.rerender(<Harness online={false} />);
    const line = screen.getByTestId(`${ID}-line-marte`);
    expect(line.props.accessibilityState).toEqual({ checked: false, disabled: true });
    await fireEvent.press(line);
    expect(record).not.toHaveBeenCalled();
  });
});
