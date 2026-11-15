// #2283: GIR-raden og arket i cup (Type C). Hver ball er en av/på-linje, et
// trykk lagrer bare den ballen, «Ingen traff greenen» setter alle til bommet,
// og en foursomes-side er én linje.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { recordGirClaims } from '../../data/sideClaims';
import { GirContestCard } from './GirContestCard';

jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());
jest.mock('../../data/sideClaims', () => ({
  recordGirClaims: jest.fn(async () => ({ ok: true })),
}));

const recordMock = recordGirClaims as jest.MockedFunction<typeof recordGirClaims>;

const ball = (id: string, label: string, initials: string) => ({
  key: id,
  userIds: [id],
  label,
  faces: [{ initials }],
});

const FOURBALL = [
  ball('me', 'Deg', 'JB'),
  ball('marte', 'Marte Lie', 'ML'),
  ball('tore', 'Tore Lunde', 'TL'),
  ball('kari', 'Kari Nilsen', 'KN'),
];

const NAMES: Record<string, string> = { marte: 'Marte', tore: 'Tore', kari: 'Kari' };

function props(over: Partial<ComponentProps<typeof GirContestCard>> = {}): ComponentProps<typeof GirContestCard> {
  return {
    gameId: 'game-1',
    holeNumber: 5,
    par: 4,
    contest: { category: 'gir', source: 'cup', points: 1.5, maxPerTeam: 2 },
    balls: FOURBALL,
    oneBallPerSide: false,
    meId: 'me',
    claims: [],
    failed: false,
    online: true,
    savedByName: (id: string) => NAMES[id] ?? null,
    refresh: jest.fn(async () => undefined),
    ...over,
  };
}

const row = (userId: string, hit: boolean, updatedAt = '2026-11-15T10:00:00Z', enteredBy = 'tore') => ({
  holeNumber: 5,
  userId,
  hit,
  enteredBy,
  updatedAt,
});

beforeEach(() => {
  recordMock.mockReset();
  recordMock.mockResolvedValue({ ok: true });
});

