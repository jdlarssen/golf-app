// #2348: render-testen (Type C) for arket «Trygt på telefonen»: rutene og
// skjermleserens navn på dem, dekningssetningen bare uten nett, «nettet er
// tilbake» mot «prøver å sende dem igjen», karantene med og uten lenke, og
// knappene. Arket leser bare: «Prøv å sende nå» starter en drain og ingenting mer.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { RoundSyncState } from '../../../../../lib/sync/roundSyncState';
import { drainQueue } from '../../data/syncWorker';
import { SyncSheet } from './SyncSheet';

jest.mock('react-native-safe-area-context', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock-fabrikken heises over importene
  require('../../test/safeAreaMock').safeAreaMock(),
);
jest.mock('../../data/syncWorker', () => ({
  drainQueue: jest.fn(async () => ({ pushed: 0, rejected: 0, errored: 0, abandoned: 0 })),
}));

const NOTHING: RoundSyncState = {
  pendingScoreCount: 0,
  pendingTeeShotCount: 0,
  pendingHoles: [],
  pendingScoreHoles: [],
  settled: false,
  lastErrorIsNetwork: false,
  quarantinedHoles: [],
  quarantineLockedHoles: [],
  quarantineLockedOnly: false,
};
/** Artboardet: hull 1–6 sendt, 7–9 på telefonen. */
const PENDING: RoundSyncState = {
  ...NOTHING,
  pendingScoreCount: 3,
  pendingHoles: [7, 8, 9],
  pendingScoreHoles: [7, 8, 9],
  settled: true,
};
const NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SCORED = new Set(NINE);

