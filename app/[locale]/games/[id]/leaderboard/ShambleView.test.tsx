import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  ShambleView,
  type ShamblePlayerInfo,
  type ShambleViewProps,
} from './ShambleView';
import type {
  ShambleResult,
  ShambleHoleRow,
  ShambleTeamLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, ShamblePlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function makeTeam(
  overrides: Partial<ShambleTeamLine> & { teamNumber: number; members: string[] },
): ShambleTeamLine {
  return {
    totalScore: 36,
    holesCounted: 9,
    rank: 1,
    tiedWith: [],
    ...overrides,
  };
}

function makeHole(overrides: Partial<ShambleHoleRow>): ShambleHoleRow {
  return {
    holeNumber: 1,
    par: 4,
    strokeIndex: 1,
    teams: [],
    ...overrides,
  };
}

function makeResult(): ShambleResult {
  return {
    kind: 'shamble',
    variant: 'shamble',
    count: 2,
    scoring: 'net',
    teamSize: 4,
    holes: [
      // Hull 1: lag 1 scorer 7 (sum av de to laveste: 3+4), lag 2 pending
      makeHole({
        holeNumber: 1,
        par: 4,
        strokeIndex: 1,
        teams: [
          {
            teamNumber: 1,
            teamScore: 7,
            pending: false,
            perPlayer: [
              { userId: 'u1', gross: 3, effectiveScore: 3, counted: true },
              { userId: 'u2', gross: 4, effectiveScore: 4, counted: true },
              { userId: 'u3', gross: 5, effectiveScore: 5, counted: false },
              { userId: 'u4', gross: 6, effectiveScore: 6, counted: false },
            ],
          },
          {
            teamNumber: 2,
            teamScore: null,
            pending: true,
            perPlayer: [
              { userId: 'u5', gross: null, effectiveScore: null, counted: false },
              { userId: 'u6', gross: null, effectiveScore: null, counted: false },
              { userId: 'u7', gross: null, effectiveScore: null, counted: false },
              { userId: 'u8', gross: null, effectiveScore: null, counted: false },
            ],
          },
        ],
      }),
      // Hull 2: pending for begge lag
      makeHole({
        holeNumber: 2,
        par: 3,
        strokeIndex: 9,
        teams: [
          {
            teamNumber: 1,
            teamScore: null,
            pending: true,
            perPlayer: [
              { userId: 'u1', gross: null, effectiveScore: null, counted: false },
              { userId: 'u2', gross: null, effectiveScore: null, counted: false },
              { userId: 'u3', gross: null, effectiveScore: null, counted: false },
              { userId: 'u4', gross: null, effectiveScore: null, counted: false },
            ],
          },
          {
            teamNumber: 2,
            teamScore: null,
            pending: true,
            perPlayer: [
              { userId: 'u5', gross: null, effectiveScore: null, counted: false },
              { userId: 'u6', gross: null, effectiveScore: null, counted: false },
              { userId: 'u7', gross: null, effectiveScore: null, counted: false },
              { userId: 'u8', gross: null, effectiveScore: null, counted: false },
            ],
          },
        ],
      }),
    ],
    teams: [
      makeTeam({
        teamNumber: 1,
        members: ['u1', 'u2', 'u3', 'u4'],
        totalScore: 7,
        holesCounted: 1,
        rank: 1,
        tiedWith: [],
      }),
      makeTeam({
        teamNumber: 2,
        members: ['u5', 'u6', 'u7', 'u8'],
        totalScore: 0,
        holesCounted: 0,
        rank: 2,
        tiedWith: [],
      }),
    ],
  };
}

function defaultProps(
  overrides: Partial<ShambleViewProps> = {},
): ShambleViewProps {
  return {
    gameId: 'g1',
    gameName: 'Sommer-Shamble',
    result: makeResult(),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
      ['u5', 'Eva Eriksen', null],
      ['u6', 'Frank Foss', null],
      ['u7', 'Grete Grønn', null],
      ['u8', 'Hans Holm', null],
    ]),
    scoreVisibility: 'live',
    gameStatus: 'active',
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('ShambleView', () => {
  it('rendrer lag-rader med medlemsnavn og total, per-hull-rutenett, og skjuler tall i reveal-modus midt-runde', () => {
    // 1) Default (live, active) — full visning.
    const { unmount } = render(<ShambleView {...defaultProps()} />);

    // Lag-tabell: begge lag rendret.
    const leaderboard = screen.getByTestId('shamble-leaderboard');
    const teamRows = within(leaderboard).getAllByRole('listitem');
    expect(teamRows).toHaveLength(2);

    // Rad 0: Lag 1 (Alice + Bjørn + Camilla + David).
    expect(teamRows[0].textContent).toContain('Lag 1');
    expect(teamRows[0].textContent).toContain('Alice Andersen');
    // Rad 0: totalScore 7 vises.
    expect(teamRows[0].textContent).toContain('7');

    // Rad 1: Lag 2 (Eva + Frank + ...).
    expect(teamRows[1].textContent).toContain('Lag 2');
    expect(teamRows[1].textContent).toContain('Eva Eriksen');

    // Per-hull-liste: begge hull rendret.
    const holeList = screen.getByTestId('shamble-hole-list');
    expect(holeList.textContent).toContain('Hull 1');
    expect(holeList.textContent).toContain('Hull 2');

    // Hull 1, lag 2: pending — viser «—» via pending-testid.
    const pendingCell = screen.getByTestId('shamble-hole-1-team-2-pending');
    expect(pendingCell.textContent).toBe('—');

    unmount();

    // 2) Reveal-modus midt-runde → skjuler tall, viser venterom-melding.
    render(
      <ShambleView
        {...defaultProps({
          scoreVisibility: 'reveal',
          gameStatus: 'active',
        })}
      />,
    );
    const hidden = screen.getByTestId('shamble-reveal-hidden');
    expect(hidden.textContent).toContain('Resultatene avsløres etter runden');
    // Leaderboard og hull-listen skal ikke være rendret i reveal-modus.
    expect(screen.queryByTestId('shamble-leaderboard')).toBeNull();
    expect(screen.queryByTestId('shamble-hole-list')).toBeNull();
  });
});
