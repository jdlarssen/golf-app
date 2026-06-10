import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  WolfView,
  type WolfPlayerInfo,
  type WolfViewProps,
} from './WolfView';
import type {
  WolfResult,
  WolfHoleRow,
  WolfPlayerLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, WolfPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function makeHole(overrides: Partial<WolfHoleRow>): WolfHoleRow {
  return {
    holeNumber: 1,
    par: 4,
    strokeIndex: 1,
    wolfUserId: 'u1',
    choice: null,
    partnerUserId: null,
    stake: 1,
    outcome: 'pending',
    players: [],
    pointsByPlayer: {},
    ...overrides,
  };
}

function makePlayerLine(
  userId: string,
  rank: number,
  totalPoints: number,
  wolfHolesPlayed: number,
  blindWolfWins = 0,
): WolfPlayerLine {
  return {
    userId,
    teamNumber: rank,
    totalPoints,
    wolfHolesPlayed,
    blindWolfWins,
    rank,
    tiedWith: [],
  };
}

function makeResult(): WolfResult {
  return {
    kind: 'wolf',
    scoring: 'net',
    rotation: 'random_with_trailing',
    holes: [
      // Hull 1: partner-win
      makeHole({
        holeNumber: 1,
        wolfUserId: 'u1',
        choice: 'partner',
        partnerUserId: 'u2',
        stake: 1,
        outcome: 'wolf_side_wins',
        pointsByPlayer: { u1: 2, u2: 2 },
      }),
      // Hull 2: lone-win
      makeHole({
        holeNumber: 2,
        wolfUserId: 'u2',
        choice: 'lone',
        stake: 1,
        outcome: 'wolf_side_wins',
        pointsByPlayer: { u2: 4 },
      }),
      // Hull 3: tied — stake bygges opp
      makeHole({
        holeNumber: 3,
        wolfUserId: 'u3',
        choice: 'partner',
        partnerUserId: 'u4',
        stake: 1,
        outcome: 'tied',
        pointsByPlayer: {},
      }),
      // Hull 4: blind-win med stake 2
      makeHole({
        holeNumber: 4,
        wolfUserId: 'u4',
        choice: 'blind',
        stake: 2,
        outcome: 'wolf_side_wins',
        pointsByPlayer: { u4: 12 },
      }),
      // Hull 5: pending (Wolf har ikke valgt)
      makeHole({
        holeNumber: 5,
        wolfUserId: 'u1',
        choice: null,
        stake: 1,
        outcome: 'pending',
        pointsByPlayer: {},
      }),
    ],
    players: [
      makePlayerLine('u4', 1, 12, 1, 1),
      makePlayerLine('u2', 2, 6, 1, 0),
      makePlayerLine('u1', 3, 2, 2, 0),
      makePlayerLine('u3', 4, 0, 1, 0),
    ],
  };
}

function defaultProps(
  overrides: Partial<WolfViewProps> = {},
): WolfViewProps {
  return {
    gameId: 'g1',
    gameName: 'Sommer-Wolf',
    result: makeResult(),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
    ]),
    scoreVisibility: 'live',
    gameStatus: 'finished',
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('WolfView', () => {
  it('rendrer hull-numre, spillere sortert på rank, og skjuler tall i reveal-modus midt-runde', () => {
    // 1) Default (live, finished) — full visning.
    const { unmount } = render(<WolfView {...defaultProps()} />);

    // Player-totals: alle 4 spillere, sortert på rank (DESC totalPoints).
    const leaderboard = screen.getByTestId('wolf-leaderboard');
    const playerRows = within(leaderboard).getAllByRole('listitem');
    expect(playerRows).toHaveLength(4);
    expect(playerRows[0].textContent).toContain('David Dahl');
    expect(playerRows[0].textContent).toContain('12');
    expect(playerRows[1].textContent).toContain('Bjørnen');
    expect(playerRows[1].textContent).toContain('6');
    expect(playerRows[2].textContent).toContain('Alice Andersen');
    expect(playerRows[2].textContent).toContain('2');
    expect(playerRows[3].textContent).toContain('Camilla Carlsen');

    // Per-hull-liste: alle 5 hull rendret med riktig hull-nummer.
    const holeList = screen.getByTestId('wolf-hole-list');
    expect(holeList.textContent).toContain('Hull 1');
    expect(holeList.textContent).toContain('Hull 5');

    // Choice-labels (rene tekster, ingen emojier). formatRevealName legger
    // kallenavn i guillemeter inne i fullt navn («Bjørn "Bjørnen" Berg»), så
    // vi matcher på kallenavn-strengen i partner-konteksten.
    expect(holeList.textContent).toMatch(/Partner: Bjørn.*Bjørnen/);
    expect(holeList.textContent).toContain('Lone Wolf');
    expect(holeList.textContent).toContain('Blind Wolf');
    expect(holeList.textContent).toContain('Venter');

    // Outcome-labels.
    expect(holeList.textContent).toContain('Wolf vant');
    expect(holeList.textContent).toContain('Lik');

    // Stake-badge på hull 4 (2x).
    const hole4 = within(holeList).getByTestId('wolf-hole-row-4');
    expect(hole4.textContent).toContain('2x');

    // Hull 1: ingen stake-badge (stake = 1).
    const hole1 = within(holeList).getByTestId('wolf-hole-row-1');
    expect(hole1.textContent).not.toMatch(/^1x/);

    // Poeng-chips kun for spillere som tjente poeng (hull 4 → kun u4 +12).
    expect(hole4.textContent).toContain('+12');
    // Hull 3 (tied) har ingen poeng — ingen +N-chips.
    const hole3 = within(holeList).getByTestId('wolf-hole-row-3');
    expect(hole3.textContent).not.toMatch(/\+\d/);

    // Blind Wolf-pott-tekst på vinneren (u4 har blindWolfWins=1).
    expect(playerRows[0].textContent).toContain('Blind Wolf-pott');

    unmount();

    // 2) Reveal-modus midt-runde → skjuler tall, viser venterom-melding.
    render(
      <WolfView
        {...defaultProps({
          scoreVisibility: 'reveal',
          gameStatus: 'active',
        })}
      />,
    );
    const hidden = screen.getByTestId('wolf-reveal-hidden');
    expect(hidden.textContent).toContain('Resultatene avsløres etter runden');
    // Leaderboard og hull-listen skal ikke være rendret.
    expect(screen.queryByTestId('wolf-leaderboard')).toBeNull();
    expect(screen.queryByTestId('wolf-hole-list')).toBeNull();
  });
});
