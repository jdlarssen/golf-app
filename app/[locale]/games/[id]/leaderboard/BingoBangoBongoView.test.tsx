import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  BingoBangoBongoView,
  type BingoBangoBongoPlayerInfo,
  type BingoBangoBongoViewProps,
} from './BingoBangoBongoView';
import type {
  BingoBangoBongoResult,
  BingoBangoBongoPlayerLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, BingoBangoBongoPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function makePlayerLine(
  userId: string,
  rank: number,
  bingos: number,
  bangos: number,
  bongos: number,
): BingoBangoBongoPlayerLine {
  return {
    userId,
    bingos,
    bangos,
    bongos,
    totalPoints: bingos + bangos + bongos,
    rank,
    tiedWith: [],
  };
}

function makeResult(): BingoBangoBongoResult {
  return {
    kind: 'bingo_bango_bongo',
    holes: [
      {
        holeNumber: 1,
        bingoUserId: 'u1',
        bangoUserId: 'u2',
        bongoUserId: 'u1',
        pointsByPlayer: { u1: 2, u2: 1 },
      },
      {
        holeNumber: 2,
        bingoUserId: 'u3',
        bangoUserId: 'u3',
        bongoUserId: 'u2',
        pointsByPlayer: { u3: 2, u2: 1 },
      },
      {
        holeNumber: 3,
        bingoUserId: null,
        bangoUserId: 'u1',
        bongoUserId: 'u3',
        pointsByPlayer: { u1: 1, u3: 1 },
      },
    ],
    players: [
      // u1: 2 bingos, 1 bango, 0 bongos = 3 points, rank 1
      makePlayerLine('u1', 1, 2, 1, 0),
      // u3: 1 bingo, 1 bango, 1 bongo = 3 points, rank 1 (tied)
      { ...makePlayerLine('u3', 1, 1, 1, 1), tiedWith: ['u1'] },
      // u2: 0 bingos, 1 bango, 1 bongo = 2 points, rank 3
      makePlayerLine('u2', 3, 0, 1, 1),
    ],
  };
}

function defaultProps(
  overrides: Partial<BingoBangoBongoViewProps> = {},
): BingoBangoBongoViewProps {
  return {
    gameId: 'g1',
    gameName: 'Kompis-BBB',
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

describe('BingoBangoBongoView', () => {
  it('viser per-spiller-rader sortert på rank med riktige bingo/bango/bongo-tall og sum', () => {
    render(<BingoBangoBongoView {...defaultProps()} />);

    const leaderboard = screen.getByTestId('bbb-leaderboard');
    const rows = within(leaderboard).getAllByRole('listitem');

    // 3 spillere — 3 rader.
    expect(rows).toHaveLength(3);

    // Rad 0: u1 (Alice), rank 1, totalPoints=3.
    expect(rows[0].textContent).toContain('Alice Andersen');
    expect(rows[0].textContent).toContain('3'); // totalPoints

    // Rad 1: u3 (Camilla), rank 1 (delt), totalPoints=3.
    expect(rows[1].textContent).toContain('Camilla Carlsen');
    expect(rows[1].textContent).toContain('3');

    // Rad 2: u2 (Bjørnen), rank 3, totalPoints=2.
    expect(rows[2].textContent).toContain('Bjørnen');
    expect(rows[2].textContent).toContain('2');

    // Leader-rad skal ha champagne-accent-styling (border-accent).
    expect(rows[0].innerHTML).toContain('border-accent');
    // Ikke-leder-rad skal ikke ha champion-accent.
    expect(rows[2].innerHTML).not.toContain('border-accent');
  });

  it('skjuler totaler og viser venterom-melding i reveal-modus midt-runde', () => {
    render(
      <BingoBangoBongoView
        {...defaultProps({ scoreVisibility: 'reveal', gameStatus: 'active' })}
      />,
    );

    const hidden = screen.getByTestId('bbb-reveal-hidden');
    expect(hidden.textContent).toContain('Resultatene avsløres etter runden');
    // Leaderboard-listen skal ikke være rendret.
    expect(screen.queryByTestId('bbb-leaderboard')).toBeNull();
  });

  it('viser full leaderboard i reveal-modus når spillet er finished', () => {
    render(
      <BingoBangoBongoView
        {...defaultProps({ scoreVisibility: 'reveal', gameStatus: 'finished' })}
      />,
    );

    // Leaderboard vises når finished, uavhengig av scoreVisibility.
    const leaderboard = screen.getByTestId('bbb-leaderboard');
    const rows = within(leaderboard).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // Venterom-meldingen skal IKKE vises.
    expect(screen.queryByTestId('bbb-reveal-hidden')).toBeNull();
  });
});
