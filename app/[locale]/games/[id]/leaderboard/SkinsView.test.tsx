import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  SkinsView,
  type SkinsPlayerInfo,
  type SkinsViewProps,
} from './SkinsView';
import { computeSettlement } from '@/lib/scoring/settlement';
import type {
  SkinsResult,
  SkinsHoleRow,
  SkinsPlayerLine,
} from '@/lib/scoring/modes/types';

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, SkinsPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function makeHole(overrides: Partial<SkinsHoleRow>): SkinsHoleRow {
  return {
    holeNumber: 1,
    par: 4,
    strokeIndex: 1,
    carriedIn: 0,
    atStake: 1,
    outcome: 'pending',
    winnerUserId: null,
    skinsAwarded: 0,
    perPlayer: [],
    ...overrides,
  };
}

function makePlayerLine(
  userId: string,
  rank: number,
  totalSkins: number,
  holesWon: number,
): SkinsPlayerLine {
  return {
    userId,
    totalSkins,
    holesWon,
    rank,
    tiedWith: [],
  };
}

function makeResult(): SkinsResult {
  return {
    kind: 'skins',
    scoring: 'net',
    holes: [
      // Hull 1: delt — ruller videre
      makeHole({
        holeNumber: 1,
        par: 4,
        strokeIndex: 1,
        carriedIn: 0,
        atStake: 1,
        outcome: 'carryover',
        winnerUserId: null,
        skinsAwarded: 0,
      }),
      // Hull 2: u1 vinner 2 skins (1 fra hull 1 + hull 2)
      makeHole({
        holeNumber: 2,
        par: 3,
        strokeIndex: 9,
        carriedIn: 1,
        atStake: 2,
        outcome: 'won',
        winnerUserId: 'u1',
        skinsAwarded: 2,
      }),
      // Hull 3: pending
      makeHole({
        holeNumber: 3,
        par: 5,
        strokeIndex: 5,
        carriedIn: 0,
        atStake: 1,
        outcome: 'pending',
        winnerUserId: null,
        skinsAwarded: 0,
      }),
    ],
    players: [
      makePlayerLine('u1', 1, 2, 1),
      makePlayerLine('u2', 2, 0, 0),
      makePlayerLine('u3', 3, 0, 0),
    ],
    carriedPot: 0,
  };
}

function defaultProps(
  overrides: Partial<SkinsViewProps> = {},
): SkinsViewProps {
  return {
    gameId: 'g1',
    gameName: 'Sommer-Skins',
    result: makeResult(),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
    ]),
    scoreVisibility: 'live',
    gameStatus: 'finished',
    holesPlayed: 18,
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('SkinsView', () => {
  // Type C (#2317): structure only — which parts the board shows in which
  // state. The pot and coin numbers are Type A in lib/leaderboard/skinsPot.test.ts.

  it('ferdig: tittel, mynter og stilling uten toppkort; uvunne skins bare når ferdig', () => {
    const { unmount } = render(<SkinsView {...defaultProps()} />);

    expect(screen.queryByTestId('skins-pot-hero')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();

    // «Hull for hull»: én mynt per hull.
    const coins = screen.getByTestId('skins-coins');
    expect(within(coins).getAllByRole('listitem')).toHaveLength(3);

    // «Stillingen» (h2) står over lista, én rad per spiller i rank-rekkefølge.
    const leaderboard = screen.getByTestId('skins-leaderboard');
    const heading = screen.getByRole('heading', { level: 2, name: 'Stillingen' });
    expect(
      heading.compareDocumentPosition(leaderboard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const playerRows = within(leaderboard).getAllByRole('listitem');
    expect(playerRows).toHaveLength(3);
    expect(playerRows[0].textContent).toContain('Alice Andersen');
    expect(playerRows[1].textContent).toContain('Bjørnen');

    expect(screen.queryByTestId('skins-unwon')).toBeNull();
    expect(screen.queryByTestId('skins-settlement-link')).toBeNull();
    unmount();

    // Hengende pott: uvunne skins når ferdig (#303), aldri under aktivt spill.
    const resultWithUnwon: SkinsResult = { ...makeResult(), carriedPot: 3 };
    const { unmount: unmount2 } = render(
      <SkinsView {...defaultProps({ result: resultWithUnwon })} />,
    );
    expect(screen.getByTestId('skins-unwon')).toBeTruthy();
    unmount2();
    render(<SkinsView {...defaultProps({ result: resultWithUnwon, gameStatus: 'active' })} />);
    expect(screen.queryByTestId('skins-unwon')).toBeNull();
  });

  it('live: toppkortet står over myntene, og hullet potten står på er markert', () => {
    render(<SkinsView {...defaultProps({ gameStatus: 'active' })} />);

    const hero = screen.getByTestId('skins-pot-hero');
    const coins = screen.getByTestId('skins-coins');
    expect(hero.compareDocumentPosition(coins) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Toppkortet bærer sidens h1 i stedet for «Leaderboard».
    expect(within(hero).getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const states = within(coins)
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('data-coin'));
    expect(states).toEqual(['carried', 'potWon', 'current']);
  });

  it('lenka til oppgjøret finnes bare med oppgjør, og peker på det', () => {
    const settlement = computeSettlement({
      units: [
        { userId: 'u1', units: 2 },
        { userId: 'u2', units: 0 },
        { userId: 'u3', units: 0 },
      ],
      krPerUnit: 10,
      unitLabel: 'skin',
    });
    const { container } = render(
      <SkinsView {...defaultProps({ gameStatus: 'active', settlement })} />,
    );
    const link = screen.getByTestId('skins-settlement-link');
    expect(link.getAttribute('href')).toBe('#oppgjoret');
    expect(container.querySelector('#oppgjoret')).not.toBeNull();
  });

  it('avsløring midt i runden: venterom uten mynter, pott eller stilling', () => {
    render(
      <SkinsView
        {...defaultProps({
          scoreVisibility: 'reveal',
          gameStatus: 'active',
        })}
      />,
    );
    expect(screen.getByTestId('skins-reveal-hidden')).toBeTruthy();
    expect(screen.queryByTestId('skins-pot-hero')).toBeNull();
    expect(screen.queryByTestId('skins-coins')).toBeNull();
    expect(screen.queryByTestId('skins-leaderboard')).toBeNull();
  });
});
