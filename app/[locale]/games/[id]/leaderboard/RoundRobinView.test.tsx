import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  RoundRobinView,
  type RoundRobinPlayerInfo,
  type RoundRobinViewProps,
} from './RoundRobinView';
import type {
  RoundRobinResult,
  RoundRobinPlayerLine,
  RoundRobinSegmentLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, RoundRobinPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function makeSegment(
  segment: 1 | 2 | 3,
  partnerUserId: string,
  opponentUserIds: [string, string],
  holesWon: number,
  holesLost: number,
  holesHalved: number,
): RoundRobinSegmentLine {
  return {
    segment,
    holeNumbers:
      segment === 1
        ? [1, 2, 3, 4, 5, 6]
        : segment === 2
          ? [7, 8, 9, 10, 11, 12]
          : [13, 14, 15, 16, 17, 18],
    partnerUserId,
    opponentUserIds,
    holesWon,
    holesLost,
    holesHalved,
  };
}

function makePlayerLine(
  userId: string,
  teamNumber: number,
  rank: number,
  totalHoleWins: number,
  totalHolesLost: number,
  totalHolesHalved: number,
  segments: RoundRobinSegmentLine[],
): RoundRobinPlayerLine {
  return {
    userId,
    teamNumber,
    totalHoleWins,
    totalHolesLost,
    totalHolesHalved,
    segments,
    rank,
    tiedWith: [],
  };
}

function makeResult(): RoundRobinResult {
  // 4 spillere: u1=slot1(A), u2=slot2(B), u3=slot3(C), u4=slot4(D)
  // Rotasjon: seg1 A+B vs C+D, seg2 A+C vs B+D, seg3 A+D vs B+C
  return {
    kind: 'round_robin',
    allowancePct: 85,
    holes: [], // hull-detaljer testes i Type A roundRobin.test.ts
    players: [
      // u1 (A): 8 seire totalt, rank 1
      makePlayerLine('u1', 1, 1, 8, 4, 4, [
        makeSegment(1, 'u2', ['u3', 'u4'], 3, 2, 1),
        makeSegment(2, 'u3', ['u2', 'u4'], 3, 1, 2),
        makeSegment(3, 'u4', ['u2', 'u3'], 2, 1, 1),
      ]),
      // u3 (C): 6 seire totalt, rank 2
      makePlayerLine('u3', 3, 2, 6, 5, 7, [
        makeSegment(1, 'u4', ['u1', 'u2'], 2, 3, 1),
        makeSegment(2, 'u1', ['u2', 'u4'], 2, 2, 2),
        makeSegment(3, 'u2', ['u1', 'u4'], 2, 0, 4),
      ]),
      // u2 (B): 5 seire totalt, rank 3
      makePlayerLine('u2', 2, 3, 5, 6, 7, [
        makeSegment(1, 'u1', ['u3', 'u4'], 3, 2, 1),
        makeSegment(2, 'u4', ['u1', 'u3'], 1, 3, 2),
        makeSegment(3, 'u3', ['u1', 'u4'], 1, 1, 4),
      ]),
      // u4 (D): 3 seire totalt, rank 4
      makePlayerLine('u4', 4, 4, 3, 9, 6, [
        makeSegment(1, 'u3', ['u1', 'u2'], 2, 3, 1),
        makeSegment(2, 'u2', ['u1', 'u3'], 0, 4, 2),
        makeSegment(3, 'u1', ['u2', 'u3'], 1, 2, 1),
      ]),
    ],
  };
}

function defaultProps(
  overrides: Partial<RoundRobinViewProps> = {},
): RoundRobinViewProps {
  return {
    gameId: 'g1',
    gameName: 'Kompis-RR',
    result: makeResult(),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
    ]),
    scoreVisibility: 'live',
    gameStatus: 'active',
    holesPlayed: 18,
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('RoundRobinView', () => {
  it('viser per-spiller-rader sortert på rank med hull-seire og segment-sammendrag', () => {
    render(<RoundRobinView {...defaultProps()} />);

    const leaderboard = screen.getByTestId('round-robin-leaderboard');
    const rows = within(leaderboard).getAllByRole('listitem');

    // 4 spillere — 4 rader.
    expect(rows).toHaveLength(4);

    // Rad 0: u1 (Alice), rank 1, totalHoleWins=8.
    expect(rows[0].textContent).toContain('Alice Andersen');
    expect(rows[0].textContent).toContain('8');

    // Rad 1: u3 (Camilla), rank 2, totalHoleWins=6.
    expect(rows[1].textContent).toContain('Camilla Carlsen');
    expect(rows[1].textContent).toContain('6');

    // Rad 2: u2 (Bjørnen), rank 3, totalHoleWins=5.
    expect(rows[2].textContent).toContain('Bjørnen');
    expect(rows[2].textContent).toContain('5');

    // Rad 3: u4 (David), rank 4, totalHoleWins=3.
    expect(rows[3].textContent).toContain('David Dahl');
    expect(rows[3].textContent).toContain('3');

    // Leader-rad skal ha champagne-accent-styling (border-accent).
    expect(rows[0].innerHTML).toContain('border-accent');
    // Ikke-leder-rad skal ikke ha champion-accent.
    expect(rows[3].innerHTML).not.toContain('border-accent');

    // Segment-sammendrag skal vises.
    const summary = screen.getByTestId('round-robin-segment-summary');
    expect(summary).toBeTruthy();

    // Alice sitt segment-kort vises med partner-info.
    const aliceCard = screen.getByTestId('round-robin-segment-card-u1');
    expect(aliceCard.textContent).toContain('Alice Andersen');
    // Segment 1: med Bjørnen mot Camilla + David
    expect(aliceCard.textContent).toContain('Bjørnen');
    // Slot-label vises i leaderboard-raden.
    expect(rows[0].textContent).toContain('Slot A');
  });

  it('skjuler totaler og viser venterom-melding i reveal-modus midt-runde', () => {
    render(
      <RoundRobinView
        {...defaultProps({ scoreVisibility: 'reveal', gameStatus: 'active' })}
      />,
    );

    const hidden = screen.getByTestId('round-robin-reveal-hidden');
    expect(hidden.textContent).toContain('Resultatene avsløres etter runden');
    // Leaderboard-listen skal ikke være rendret.
    expect(screen.queryByTestId('round-robin-leaderboard')).toBeNull();
  });

  it('viser full leaderboard i reveal-modus når spillet er finished', () => {
    render(
      <RoundRobinView
        {...defaultProps({ scoreVisibility: 'reveal', gameStatus: 'finished' })}
      />,
    );

    // Leaderboard vises når finished, uavhengig av scoreVisibility.
    const leaderboard = screen.getByTestId('round-robin-leaderboard');
    const rows = within(leaderboard).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    // Venterom-meldingen skal IKKE vises.
    expect(screen.queryByTestId('round-robin-reveal-hidden')).toBeNull();
  });
});
