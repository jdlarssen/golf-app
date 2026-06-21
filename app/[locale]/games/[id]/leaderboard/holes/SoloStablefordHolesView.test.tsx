import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  SoloStablefordHolesView,
  type SoloStablefordHolesViewProps,
} from './SoloStablefordHolesView';
import type { SoloStablefordPlayerInfo } from '../SoloStablefordView';
import type {
  StablefordSoloResult,
  StablefordSoloHoleRow,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function hole(
  holeNumber: number,
  u1: { gross: number | null; points: number },
  u2: { gross: number | null; points: number },
  bestUserIds: string[],
): StablefordSoloHoleRow {
  return {
    holeNumber,
    par: 4,
    strokeIndex: holeNumber,
    perPlayer: [
      { userId: 'u1', gross: u1.gross, points: u1.points, par: 4 },
      { userId: 'u2', gross: u2.gross, points: u2.points, par: 4 },
    ],
    bestUserIds,
  };
}

function makeResult(): StablefordSoloResult {
  return {
    kind: 'stableford',
    variant: 'solo',
    players: [
      { userId: 'u1', totalPoints: 5, holesPlayed: 4, rank: 1, tiedWith: [] },
      { userId: 'u2', totalPoints: 3, holesPlayed: 4, rank: 2, tiedWith: [] },
    ],
    holes: [
      hole(1, { gross: 3, points: 3 }, { gross: 5, points: 1 }, ['u1']), // u1 høyest
      hole(2, { gross: 4, points: 2 }, { gross: 4, points: 2 }, ['u1', 'u2']), // delt
      // Modifisert-stil negativt poeng på et bak-9-hull.
      hole(11, { gross: 6, points: -3 }, { gross: 4, points: 0 }, ['u2']),
    ],
  };
}

function defaultProps(
  overrides: Partial<SoloStablefordHolesViewProps> = {},
): SoloStablefordHolesViewProps {
  const playersById: Map<string, SoloStablefordPlayerInfo> = new Map([
    ['u1', { name: 'Jørgen Larsen', nickname: null }],
    ['u2', { name: 'Ola Olsen', nickname: null }],
  ]);
  return {
    gameId: 'g1',
    gameName: 'Stableford-runde',
    result: makeResult(),
    playersById,
    formatLabel: 'Modifisert Stableford',
    scoreVisibility: 'live',
    gameStatus: 'finished',
    ...overrides,
  };
}

describe('SoloStablefordHolesView', () => {
  // Fokus: det stableford-spesifikke — et per-spiller poeng-scorekort med
  // HØYEST poeng uthevet, negative poeng (modifisert) eksponert, IKKE et
  // best-ball «Lag N»-scorekort. SoloStablefordView (leaderboard) viser kun
  // totaler, så vi re-asserter ikke ranking-tallene.
  it('rendrer stillings-header + per-hull-poeng med høyest uthevet og negative poeng', () => {
    render(<SoloStablefordHolesView {...defaultProps()} />);

    // Stillings-header med begge spillere — per spiller, ikke «Lag N».
    const totals = screen.getByTestId('solo-stableford-holes-totals');
    expect(totals.textContent).toContain('Jørgen');
    expect(totals.textContent).toContain('Ola');
    expect(totals.textContent).not.toContain('Lag');

    const front = screen.getByTestId('solo-stableford-holes-front9');
    const back = screen.getByTestId('solo-stableford-holes-back9');

    // Hull 1: høyest poeng (u1) uthevet i champagne med ★.
    const card1 = within(front).getByTestId('solo-stableford-holes-card-1');
    expect(card1.textContent).toContain('★');
    expect(card1.querySelector('[class*="border-accent"]')).not.toBeNull();

    // Delt hull (2): ingen enkelt-vinner-utheving.
    const card2 = within(front).getByTestId('solo-stableford-holes-card-2');
    expect(card2.querySelector('[class*="border-accent"]')).toBeNull();

    // Hull 11: negativt modifisert-poeng (−3) vises med ekte minus.
    const card11 = within(back).getByTestId('solo-stableford-holes-card-11');
    expect(card11.textContent).toContain('−3');
  });
});
