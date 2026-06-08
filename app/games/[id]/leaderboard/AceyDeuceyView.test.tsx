import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  AceyDeuceyView,
  type AceyDeuceyPlayerInfo,
  type AceyDeuceyViewProps,
} from './AceyDeuceyView';
import type {
  AceyDeuceyResult,
  AceyDeuceyHoleRow,
  AceyDeuceyPlayerLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, AceyDeuceyPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function makeHole(overrides: Partial<AceyDeuceyHoleRow>): AceyDeuceyHoleRow {
  return {
    holeNumber: 1,
    par: 4,
    strokeIndex: 1,
    scored: false,
    aceUserId: null,
    deuceUserId: null,
    pointsByPlayer: {},
    perPlayer: [],
    ...overrides,
  };
}

function makePlayerLine(
  userId: string,
  rank: number,
  total: number,
  aces: number,
  deuces: number,
): AceyDeuceyPlayerLine {
  return {
    userId,
    total,
    aces,
    deuces,
    rank,
    tiedWith: [],
  };
}

function makeResult(): AceyDeuceyResult {
  return {
    kind: 'acey_deucey',
    scoring: 'net',
    holes: [
      // Hull 1: u1 er ace, u4 er deuce
      makeHole({
        holeNumber: 1,
        par: 4,
        strokeIndex: 1,
        scored: true,
        aceUserId: 'u1',
        deuceUserId: 'u4',
        pointsByPlayer: { u1: 3, u2: 0, u3: 0, u4: -3 },
      }),
      // Hull 2: venter (uferdig hull)
      makeHole({
        holeNumber: 2,
        par: 3,
        strokeIndex: 9,
        scored: false,
        aceUserId: null,
        deuceUserId: null,
        pointsByPlayer: { u1: 0, u2: 0, u3: 0, u4: 0 },
      }),
      // Hull 3: delt lavest (ingen ace), u4 er deuce — aceUserId=null, deuce=u2
      makeHole({
        holeNumber: 3,
        par: 5,
        strokeIndex: 5,
        scored: true,
        aceUserId: null,
        deuceUserId: 'u2',
        pointsByPlayer: { u1: 0, u2: -3, u3: 0, u4: 0 },
      }),
    ],
    players: [
      makePlayerLine('u1', 1, 3, 1, 0),
      makePlayerLine('u2', 2, -3, 0, 1),
      makePlayerLine('u3', 3, 0, 0, 0),
      makePlayerLine('u4', 4, -3, 0, 1),
    ],
  };
}

function defaultProps(
  overrides: Partial<AceyDeuceyViewProps> = {},
): AceyDeuceyViewProps {
  return {
    gameId: 'g1',
    gameName: 'Kompis-runden',
    result: makeResult(),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', 'DD'],
    ]),
    scoreVisibility: 'live',
    gameStatus: 'finished',
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('AceyDeuceyView', () => {
  it('rendrer spiller-totaler med fortegn, per-hull ace/deuce, Venter og Delt, og skjuler i reveal-modus', () => {
    // 1) Default (live, finished) — full visning.
    const { unmount } = render(<AceyDeuceyView {...defaultProps()} />);

    // Spiller-totaler: alle 4 spillere rendret.
    const leaderboard = screen.getByTestId('acey-deucey-leaderboard');
    const playerRows = within(leaderboard).getAllByRole('listitem');
    expect(playerRows).toHaveLength(4);

    // u1 med +3 i topp
    expect(playerRows[0].textContent).toContain('Alice Andersen');
    expect(playerRows[0].textContent).toContain('+3');

    // u2 med kallenavn og negativt tall
    expect(playerRows[1].textContent).toContain('Bjørnen');
    expect(playerRows[1].textContent).toContain('−3'); // U+2212 MINUS SIGN

    // u3 og u4 finnes
    expect(playerRows[2].textContent).toContain('Camilla Carlsen');
    expect(playerRows[3].textContent).toContain('DD');

    // Per-hull-liste: alle 3 hull rendret.
    const holeList = screen.getByTestId('acey-deucey-hole-list');
    expect(holeList.textContent).toContain('Hull 1');
    expect(holeList.textContent).toContain('Hull 2');
    expect(holeList.textContent).toContain('Hull 3');

    // Hull 1: scoret — ace Alice Andersen, deuce DD (u4 med nickname DD).
    const hole1 = within(holeList).getByTestId('acey-deucey-hole-row-1');
    expect(hole1.textContent).toContain('Alice Andersen');
    expect(hole1.textContent).toContain('DD');
    expect(hole1.textContent).not.toContain('Venter');

    // Hull 2: uferdig — viser «Venter».
    const hole2 = within(holeList).getByTestId('acey-deucey-hole-row-2');
    expect(hole2.textContent).toContain('Venter');

    // Hull 3: delt ace (null) → «Delt», deuce Bjørnen.
    const hole3 = within(holeList).getByTestId('acey-deucey-hole-row-3');
    expect(hole3.textContent).toContain('Delt');
    expect(hole3.textContent).toContain('Bjørnen');

    unmount();

    // 2) Reveal-modus midt-runde → skjuler tall, viser venterom-melding.
    render(
      <AceyDeuceyView
        {...defaultProps({
          scoreVisibility: 'reveal',
          gameStatus: 'active',
        })}
      />,
    );
    const hidden = screen.getByTestId('acey-deucey-reveal-hidden');
    expect(hidden.textContent).toContain('Resultatene avsløres etter runden');
    // Leaderboard og hull-listen skal ikke være rendret.
    expect(screen.queryByTestId('acey-deucey-leaderboard')).toBeNull();
    expect(screen.queryByTestId('acey-deucey-hole-list')).toBeNull();
  });
});
