import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PatsomePodium } from './PatsomePodium';
import type { PatsomePlayerInfo } from './PatsomeView';
import type { PatsomeResult, PatsomeTeamLine } from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeTeamLine(
  teamNumber: number,
  playerIds: string[],
  rank: number,
  totalPoints: number,
  tiedWith: number[] = [],
): PatsomeTeamLine {
  return {
    teamNumber,
    playerIds,
    captainUserId: playerIds[0]!,
    // Per-hull-data brukes ikke av podiet (topp-3) — «Hull for hull»-flaten
    // har egen render-test.
    holes: [],
    segments: {
      fourball: { segment: 'fourball', points: totalPoints, holesPlayed: 6 },
      greensome: { segment: 'greensome', points: 0, holesPlayed: 6 },
      foursomes: { segment: 'foursomes', points: 0, holesPlayed: 6 },
    },
    totalPoints,
    rank,
    tiedWith,
  };
}

function makeResult(teams: PatsomeTeamLine[]): PatsomeResult {
  return { kind: 'patsome', scoring: 'net', teams };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, PatsomePlayerInfo> {
  return new Map(rows.map(([userId, name, nickname]) => [userId, { name, nickname }]));
}

describe('PatsomePodium', () => {
  // Type C: nøyaktig ÉN render-test — delt-førsteplass-casen (#1573).
  it('delt førsteplass: begge medvinner-lag får champagne, medaljong «1» og «Delt 1. plass»-merke', () => {
    window.sessionStorage.clear();
    render(
      <PatsomePodium
        gameId="g1"
        gameName="Sommerturnering"
        result={makeResult([
          makeTeamLine(1, ['u1', 'u2'], 1, 42, [2]),
          makeTeamLine(2, ['u3', 'u4'], 1, 42, [1]),
          makeTeamLine(3, ['u5', 'u6'], 3, 28),
        ])}
        playersById={makePlayers([
          ['u1', 'Alice Andersen', null],
          ['u2', 'Bjørn Berg', 'Bjørnen'],
          ['u3', 'Camilla Carlsen', null],
          ['u4', 'David Dahl', null],
          ['u5', 'Erik Eriksen', null],
          ['u6', 'Frida Frost', null],
        ])}
        backHref="/games/g1"
      />,
    );

    const podium = screen.getByTestId('patsome-podium');
    // Testid følger fortsatt slotten (posisjonen) — presentasjonen følger rank.
    const slot1 = within(podium).getByTestId('podium-rank-1');
    const slot2 = within(podium).getByTestId('podium-rank-2');
    const slot3 = within(podium).getByTestId('podium-rank-3');

    expect(slot1.dataset.rank).toBe('1');
    expect(slot2.dataset.rank).toBe('1');
    // Medvinneren på slot 2 skal ha champagne-accent og medaljong «1» — ikke sølv.
    expect(slot2.className).toMatch(/border-accent/);
    expect(within(slot2).getByTitle('1. plass')).toBeInTheDocument();
    expect(slot1.textContent).toContain('Delt 1. plass');
    expect(slot2.textContent).toContain('Delt 1. plass');

    // Tredjeplassen beholder bronse uten delt-merke.
    expect(slot3.dataset.rank).toBe('3');
    expect(within(slot3).getByTitle('3. plass')).toBeInTheDocument();
    expect(slot3.textContent).not.toContain('Delt');
  });
});
