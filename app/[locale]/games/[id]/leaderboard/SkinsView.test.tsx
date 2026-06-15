import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  SkinsView,
  type SkinsPlayerInfo,
  type SkinsViewProps,
} from './SkinsView';
import type {
  SkinsResult,
  SkinsHoleRow,
  SkinsPlayerLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

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
  it('rendrer spiller-totals, carryover-rad, og skjuler tall i reveal-modus midt-runde', () => {
    // 1) Default (live, finished) — full visning.
    const { unmount } = render(<SkinsView {...defaultProps()} />);

    // Spiller-totals: alle 3 spillere, sortert på rank (DESC totalSkins).
    const leaderboard = screen.getByTestId('skins-leaderboard');
    const playerRows = within(leaderboard).getAllByRole('listitem');
    expect(playerRows).toHaveLength(3);
    expect(playerRows[0].textContent).toContain('Alice Andersen');
    // u1 har 2 skins — verdi vises prominently.
    expect(playerRows[0].textContent).toContain('2');
    // u2 med kallenavn
    expect(playerRows[1].textContent).toContain('Bjørnen');
    expect(playerRows[2].textContent).toContain('Camilla Carlsen');

    // Per-hull-liste: alle 3 hull rendret.
    const holeList = screen.getByTestId('skins-hole-list');
    expect(holeList.textContent).toContain('Hull 1');
    expect(holeList.textContent).toContain('Hull 2');
    expect(holeList.textContent).toContain('Hull 3');

    // Hull 1: carryover — viser «Delt» + «ruller videre».
    const hole1 = within(holeList).getByTestId('skins-hole-row-1');
    expect(hole1.textContent).toContain('Delt');
    expect(hole1.textContent).toContain('ruller videre');

    // Hull 2: vunnet av Alice med 2 skins, carriedIn=1 vises.
    const hole2 = within(holeList).getByTestId('skins-hole-row-2');
    expect(hole2.textContent).toContain('Vunnet');
    expect(hole2.textContent).toContain('Alice Andersen');
    expect(hole2.textContent).toContain('+2');
    // carriedIn=1 → «1 skin rullet inn»
    expect(hole2.textContent).toContain('1 skin rullet inn');

    // Hull 3: pending.
    const hole3 = within(holeList).getByTestId('skins-hole-row-3');
    expect(hole3.textContent).toContain('Venter på score');

    // Ingen uvunne skins (carriedPot=0) — boksen skal ikke vises.
    expect(screen.queryByTestId('skins-unwon')).toBeNull();

    unmount();

    // 2) Uvunne skins vises når spillet er ferdig og carriedPot > 0 — inkludert
    //    tidlig-avsluttet spill med gap etter et delt hull (#303). Mock-en har
    //    et trailing pending hull (hull 3) men carriedPot fra siste delte spilte
    //    hull skal likevel rapporteres som uvunnet når status='finished'.
    const resultWithUnwon: SkinsResult = {
      ...makeResult(),
      carriedPot: 3,
    };
    const { unmount: unmount2 } = render(
      <SkinsView {...defaultProps({ result: resultWithUnwon, gameStatus: 'finished' })} />,
    );
    const unwonBox = screen.getByTestId('skins-unwon');
    expect(unwonBox.textContent).toContain('3');
    expect(unwonBox.textContent).toContain('ikke vunnet');
    expect(unwonBox.textContent).toContain('Siste spilte hull ble delt');
    unmount2();

    // 2b) Samme hengende pott under AKTIVT spill → banneret skal IKKE vises
    //     (potten er fortsatt i spill, synlig via pending-hullets carriedIn).
    const { unmount: unmount2b } = render(
      <SkinsView {...defaultProps({ result: resultWithUnwon, gameStatus: 'active' })} />,
    );
    expect(screen.queryByTestId('skins-unwon')).toBeNull();
    unmount2b();

    // 3) Reveal-modus midt-runde → skjuler tall, viser venterom-melding.
    render(
      <SkinsView
        {...defaultProps({
          scoreVisibility: 'reveal',
          gameStatus: 'active',
        })}
      />,
    );
    const hidden = screen.getByTestId('skins-reveal-hidden');
    expect(hidden.textContent).toContain('Resultatene avsløres etter runden');
    // Leaderboard og hull-listen skal ikke være rendret.
    expect(screen.queryByTestId('skins-leaderboard')).toBeNull();
    expect(screen.queryByTestId('skins-hole-list')).toBeNull();
  });
});
