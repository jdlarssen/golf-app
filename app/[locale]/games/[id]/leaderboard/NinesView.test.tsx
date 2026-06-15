import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  NinesView,
  type NinesPlayerInfo,
  type NinesViewProps,
} from './NinesView';
import type {
  NinesResult,
  NinesHoleRow,
  NinesPlayerLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, NinesPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function makeHole(overrides: Partial<NinesHoleRow>): NinesHoleRow {
  return {
    holeNumber: 1,
    par: 4,
    strokeIndex: 1,
    pending: false,
    perPlayer: [],
    pointsByPlayer: {},
    ...overrides,
  };
}

function makePlayerLine(
  userId: string,
  rank: number,
  totalPoints: number,
  holesScored: number,
  tiedWith: string[] = [],
): NinesPlayerLine {
  return {
    userId,
    totalPoints,
    holesScored,
    rank,
    tiedWith,
  };
}

function makeResult(): NinesResult {
  return {
    kind: 'nines',
    variant: 'nines',
    scoring: 'net',
    holes: [
      // Hull 1: u1 vinner (5 poeng), u2 andre (3), u3 sist (1)
      makeHole({
        holeNumber: 1,
        par: 4,
        strokeIndex: 1,
        pending: false,
        perPlayer: [
          { userId: 'u1', gross: 3, effectiveScore: 3, points: 5 },
          { userId: 'u2', gross: 4, effectiveScore: 4, points: 3 },
          { userId: 'u3', gross: 5, effectiveScore: 5, points: 1 },
        ],
        pointsByPlayer: { u1: 5, u2: 3, u3: 1 },
      }),
      // Hull 2: pending — ingen scorer
      makeHole({
        holeNumber: 2,
        par: 3,
        strokeIndex: 9,
        pending: true,
        perPlayer: [
          { userId: 'u1', gross: null, effectiveScore: null, points: 0 },
          { userId: 'u2', gross: null, effectiveScore: null, points: 0 },
          { userId: 'u3', gross: null, effectiveScore: null, points: 0 },
        ],
        pointsByPlayer: { u1: 0, u2: 0, u3: 0 },
      }),
    ],
    players: [
      makePlayerLine('u1', 1, 5, 1),
      makePlayerLine('u2', 2, 3, 1),
      makePlayerLine('u3', 3, 1, 1),
    ],
  };
}

function defaultProps(
  overrides: Partial<NinesViewProps> = {},
): NinesViewProps {
  return {
    gameId: 'g1',
    gameName: 'Sommer-Nines',
    result: makeResult(),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
    ]),
    scoreVisibility: 'live',
    gameStatus: 'active',
    holesPlayed: 18,
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('NinesView', () => {
  it('rendrer spiller-rader, delt-indikator, og skjuler tall i reveal-modus midt-runde', () => {
    // 1) Default (live, active) — full visning.
    const { unmount } = render(<NinesView {...defaultProps()} />);

    // Spiller-tabell: alle 3 spillere.
    const leaderboard = screen.getByTestId('nines-leaderboard');
    const playerRows = within(leaderboard).getAllByRole('listitem');
    expect(playerRows).toHaveLength(3);

    // Rad 0: u1 (Alice), rank 1.
    expect(playerRows[0].textContent).toContain('Alice Andersen');
    // u1 har 5 poeng.
    expect(playerRows[0].textContent).toContain('5');

    // Rad 1: u2 med kallenavn «Bjørnen».
    expect(playerRows[1].textContent).toContain('Bjørnen');

    // Rad 2: u3 (Camilla).
    expect(playerRows[2].textContent).toContain('Camilla Carlsen');

    // Per-hull-liste: begge hull rendret.
    const holeList = screen.getByTestId('nines-hole-list');
    expect(holeList.textContent).toContain('Hull 1');
    expect(holeList.textContent).toContain('Hull 2');

    // Hull 2 er pending — skal vise «Venter på score».
    const hole2 = within(holeList).getByTestId('nines-hole-row-2');
    expect(hole2.textContent).toContain('Venter på score');

    unmount();

    // 2) Delt-indikator vises når tiedWith er ikke-tom.
    const tiedResult: NinesResult = {
      ...makeResult(),
      players: [
        { ...makePlayerLine('u1', 1, 5, 1), tiedWith: ['u2'] },
        { ...makePlayerLine('u2', 1, 5, 1), tiedWith: ['u1'] },
        makePlayerLine('u3', 3, 1, 1),
      ],
    };
    const { unmount: unmount2 } = render(
      <NinesView {...defaultProps({ result: tiedResult })} />,
    );
    const lb = screen.getByTestId('nines-leaderboard');
    const rows = within(lb).getAllByRole('listitem');
    // Begge T1-rader skal inneholde «Delt 1. plass».
    expect(rows[0].textContent).toContain('Delt 1. plass');
    expect(rows[1].textContent).toContain('Delt 1. plass');
    // Rad 2 (u3, rank 3) skal ikke ha delt-indikator.
    expect(rows[2].textContent).not.toContain('Delt');

    unmount2();

    // 3) Reveal-modus midt-runde → skjuler tall, viser venterom-melding.
    render(
      <NinesView
        {...defaultProps({
          scoreVisibility: 'reveal',
          gameStatus: 'active',
        })}
      />,
    );
    const hidden = screen.getByTestId('nines-reveal-hidden');
    expect(hidden.textContent).toContain('Resultatene avsløres etter runden');
    // Leaderboard og hull-listen skal ikke være rendret.
    expect(screen.queryByTestId('nines-leaderboard')).toBeNull();
    expect(screen.queryByTestId('nines-hole-list')).toBeNull();
  });
});
