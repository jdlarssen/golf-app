// #2255: stubben på startbilletten (Type C) — én render per gren.
//
// Hvilken gren som velges, er låst i `gameTicket.test.ts` (`ticketStub`). Her
// låses at hver gren tegner sin testID og at knappene går dit de skal. Gull
// brukes bare på egen seier.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import type { TicketStub as TicketStubModel } from '../../lib/gameTicket';
import { PALETTES } from '../../theme';
import { TicketStub } from './TicketStub';

jest.mock('../../supabase', () => require('../../test/supabaseMock'));
// Venterommet lytter på spillets status; ingen kanal i en render-test.
jest.mock('../../data/realtime', () => ({
  subscribeGameStatus: jest.fn(() => () => undefined),
}));

async function renderStub(stub: TicketStubModel, flightCta: string | null = null) {
  const onNavigate = jest.fn();
  const view = await render(
    <TicketStub
      stub={stub}
      gameId="g1"
      courseName="Losby Golf"
      teeOffAt={new Date(Date.now() + 30 * 60_000).toISOString()}
      flightCta={flightCta}
      onChanged={jest.fn()}
      onNavigate={onNavigate}
    />,
  );
  return { onNavigate, view };
}

it.each<[string, TicketStubModel, string]>([
  ['stengt format', { kind: 'gated', reason: 'mode' }, 'format-gate-link'],
  ['ikke spiller', { kind: 'notPlayer' }, 'not-a-player'],
  ['trukket av seg selv', { kind: 'withdrawn', bySelf: true }, 'withdrawn-undo'],
  ['utkast', { kind: 'draft' }, 'ticket-draft'],
  ['planlagt', { kind: 'scheduled' }, 'waiting-room'],
  ['avsluttet uten plass', { kind: 'finished', result: null }, 'finished-banner'],
  [
    'levert, venter på makker',
    { kind: 'active', state: 'submitted_pending_approval', played: 18, total: 18, nextHole: 1 },
    'submitted-banner',
  ],
])('%s tegner sin gren', async (_case, stub, testID) => {
  await renderStub(stub);
  expect(screen.getByTestId(testID)).toBeTruthy();
});

it('planlagt: påmeldt, venterom og «Vis på kart» med banenavnet som søk', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await renderStub({ kind: 'scheduled' });
  expect(screen.getByTestId('ticket-registered')).toBeTruthy();
  expect(screen.getByTestId('waiting-room-countdown')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('view-on-map'));
  expect(open).toHaveBeenCalledWith(expect.stringContaining('Losby%20Golf'));
  open.mockRestore();
});

it.each<[string, TicketStubModel, string, object]>([
  [
    'fortsett på neste tomme hull',
    { kind: 'active', state: 'in_progress', played: 7, total: 18, nextHole: 8 },
    'Hole',
    { gameId: 'g1', holeNumber: 8 },
  ],
  [
    'start runden på hull 1',
    { kind: 'active', state: 'not_started', played: 0, total: 18, nextHole: 1 },
    'Hole',
    { gameId: 'g1', holeNumber: 1 },
  ],
  [
    'alle hull ført: gjennomgå og lever',
    { kind: 'active', state: 'ready_to_submit', played: 18, total: 18, nextHole: 1 },
    'Scorecard',
    { gameId: 'g1' },
  ],
  ['avsluttet: se tavla', { kind: 'finished', result: null }, 'Leaderboard', { gameId: 'g1' }],
])('%s', async (_case, stub, route, params) => {
  const { onNavigate } = await renderStub(stub);
  const button = screen.queryByTestId('primary-cta') ?? screen.getByTestId('ticket-board');
  await fireEvent.press(button);
  expect(onNavigate).toHaveBeenCalledWith(route, params);
});

it('fremdriftslinja er skjult for skjermleseren; teksten over sier det samme', async () => {
  await renderStub({ kind: 'active', state: 'in_progress', played: 7, total: 18, nextHole: 8 });
  expect(screen.getByTestId('ticket-played')).toBeTruthy();
  expect(screen.queryByTestId('ticket-progress')).toBeNull();
  expect(screen.getByTestId('ticket-progress', { includeHiddenElements: true })).toBeTruthy();
});

it('gull bare på egen seier, som en skive ved teksten', async () => {
  const { view } = await renderStub({ kind: 'finished', result: { text: '🥇 Du vant', isWin: true } });
  expect(screen.getByTestId('ticket-result')).toHaveTextContent('🥇 Du vant');
  expect(screen.getByTestId('ticket-result-gold', { includeHiddenElements: true })).toHaveStyle({
    backgroundColor: PALETTES.light.accent,
  });

  await view.rerender(
    <TicketStub
      stub={{ kind: 'finished', result: { text: '3. plass av 12', isWin: false } }}
      gameId="g1"
      courseName={null}
      teeOffAt={null}
      flightCta={null}
      onChanged={jest.fn()}
      onNavigate={jest.fn()}
    />,
  );
  expect(screen.queryByTestId('ticket-result-gold', { includeHiddenElements: true })).toBeNull();
});

it('med et makkerkort å levere står knappen over levert-teksten (#2200)', async () => {
  const { onNavigate } = await renderStub(
    { kind: 'active', state: 'submitted_approved', played: 18, total: 18, nextHole: 1 },
    'Lever kortet du har ført',
  );
  expect(screen.getByTestId('submitted-banner')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('deliver-flight-cta'));
  expect(onNavigate).toHaveBeenCalledWith('Scorecard', { gameId: 'g1' });
});
