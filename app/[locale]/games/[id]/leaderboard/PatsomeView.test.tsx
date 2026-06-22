import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PatsomeView, type PatsomeViewProps } from './PatsomeView';
import type { PatsomePlayerInfo } from './PatsomeView';
import type {
  PatsomeResult,
  PatsomeTeamLine,
  PatsomeHoleRow,
  PatsomeSegmentSubtotal,
} from '@/lib/scoring/modes/types';

// SmartLink calls useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeSegmentSubtotal(
  segment: 'fourball' | 'greensome' | 'foursomes',
  points: number,
  holesPlayed = 6,
): PatsomeSegmentSubtotal {
  return { segment, points, holesPlayed };
}

function makeHole(
  holeNumber: number,
  segment: 'fourball' | 'greensome' | 'foursomes',
  teamPoints = 2,
): PatsomeHoleRow {
  return {
    holeNumber,
    par: 4,
    strokeIndex: holeNumber,
    segment,
    players: [],
    contributorIds: [],
    teamGross: segment === 'fourball' ? null : 4,
    teamExtraStrokes: 0,
    teamNetStrokes: segment === 'fourball' ? null : 4,
    teamPoints,
  };
}

function makeTeamLine(args: {
  teamNumber: number;
  playerIds: string[];
  totalPoints: number;
  rank: number;
  fourballPoints?: number;
  greensomePoints?: number;
  foursomesPoints?: number;
  tiedWith?: number[];
}): PatsomeTeamLine {
  const fp = args.fourballPoints ?? 14;
  const gp = args.greensomePoints ?? 11;
  const fsp = args.foursomesPoints ?? 9;
  const holes: PatsomeHoleRow[] = [
    ...Array.from({ length: 6 }, (_, i) =>
      makeHole(i + 1, 'fourball', Math.floor(fp / 6)),
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      makeHole(i + 7, 'greensome', Math.floor(gp / 6)),
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      makeHole(i + 13, 'foursomes', Math.floor(fsp / 6)),
    ),
  ];
  return {
    teamNumber: args.teamNumber,
    playerIds: args.playerIds,
    captainUserId: args.playerIds[0] ?? 'u1',
    holes,
    segments: {
      fourball: makeSegmentSubtotal('fourball', fp),
      greensome: makeSegmentSubtotal('greensome', gp),
      foursomes: makeSegmentSubtotal('foursomes', fsp),
    },
    totalPoints: args.totalPoints,
    rank: args.rank,
    tiedWith: args.tiedWith ?? [],
  };
}

