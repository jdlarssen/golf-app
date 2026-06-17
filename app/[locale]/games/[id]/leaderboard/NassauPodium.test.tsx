import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NassauPodium, type NassauPodiumProps } from './NassauPodium';
import type { NassauPlayerInfo } from './NassauView';
import type {
  NassauResult,
  NassauUnitLine,
  NassauSection,
  NassauSectionLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeUnitLine(
  userId: string,
  rank: number,
  units: number,
  unitBreakdown: { front9: boolean; back9: boolean; total18: boolean },
  total18Effective: number,
): NassauUnitLine {
  return {
    userId,
    units,
    unitBreakdown,
    total18EffectiveStrokes: total18Effective,
    total18SectionRank: rank,
    rank,
    tiedWith: [],
  };
}

function makeSectionLine(
  userId: string,
  rank: number,
  totalEffective: number,
  totalGross: number,
): NassauSectionLine {
  return {
    userId,
    totalEffectiveStrokes: totalEffective,
    totalGrossStrokes: totalGross,
    holesPlayed: 9,
    rank,
    tiedWith: [],
  };
}

function makeSection(
  name: 'front9' | 'back9' | 'total18',
  players: NassauSectionLine[],
  winnerUserIds: string[],
): NassauSection {
  const holeNumbers =
    name === 'front9'
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
      : name === 'back9'
        ? [10, 11, 12, 13, 14, 15, 16, 17, 18]
        : Array.from({ length: 18 }, (_, i) => i + 1);
  return {
    name,
    holeNumbers,
    players,
    winnerUserIds,
    isPending: false,
  };
}

function makeSweepResult(): NassauResult {
  // 4 spillere: uA sweeper (3 units), uB 0, uC 0, uD 0
  return {
    kind: 'nassau',
    scoring: 'net',
    sections: {
      front9: makeSection(
        'front9',
        [
          makeSectionLine('uA', 1, 34, 38),
          makeSectionLine('uB', 2, 38, 42),
          makeSectionLine('uC', 3, 40, 44),
          makeSectionLine('uD', 4, 42, 46),
        ],
        ['uA'],
      ),
      back9: makeSection(
        'back9',
        [
          makeSectionLine('uA', 1, 36, 40),
          makeSectionLine('uB', 2, 38, 42),
          makeSectionLine('uC', 3, 41, 45),
          makeSectionLine('uD', 4, 43, 47),
        ],
        ['uA'],
      ),
      total18: makeSection(
        'total18',
        [
          makeSectionLine('uA', 1, 70, 78),
          makeSectionLine('uB', 2, 76, 84),
          makeSectionLine('uC', 3, 81, 89),
          makeSectionLine('uD', 4, 85, 93),
        ],
        ['uA'],
      ),
    },
    players: [
      makeUnitLine('uA', 1, 3, { front9: true, back9: true, total18: true }, 70),
      makeUnitLine('uB', 2, 0, { front9: false, back9: false, total18: false }, 76),
      makeUnitLine('uC', 3, 0, { front9: false, back9: false, total18: false }, 81),
      makeUnitLine('uD', 4, 0, { front9: false, back9: false, total18: false }, 85),
    ],
    // Per-hull-data brukes ikke av NassauPodium (unit-podium) — den format-
    // bevisste «Hull for hull»-flaten har egen render-test (#496).
    holes: [],
  };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, NassauPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function defaultProps(
  overrides: Partial<NassauPodiumProps> = {},
): NassauPodiumProps {
  return {
    gameId: 'g1',
    gameName: 'Sommer-Nassau',
    result: makeSweepResult(),
    playersById: makePlayers([
      ['uA', 'Alice Andersen', null],
      ['uB', 'Bjørn Berg', 'Bjørnen'],
      ['uC', 'Camilla Carlsen', null],
      ['uD', 'David Dahl', null],
    ]),
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('NassauPodium', () => {
  it('rendrer sweep-feiring, podium-trinn med unit-badges, og rest-list med 4.-plass', () => {
    window.sessionStorage.clear();
    render(<NassauPodium {...defaultProps()} />);

    // Sweep-celebration vises med kompis-ethos-tekst.
    const sweep = screen.getByTestId('nassau-sweep');
    expect(sweep.textContent).toContain('Hele tavla!');
    expect(sweep.textContent).toContain('Alice Andersen');
    expect(sweep.textContent).toMatch(/Tok alle tre seksjoner/i);

    // Podium-trinnene.
    const podium = screen.getByTestId('nassau-podium');
    const first = within(podium).getByTestId('podium-rank-1');
    const second = within(podium).getByTestId('podium-rank-2');
    const third = within(podium).getByTestId('podium-rank-3');

    // 1.-plass: Alice, 3 units, alle tre unit-badges fylt.
    expect(first.textContent).toContain('Alice Andersen');
    expect(first.textContent).toContain('3');
    expect(first.textContent).toContain('seire');
    const firstBadges = within(first).getByTestId('nassau-unit-badges');
    expect(within(firstBadges).getByTestId('unit-badge-front9').dataset.won).toBe('true');
    expect(within(firstBadges).getByTestId('unit-badge-back9').dataset.won).toBe('true');
    expect(within(firstBadges).getByTestId('unit-badge-total18').dataset.won).toBe('true');

    // 2.-plass: Bjørn (Bjørnen), 0 units, alle badges tomme.
    expect(second.textContent).toContain('Bjørnen');
    expect(second.textContent).toContain('0');
    const secondBadges = within(second).getByTestId('nassau-unit-badges');
    expect(within(secondBadges).getByTestId('unit-badge-front9').dataset.won).toBe('false');
    expect(within(secondBadges).getByTestId('unit-badge-back9').dataset.won).toBe('false');
    expect(within(secondBadges).getByTestId('unit-badge-total18').dataset.won).toBe('false');

    // 3.-plass: Camilla.
    expect(third.textContent).toContain('Camilla Carlsen');

    // Rest-list: David som rank 4.
    const rest = screen.getByTestId('nassau-rest');
    expect(rest.textContent).toContain('David Dahl');
    expect(rest.textContent).toContain('Se hele rangeringen');
  });

  it('skjuler sweep-celebration når ingen har units=3', () => {
    const noSweep = makeSweepResult();
    noSweep.players[0] = makeUnitLine(
      'uA',
      1,
      2,
      { front9: true, back9: true, total18: false },
      70,
    );
    window.sessionStorage.clear();
    render(<NassauPodium {...defaultProps({ result: noSweep })} />);
    expect(screen.queryByTestId('nassau-sweep')).toBeNull();
    // Podium og badges er fortsatt synlige.
    expect(screen.getByTestId('nassau-podium')).toBeInTheDocument();
    const first = within(screen.getByTestId('nassau-podium')).getByTestId('podium-rank-1');
    const firstBadges = within(first).getByTestId('nassau-unit-badges');
    expect(within(firstBadges).getByTestId('unit-badge-front9').dataset.won).toBe('true');
    expect(within(firstBadges).getByTestId('unit-badge-total18').dataset.won).toBe('false');
  });
});
