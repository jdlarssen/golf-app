// #2255: stubben på startbilletten (Type C) — én render per gren.
//
// Hvilken gren som velges, er låst i `gameTicket.test.ts` (`ticketStub`). Her
// låses at hver gren tegner sin testID og at knappene går dit de skal. Gull
// brukes bare på egen seier, og da som ett merke.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Linking } from 'react-native';
import type { TicketStub as TicketStubModel } from '../../lib/gameTicket';
import { PALETTES } from '../../theme';
import { TicketStub } from './TicketStub';

jest.mock('../../supabase', () => require('../../test/supabaseMock'));
// Venterommet lytter på spillets status; ingen kanal i en render-test.
jest.mock('../../data/realtime', () => ({
  subscribeGameStatus: jest.fn(() => () => undefined),
}));
// Kalendermodulen er native; skjermtesten ser bare svaret (#2255 PR 2).
const mockAddToCalendar = jest.fn();
jest.mock('../../lib/addToCalendar', () => ({
  addToCalendar: (...args: unknown[]) => mockAddToCalendar(...args),
}));

const EVENT = {
  title: 'Klubbmesterskap',
  location: 'Losby Golf',
  startDate: '2026-10-03T07:30:00.000Z',
  endDate: '2026-10-03T12:00:00.000Z',
  notes: 'Tee: Gul · Stableford',
};

async function renderStub(
  stub: TicketStubModel,
  flightCta: string | null = null,
  calendarEvent: typeof EVENT | null = EVENT,
  runningTotal: string | null = null,
) {
  const onNavigate = jest.fn();
  const view = await render(
    <TicketStub
      stub={stub}
      gameId="g1"
      courseName="Losby Golf"
      teeOffAt={new Date(Date.now() + 30 * 60_000).toISOString()}
      calendarEvent={calendarEvent}
      runningTotal={runningTotal}
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
  // Kremfarget spor som i designet, ikke kantfargen.
  expect(screen.getByTestId('ticket-progress', { includeHiddenElements: true })).toHaveStyle({
    backgroundColor: PALETTES.light.trackBg,
  });
});

it('tavlas tall står til høyre for fremdriften når skjermen har ett, ellers ingenting', async () => {
  const active: TicketStubModel = { kind: 'active', state: 'in_progress', played: 7, total: 18, nextHole: 8 };
  const { view } = await renderStub(active, null, EVENT, '15\u00A0p');
  expect(screen.getByTestId('ticket-total')).toHaveTextContent('15 p');

  await view.rerender(
    <TicketStub
      stub={active}
      gameId="g1"
      courseName={null}
      teeOffAt={null}
      calendarEvent={null}
      runningTotal={null}
      flightCta={null}
      onChanged={jest.fn()}
      onNavigate={jest.fn()}
    />,
  );
  expect(screen.queryByTestId('ticket-total')).toBeNull();
});

it('gull bare på egen seier: medaljen i teksten og teksten i gullets lesbare tone, ingen ekstra skive', async () => {
  const { view } = await renderStub({ kind: 'finished', result: { text: '🥇 Du vant', isWin: true } });
  expect(screen.getByTestId('ticket-result')).toHaveTextContent('🥇 Du vant');
  expect(screen.getByTestId('ticket-result')).toHaveStyle({ color: PALETTES.light.accentText });

  await view.rerender(
    <TicketStub
      stub={{ kind: 'finished', result: { text: '3. plass av 12', isWin: false } }}
      gameId="g1"
      courseName={null}
      teeOffAt={null}
      calendarEvent={null}
      flightCta={null}
      onChanged={jest.fn()}
      onNavigate={jest.fn()}
    />,
  );
  expect(screen.getByTestId('ticket-result')).toHaveStyle({ color: PALETTES.light.text });
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

describe('«Legg til i kalender» (#2255 PR 2)', () => {
  beforeEach(() => mockAddToCalendar.mockReset());

  it('sender hendelsen til kalenderen, og et ja gir ingen melding', async () => {
    mockAddToCalendar.mockResolvedValue({ ok: true });
    await renderStub({ kind: 'scheduled' });
    await fireEvent.press(screen.getByTestId('add-to-calendar'));
    expect(mockAddToCalendar).toHaveBeenCalledWith(EVENT);
    expect(screen.queryByTestId('scheduled-action-notice')).toBeNull();
  });

  it.each([
    ['nei til tilgang', { ok: false, reason: 'denied' }],
    ['feil fra modulen', { ok: false, reason: 'failed' }],
  ])('%s gir en rolig melding under knappene, ingen krasj', async (_case, result) => {
    mockAddToCalendar.mockResolvedValue(result);
    await renderStub({ kind: 'scheduled' });
    await fireEvent.press(screen.getByTestId('add-to-calendar'));
    expect(screen.getByTestId('scheduled-action-notice')).toBeTruthy();
  });

  it('uten tee-off står ikke knappen, men kartet gjør det', async () => {
    await renderStub({ kind: 'scheduled' }, null, null);
    expect(screen.queryByTestId('add-to-calendar')).toBeNull();
    expect(screen.getByTestId('view-on-map')).toBeTruthy();
  });
});

it.each<[string, TicketStubModel, string]>([
  ['stengt format', { kind: 'gated', reason: 'mode' }, 'format-gate'],
  ['ikke spiller', { kind: 'notPlayer' }, 'not-a-player'],
  ['utkast', { kind: 'draft' }, 'ticket-draft'],
  ['avsluttet uten plass', { kind: 'finished', result: null }, 'finished-banner'],
  [
    'levert',
    { kind: 'active', state: 'submitted_pending_approval', played: 18, total: 18, nextHole: 1 },
    'submitted-banner',
  ],
  ['trukket', { kind: 'withdrawn', bySelf: true }, 'withdrawn-banner'],
])('%s: brødteksten er 13 pt i muted, som i designet', async (_case, stub, testID) => {
  await renderStub(stub);
  // Første tekst i blokken er setningen; knapper kommer etter den.
  const [sentence] = within(screen.getByTestId(testID)).getAllByText(/./);
  expect(sentence).toHaveStyle({ fontSize: 13, color: PALETTES.light.muted });
});