function makeResult(teams: PatsomeTeamLine[]): PatsomeResult {
  return { kind: 'patsome', scoring: 'net', teams };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, PatsomePlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function defaultProps(
  overrides: Partial<PatsomeViewProps> = {},
): PatsomeViewProps {
  return {
    gameId: 'g1',
    gameName: 'Sommerturnering',
    result: makeResult([
      makeTeamLine({
        teamNumber: 1,
        playerIds: ['u1', 'u2'],
        totalPoints: 34,
        rank: 1,
        fourballPoints: 14,
        greensomePoints: 11,
        foursomesPoints: 9,
      }),
      makeTeamLine({
        teamNumber: 2,
        playerIds: ['u3', 'u4'],
        totalPoints: 28,
        rank: 2,
        fourballPoints: 12,
        greensomePoints: 9,
        foursomesPoints: 7,
      }),
    ]),
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

describe('PatsomeView', () => {
  it('rendrer ett rad-element per lag', () => {
    render(<PatsomeView {...defaultProps()} />);
    const list = screen.getByTestId('patsome-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
  });

  it('viser «Lag N»-label per rad', () => {
    render(<PatsomeView {...defaultProps()} />);
    const list = screen.getByTestId('patsome-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Lag 1');
    expect(rows[1].textContent).toContain('Lag 2');
  });

  it('viser de tre segment-delsummene per lag', () => {
    render(<PatsomeView {...defaultProps()} />);
    // Lag 1: 4BBB 14, Greensome 11, Foursomes 9
    const seg1 = screen.getByTestId('patsome-segments-1');
    expect(seg1.textContent).toContain('4BBB');
    expect(seg1.textContent).toContain('14');
    expect(seg1.textContent).toContain('Greensome');
    expect(seg1.textContent).toContain('11');
    expect(seg1.textContent).toContain('Foursomes');
    expect(seg1.textContent).toContain('9');
  });

  it('total-poenget har tabular-nums for tabell-justering', () => {
    render(<PatsomeView {...defaultProps()} />);
    const totalSpan = screen.getByTestId('patsome-total-1');
    expect(totalSpan.className).toMatch(/tabular-nums/);
  });

  it('viser begge partnernes fornavn', () => {
    render(<PatsomeView {...defaultProps()} />);
    const list = screen.getByTestId('patsome-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Alice');
    expect(rows[0].textContent).toContain('Bjørn');
    expect(rows[1].textContent).toContain('Camilla');
    expect(rows[1].textContent).toContain('David');
  });

  it('viser «Ingen lag å vise»-fallback når result.teams er tomt', () => {
    render(<PatsomeView {...defaultProps({ result: makeResult([]) })} />);
    expect(screen.getByText(/Ingen lag å vise/i)).toBeInTheDocument();
  });

  it('skjuler totaler og leaderboard i reveal-modus (aktiv runde)', () => {
    render(
      <PatsomeView
        {...defaultProps({
          scoreVisibility: 'reveal',
          gameStatus: 'active',
        })}
      />,
    );
    expect(screen.getByTestId('patsome-reveal-hidden')).toBeInTheDocument();
    expect(screen.queryByTestId('patsome-leaderboard')).toBeNull();
    expect(
      screen.getByText(/Resultatene avsløres etter runden/i),
    ).toBeInTheDocument();
  });

  it('viser full leaderboard i reveal-modus når spillet er ferdig', () => {
    render(
      <PatsomeView
        {...defaultProps({
          scoreVisibility: 'reveal',
          gameStatus: 'finished',
        })}
      />,
    );
    expect(screen.queryByTestId('patsome-reveal-hidden')).toBeNull();
    expect(screen.getByTestId('patsome-leaderboard')).toBeInTheDocument();
  });

  it('viser tied-with-melding når tiedWith har innhold', () => {
    render(
      <PatsomeView
        {...defaultProps({
          result: makeResult([
            makeTeamLine({
              teamNumber: 1,
              playerIds: ['u1', 'u2'],
              totalPoints: 30,
              rank: 1,
              tiedWith: [2],
            }),
            makeTeamLine({
              teamNumber: 2,
              playerIds: ['u3', 'u4'],
              totalPoints: 30,
              rank: 1,
              tiedWith: [1],
            }),
          ]),
        })}
      />,
    );
    const list = screen.getByTestId('patsome-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Delt 1. plass med Lag 2');
    expect(rows[1].textContent).toContain('Delt 1. plass med Lag 1');
  });

  it('viser per-hull-rutenett med hull-rader', () => {
    render(<PatsomeView {...defaultProps()} />);
    const grid = screen.getByTestId('patsome-hole-grid');
    expect(grid).toBeInTheDocument();
    // Hull 1 og 7 og 13 skal finnes
    expect(screen.getByTestId('patsome-hole-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('patsome-hole-row-7')).toBeInTheDocument();
    expect(screen.getByTestId('patsome-hole-row-13')).toBeInTheDocument();
  });

  it('rendrer Medallion (svg) for topp 3, ren rank-disc for 4+', () => {
    const result = makeResult([
      makeTeamLine({ teamNumber: 1, playerIds: ['u1', 'u2'], totalPoints: 40, rank: 1 }),
      makeTeamLine({ teamNumber: 2, playerIds: ['u3', 'u4'], totalPoints: 35, rank: 2 }),
      makeTeamLine({ teamNumber: 3, playerIds: ['u5', 'u6'], totalPoints: 28, rank: 3 }),
      makeTeamLine({ teamNumber: 4, playerIds: ['u7', 'u8'], totalPoints: 22, rank: 4 }),
    ]);
    render(
      <PatsomeView
        {...defaultProps({
          result,
          playersById: makePlayers([
            ['u1', 'A A', null], ['u2', 'B B', null],
            ['u3', 'C C', null], ['u4', 'D D', null],
            ['u5', 'E E', null], ['u6', 'F F', null],
            ['u7', 'G G', null], ['u8', 'H H', null],
          ]),
        })}
      />,
    );
    const list = screen.getByTestId('patsome-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].querySelector('svg')).not.toBeNull();
    expect(rows[1].querySelector('svg')).not.toBeNull();
    expect(rows[2].querySelector('svg')).not.toBeNull();
    expect(rows[3].querySelector('svg')).toBeNull();
  });
});