describe('GirContestCard', () => {
  it('to trykk lagrer to treff, hver ball for seg, og «Ingen traff greenen» setter alle til bommet', async () => {
    await render(<GirContestCard {...props()} />);
    expect(screen.getByTestId('side-contest-gir-subtitle')).toHaveTextContent('+1,5 p per GIR');

    await fireEvent.press(screen.getByTestId('side-contest-gir'));
    expect(screen.getByText('Sidepoeng · hull 5 · +1,5 p per GIR')).toBeTruthy();
    expect(screen.getByText('Hvem var på greenen på to slag? Trykk på alle som traff.')).toBeTruthy();

    const marte = screen.getByTestId('side-contest-gir-line-marte');
    expect(marte.props.accessibilityRole).toBe('checkbox');
    await fireEvent.press(marte);
    await fireEvent.press(screen.getByTestId('side-contest-gir-line-tore'));

    expect(recordMock).toHaveBeenNthCalledWith(1, { gameId: 'game-1', holeNumber: 5, userIds: ['marte'], hit: true });
    expect(recordMock).toHaveBeenNthCalledWith(2, { gameId: 'game-1', holeNumber: 5, userIds: ['tore'], hit: true });
    expect(screen.getByTestId('side-contest-gir-line-marte').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('side-contest-gir-line-tore').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('side-contest-gir-line-kari').props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('side-contest-gir-subtitle')).toHaveTextContent('2 av 4 traff');
    expect(screen.getByTestId('side-contest-gir-sheet-status')).toHaveTextContent(
      'Lagret av deg. Hvert lag får poeng for høyst 2.',
    );

    await fireEvent.press(screen.getByTestId('side-contest-gir-line-none'));
    expect(recordMock).toHaveBeenLastCalledWith({
      gameId: 'game-1',
      holeNumber: 5,
      userIds: ['me', 'marte', 'tore', 'kari'],
      hit: false,
    });
    expect(screen.getByTestId('side-contest-gir-line-none').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('side-contest-gir-subtitle')).toHaveTextContent('Ingen traff greenen');

    // Et nytt trykk på en ball som traff, tar treffet bort igjen.
    await fireEvent.press(screen.getByTestId('side-contest-gir-line-me'));
    expect(recordMock).toHaveBeenLastCalledWith(expect.objectContaining({ userIds: ['me'], hit: true }));
    await fireEvent.press(screen.getByTestId('side-contest-gir-line-me'));
    expect(recordMock).toHaveBeenLastCalledWith(expect.objectContaining({ userIds: ['me'], hit: false }));
  });

  it('leser det kampen har meldt inn, og hvem som lagret sist', async () => {
    const claims = [
      row('marte', true, '2026-11-15T10:00:00Z', 'kari'),
      row('tore', true, '2026-11-15T10:02:00Z', 'tore'),
      row('kari', false, '2026-11-15T10:01:00Z', 'kari'),
    ];
    await render(<GirContestCard {...props({ claims })} />);
    expect(screen.getByTestId('side-contest-gir-subtitle')).toHaveTextContent('2 av 4 traff');
    await fireEvent.press(screen.getByTestId('side-contest-gir'));
    expect(screen.getByTestId('side-contest-gir-sheet-status')).toHaveTextContent(
      'Lagret av Tore. Hvert lag får poeng for høyst 2.',
    );
    expect(screen.getByTestId('side-contest-gir-line-none').props.accessibilityState.checked).toBe(false);
  });

  it('ballen hopper tilbake når lagringen feiler', async () => {
    recordMock.mockResolvedValueOnce({ ok: false, error: 'db_error' });
    await render(<GirContestCard {...props()} />);
    await fireEvent.press(screen.getByTestId('side-contest-gir'));
    await fireEvent.press(screen.getByTestId('side-contest-gir-line-kari'));
    expect(screen.getByTestId('side-contest-gir-line-kari').props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('side-contest-gir-sheet-notice')).toHaveTextContent(
      'Fikk ikke lagret. Sjekk nettet og prøv igjen.',
    );
  });

  it('foursomes: én linje per side, og et trykk sender begge på siden', async () => {
    const balls = [
      { key: 'side-1', userIds: ['me', 'marte'], label: 'Deg og Marte', faces: [{ initials: 'JB' }, { initials: 'ML' }] },
      { key: 'side-2', userIds: ['tore', 'kari'], label: 'Tore og Kari', faces: [{ initials: 'TL' }, { initials: 'KN' }] },
    ];
    await render(<GirContestCard {...props({ balls, oneBallPerSide: true })} />);
    await fireEvent.press(screen.getByTestId('side-contest-gir'));
    expect(screen.getByText('Deg og Marte')).toBeTruthy();
    expect(screen.getByTestId('side-contest-gir-sheet-status')).toHaveTextContent(
      'Svaret deles med kampen. Laget spiller én ball, så det teller én gang.',
    );
    await fireEvent.press(screen.getByTestId('side-contest-gir-line-side-2'));
    expect(recordMock).toHaveBeenCalledWith({ gameId: 'game-1', holeNumber: 5, userIds: ['tore', 'kari'], hit: true });
    expect(screen.getByTestId('side-contest-gir-subtitle')).toHaveTextContent('1 av 2 traff');
  });

  it('raske trykk: av og på igjen står til siste lagring er ferdig', async () => {
    const answers: ((result: { ok: true }) => void)[] = [];
    recordMock.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const p = props();
    const view = await render(<GirContestCard {...p} />);
    await fireEvent.press(screen.getByTestId('side-contest-gir'));
    await fireEvent.press(screen.getByTestId('side-contest-gir-line-marte'));
    await fireEvent.press(screen.getByTestId('side-contest-gir-line-marte'));
    expect(screen.getByTestId('side-contest-gir-line-marte').props.accessibilityState.checked).toBe(false);

    // Første lagring lander, og hentingen gir serverens mellomsvar: Marte traff.
    await act(async () => answers[0]({ ok: true }));
    await view.rerender(<GirContestCard {...p} claims={[row('u-x', false, 't0'), row('marte', true, 't1', 'me')]} />);
    expect(screen.getByTestId('side-contest-gir-line-marte').props.accessibilityState.checked).toBe(false);

    await act(async () => answers[1]({ ok: true }));
    expect(recordMock.mock.calls.map(([write]) => write.hit)).toEqual([true, false]);
  });

  it('en kamerats retting står når du lagrer en annen ball', async () => {
    const answers: ((result: { ok: true }) => void)[] = [];
    recordMock.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const marteHit = [row('marte', true, 't1', 'me')];
    const refresh = jest.fn().mockResolvedValueOnce({ gir: marteHit });
    const p = props({ refresh });
    const view = await render(<GirContestCard {...p} />);
    await fireEvent.press(screen.getByTestId('side-contest-gir'));
    await fireEvent.press(screen.getByTestId('side-contest-gir-line-marte'));
    await act(async () => answers[0]({ ok: true }));
    await view.rerender(<GirContestCard {...p} claims={marteHit} />);

    // Tore retter Marte til bommet, og pollen henter det.
    await view.rerender(<GirContestCard {...p} claims={[row('marte', false, 't2', 'tore')]} />);
    // Du huker av Tore. Mens den lagringen pågår, står Marte som bommet.
    await fireEvent.press(screen.getByTestId('side-contest-gir-line-tore'));
    expect(screen.getByTestId('side-contest-gir-line-marte').props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('side-contest-gir-subtitle')).toHaveTextContent('1 av 4 traff');
    await act(async () => answers[1]({ ok: true }));
  });

  it('en feil midt i køen tar ikke et senere trykk på samme ball', async () => {
    const answers: ((result: Awaited<ReturnType<typeof recordGirClaims>>) => void)[] = [];
    recordMock.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    await render(<GirContestCard {...props()} />);
    await fireEvent.press(screen.getByTestId('side-contest-gir'));
    // På, av, på igjen. Den første lagringen feiler.
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByTestId('side-contest-gir-line-marte'));
    await act(async () => answers[0]({ ok: false, error: 'db_error' }));
    expect(screen.getByTestId('side-contest-gir-line-marte').props.accessibilityState.checked).toBe(true);
    await act(async () => answers[1]({ ok: true }));
    await act(async () => answers[2]({ ok: true }));
    expect(recordMock.mock.calls.map(([write]) => write.hit)).toEqual([true, false, true]);
  });

  it('uten nett er linjene sperret', async () => {
    const p = props();
    const view = await render(<GirContestCard {...p} />);
    await fireEvent.press(screen.getByTestId('side-contest-gir'));
    await view.rerender(<GirContestCard {...p} online={false} />);
    const line = screen.getByTestId('side-contest-gir-line-marte');
    expect(line.props.accessibilityState).toEqual({ checked: false, disabled: true });
    await fireEvent.press(line);
    expect(recordMock).not.toHaveBeenCalled();
  });
});
