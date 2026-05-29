import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RoundRobinPodium, type RoundRobinPodiumProps } from './RoundRobinPodium';
import type { RoundRobinPlayerInfo } from './RoundRobinView';
import type { RoundRobinResult, RoundRobinPlayerLine } from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makePlayerLine(
  userId: string,
  teamNumber: number,
  rank: number,
  totalHoleWins: number,
  totalHolesLost: number,
): RoundRobinPlayerLine {
  return {
    userId,
    teamNumber,
    totalHoleWins,
    totalHolesLost,
    totalHolesHalved: 18 - totalHoleWins - totalHolesLost,
    segments: [],
    rank,
    tiedWith: [],
  };
}

function makeResult(players: RoundRobinPlayerLine[]): RoundRobinResult {
  return {
    kind: 'round_robin',
    allowancePct: 85,
    holes: [],
    players,
  };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, RoundRobinPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function defaultProps(
  overrides: Partial<RoundRobinPodiumProps> = {},
): RoundRobinPodiumProps {
  return {
    gameId: 'g1',
    gameName: 'Sommer-RR',
    result: makeResult([
      makePlayerLine('u1', 1, 1, 10, 4),
      makePlayerLine('u2', 2, 2, 7, 6),
      makePlayerLine('u3', 3, 3, 5, 8),
      makePlayerLine('u4', 4, 4, 3, 10),
    ]),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
    ]),
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('RoundRobinPodium', () => {
  it('rendrer 1./2./3. plass med navn + hull-seire, og 4. plass i rest-liste', () => {
    window.sessionStorage.clear();
    render(<RoundRobinPodium {...defaultProps()} />);

    // Podium-trinnene.
    const podium = screen.getByTestId('round-robin-podium');
    const first = within(podium).getByTestId('podium-rank-1');
    const second = within(podium).getByTestId('podium-rank-2');
    const third = within(podium).getByTestId('podium-rank-3');

    expect(first.textContent).toContain('Alice Andersen');
    expect(first.textContent).toContain('10');
    expect(second.textContent).toContain('Bjørnen');
    expect(second.textContent).toContain('7');
    expect(third.textContent).toContain('Camilla Carlsen');
    expect(third.textContent).toContain('5');

    // 4.-plass i rest-listen.
    const rest = screen.getByTestId('round-robin-rest');
    expect(rest.textContent).toContain('David Dahl');
    expect(rest.textContent).toContain('3');
  });
});
