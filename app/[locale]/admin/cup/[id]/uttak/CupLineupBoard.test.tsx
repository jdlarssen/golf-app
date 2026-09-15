import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CupLineupBoard } from './CupLineupBoard';
import type { CupLineupBoard as Board } from '@/lib/cup/lineupData';

/**
 * Type C per docs/test-discipline.md — ÉN render-test for uttaks-rommets nye
 * planlagt-kort (#1902). Den asserter KUN wiring: at kortet vises for
 * arrangøren, at sperren på «Åpne en økt» følger `plannedMatchCount`, og at
 * skjemaet sender de riktige feltene til server-action-en.
 *
 * Tallene selv (2,5 · 3,5 · 14,5) er Type A og er dekket i
 * `lib/cup/pointsToWin.test.ts` — de re-asserteres bevisst IKKE her.
 *
 * #1901 adds the "Try again" wiring to the existing wiring test rather than a
 * fifth render test. When the button shows is Type A (`canRetryReveal` in
 * `lib/cup/lineupReveal.test.ts`) and is not re-asserted here.
 */

const setPlannedMock = vi.fn<(fd: FormData) => Promise<{ error: string }>>(
  async () => ({ error: '' }),
);
const retryMock = vi.fn<(fd: FormData) => Promise<{ error: string }>>(
  async () => ({ error: '' }),
);
vi.mock('@/lib/cup/lineupActions', () => ({
  setCupPlannedMatchCount: (fd: FormData) => setPlannedMock(fd),
  openCupLineupSession: async () => ({ error: '' }),
  submitCupLineup: async () => ({ error: '' }),
  unlockCupLineup: async () => ({ error: '' }),
  deleteCupLineupSession: async () => ({ error: '' }),
  retryCupLineupReveal: (fd: FormData) => retryMock(fd),
}));

function board(overrides: Partial<Board> = {}): Board {
  return {
    access: {
      userId: 'organizer',
      isAdmin: false,
      groupId: null,
      role: { kind: 'organizer' },
      participants: [
        { userId: 'cap1', teamNumber: 1, isCaptain: true },
        { userId: 'pl1', teamNumber: 1, isCaptain: false },
        { userId: 'cap2', teamNumber: 2, isCaptain: true },
        { userId: 'pl2', teamNumber: 2, isCaptain: false },
      ],
    },
    cupName: 'QA-cup',
    cupStatus: 'draft',
    teamNames: { 1: 'Europa', 2: 'USA' },
    sessions: [],
    plannedMatchCount: null,
    pointsToWin: null,
    hasDefaultWeights: true,
    matchCount: 0,
    pendingSlotCount: 0,
    // To per lag: default-formatet er foursomes, og med bare én spiller per
    // lag ville `squadTooSmall` sperret knappen uansett — da hadde testen
    // målt feil regel.
    squads: {
      1: [
        { userId: 'cap1', displayName: 'Kaptein 1', hcpIndex: 10 },
        { userId: 'pl1', displayName: 'Spiller 1', hcpIndex: 14 },
      ],
      2: [
        { userId: 'cap2', displayName: 'Kaptein 2', hcpIndex: 12 },
        { userId: 'pl2', displayName: 'Spiller 2', hcpIndex: 16 },
      ],
      unassigned: [],
    },
    ...overrides,
  } as Board;
}

describe('CupLineupBoard — planlagt antall kamper (#1902)', () => {
  it('planlagt mangler: hjelpetekst vises og «Åpne økten» er sperret', () => {
    render(<CupLineupBoard tournamentId="cup-1" board={board()} />);

    expect(screen.getByTestId('cup-lineup-needs-planned')).toBeTruthy();
    expect(
      screen.getByTestId('cup-lineup-open').hasAttribute('disabled'),
    ).toBe(true);
  });

  it('planlagt satt: hjelpeteksten er borte og knappen er åpen', () => {
    render(
      <CupLineupBoard
        tournamentId="cup-1"
        board={board({ plannedMatchCount: 28 })}
      />,
    );

    expect(screen.queryByTestId('cup-lineup-needs-planned')).toBeNull();
    expect(
      screen.getByTestId('cup-lineup-open').hasAttribute('disabled'),
    ).toBe(false);
  });

  it('vektet cup får hverken kort eller sperre (#1441 D8)', () => {
    render(
      <CupLineupBoard
        tournamentId="cup-1"
        board={board({ hasDefaultWeights: false })}
      />,
    );

    expect(screen.queryByTestId('cup-lineup-planned-input')).toBeNull();
    expect(screen.queryByTestId('cup-lineup-needs-planned')).toBeNull();
    expect(
      screen.getByTestId('cup-lineup-open').hasAttribute('disabled'),
    ).toBe(false);
  });

  it('lagring og «Prøv igjen» sender riktige felt til action-ene', async () => {
    // #1901: a session stuck after a failed reveal — both in, not revealed.
    const AT = '2026-09-15T10:00:00.000Z';
    const stuck = {
      id: 'sess-1',
      sessionIndex: 0,
      format: 'singles_matchplay',
      slotCount: 1,
      revealedAt: null,
      teams: [
        { teamNumber: 1, submittedAt: AT, slots: [] },
        { teamNumber: 2, submittedAt: AT, slots: [] },
      ],
    } satisfies Board['sessions'][number];
    render(
      <CupLineupBoard
        tournamentId="cup-1"
        board={board({ sessions: [stuck] })}
      />,
    );

    fireEvent.change(screen.getByTestId('cup-lineup-planned-input'), {
      target: { value: '28' },
    });
    fireEvent.click(screen.getByTestId('cup-lineup-planned-save'));

    await vi.waitFor(() => expect(setPlannedMock).toHaveBeenCalledTimes(1));
    const fd = setPlannedMock.mock.calls[0][0];
    expect(fd.get('id')).toBe('cup-1');
    expect(fd.get('planned_match_count')).toBe('28');
    expect(fd.get('intent')).toBe('planned');

    // The board shares one pending state, so wait for the save to settle
    // before the retry button takes a click.
    await vi.waitFor(() =>
      expect(
        screen.getByTestId('cup-lineup-retry-0').hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByTestId('cup-lineup-retry-0'));

    await vi.waitFor(() => expect(retryMock).toHaveBeenCalledTimes(1));
    const retryFd = retryMock.mock.calls[0][0];
    expect(retryFd.get('intent')).toBe('retry');
    expect(retryFd.get('id')).toBe('cup-1');
    expect(retryFd.get('session_id')).toBe('sess-1');
  });
});