function renderSheet(overrides: Partial<Parameters<typeof SyncSheet>[0]> = {}) {
  const props = {
    open: true,
    state: PENDING,
    scoredHoles: SCORED,
    holes: NINE,
    online: false,
    sunlight: false,
    onGoToHole: jest.fn(),
    onRetried: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { props, result: render(<SyncSheet {...props} />) };
}

describe('SyncSheet', () => {
  beforeEach(() => {
    (drainQueue as jest.Mock).mockClear();
  });

  it('uten nett: artboardets tekst, ● på hull 7–9 og ✓ på resten', async () => {
    await renderSheet().result;
    expect(screen.getByText('Trygt på telefonen')).toBeTruthy();
    expect(
      screen.getByText(
        'Du har ikke dekning her. Slagene fra hull 7, 8 og 9 er lagret på telefonen og sendes av seg selv når nettet er tilbake.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('sync-cell-1-sent')).toBeTruthy();
    expect(screen.getByTestId('sync-cell-7-pending')).toBeTruthy();
    expect(screen.getByLabelText('Hull 7: på telefonen')).toBeTruthy();
    expect(screen.getByLabelText('Hull 1: sendt')).toBeTruthy();
    // Legenden har bare tilstandene som finnes, og er skjult for skjermleseren
    // (rutene sier det selv).
    const hidden = { includeHiddenElements: true };
    expect(screen.getByTestId('sync-legend-sent', hidden)).toHaveTextContent('✓ sendt');
    expect(screen.getByTestId('sync-legend-pending', hidden)).toHaveTextContent('● på telefonen');
    expect(screen.queryByTestId('sync-legend-empty', hidden)).toBeNull();
    expect(screen.queryByTestId('sync-legend-sent')).toBeNull();
  });

  it('et slag og et utslagsvalg på hver sitt hull: setningen nevner bare slaget', async () => {
    await renderSheet({
      online: true,
      state: { ...NOTHING, pendingScoreCount: 1, pendingTeeShotCount: 1, pendingHoles: [7, 9], pendingScoreHoles: [7], settled: true },
    }).result;
    expect(screen.getByText('Slaget fra hull 7 er lagret på telefonen. Appen prøver å sende det igjen.')).toBeTruthy();
  });

  it('forklaringen om å taste videre står bare når noe venter', async () => {
    const { rerender } = await renderSheet().result;
    expect(screen.getByTestId('sync-sheet-note')).toBeTruthy();
    const props = {
      open: true,
      scoredHoles: SCORED,
      holes: NINE,
      online: true,
      sunlight: false,
      onGoToHole: () => undefined,
      onRetried: () => undefined,
      onClose: () => undefined,
    };
    // Bare karantene: ingenting venter, og ingenting blir sendt av seg selv.
    await rerender(<SyncSheet {...props} state={{ ...NOTHING, quarantinedHoles: [7] }} />);
    expect(screen.queryByTestId('sync-sheet-note')).toBeNull();
    // Alt er sendt: heller ingen boks.
    await rerender(<SyncSheet {...props} state={NOTHING} />);
    expect(screen.queryByTestId('sync-sheet-note')).toBeNull();
  });

  it('på nett med en annen feil: ingen dekningssetning, og appen prøver igjen', async () => {
    await renderSheet({ online: true }).result;
    expect(screen.queryByText(/Du har ikke dekning her/)).toBeNull();
    expect(
      screen.getByText('Slagene fra hull 7, 8 og 9 er lagret på telefonen. Appen prøver å sende dem igjen.'),
    ).toBeTruthy();
  });

  it('på nett, men siste feil er nettet: «når nettet er tilbake»', async () => {
    await renderSheet({ online: true, state: { ...PENDING, lastErrorIsNetwork: true } }).result;
    expect(screen.getByText(/sendes av seg selv når nettet er tilbake/)).toBeTruthy();
  });

  it('karantene: rød tittel, ! i ruta, og «Tast hull N på nytt» går til hullet', async () => {
    const { props, result } = renderSheet({
      online: true,
      state: { ...NOTHING, quarantinedHoles: [7] },
      scoredHoles: new Set([1, 7]),
    });
    await result;
    expect(screen.getByText('Hull 7 ble ikke lagret.')).toBeTruthy();
    expect(screen.getByTestId('sync-cell-7-quarantined')).toBeTruthy();
    expect(screen.getByTestId('sync-cell-2-empty')).toBeTruthy();
    expect(screen.getByLabelText('Hull 2: ikke tastet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Tast hull 7 på nytt'));
    expect(props.onGoToHole).toHaveBeenCalledWith(7);
    // Ingenting venter: ingen «Prøv å sende nå».
    expect(screen.queryByTestId('sync-sheet-retry')).toBeNull();
  });

  it('låst karantene: forklaringen og ingen lenke', async () => {
    await renderSheet({
      state: { ...NOTHING, quarantinedHoles: [7], quarantineLockedHoles: [7], quarantineLockedOnly: true },
    }).result;
    expect(screen.getByTestId('sync-sheet-locked')).toBeTruthy();
    expect(screen.queryByText('Tast hull 7 på nytt')).toBeNull();
  });

  it('blandet karantene: lenke bare til hullet som kan tastes på nytt, og forklaringen for det låste', async () => {
    await renderSheet({
      state: { ...NOTHING, quarantinedHoles: [10, 11], quarantineLockedHoles: [11] },
    }).result;
    expect(screen.getByText('Hull 10 og 11 ble ikke lagret.')).toBeTruthy();
    expect(screen.getByText('Tast hull 10 på nytt')).toBeTruthy();
    expect(screen.queryByText('Tast hull 11 på nytt')).toBeNull();
    expect(screen.getByTestId('sync-sheet-locked')).toBeTruthy();
  });

  it('«Prøv å sende nå» drainer, viser «Sender…» og leser køen etterpå', async () => {
    jest.useFakeTimers();
    try {
      const { props, result } = renderSheet();
      await result;
      await fireEvent.press(screen.getByText('Prøv å sende nå'));
      expect(drainQueue).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Sender…')).toBeTruthy();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500);
      });
      expect(props.onRetried).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Prøv å sende nå')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('«Fortsett runden», bakgrunnen og tilbake-bevegelsen lukker', async () => {
    const { props, result } = renderSheet();
    await result;
    await fireEvent.press(screen.getByText('Fortsett runden'));
    await fireEvent.press(screen.getByRole('button', { name: 'Lukk' }));
    await fireEvent(screen.getByTestId('sync-sheet-modal'), 'accessibilityEscape');
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  it('atten hull: to rader à ni, og ingenting når arket er lukket', async () => {
    const holes = Array.from({ length: 18 }, (_, i) => i + 1);
    const { rerender } = await renderSheet({ holes, state: NOTHING, online: true }).result;
    expect(screen.getByText('Alle slagene er sendt.')).toBeTruthy();
    expect(screen.getByTestId('sync-cell-18-empty')).toBeTruthy();
    await rerender(
      <SyncSheet
        open={false}
        state={NOTHING}
        scoredHoles={SCORED}
        holes={holes}
        online
        sunlight={false}
        onGoToHole={() => undefined}
        onRetried={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.queryByTestId('sync-sheet')).toBeNull();
  });
});
