import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkinsHolesView, type SkinsHolesViewProps } from './SkinsHolesView';
import type { SkinsPlayerInfo } from '../SkinsView';
import type { SkinsResult, SkinsHoleRow } from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

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

function makeResult(): SkinsResult {
  return {
    kind: 'skins',
    scoring: 'net',
    holes: [
      // Hull 1: delt — ruller videre. Begge low (isWinner), ingen vinner.
      makeHole({
        holeNumber: 1,
        par: 4,
        strokeIndex: 1,
        carriedIn: 0,
        atStake: 1,
        outcome: 'carryover',
        winnerUserId: null,
        skinsAwarded: 0,
        perPlayer: [
          { userId: 'u1', gross: 4, effectiveScore: 4, isWinner: true },
          { userId: 'u2', gross: 4, effectiveScore: 4, isWinner: true },
        ],
      }),
      // Hull 2: u1 vinner 2 skins (1 rullet inn). u1 fikk et slag → brutto≠netto.
      makeHole({
        holeNumber: 2,
        par: 3,
        strokeIndex: 9,
        carriedIn: 1,
        atStake: 2,
        outcome: 'won',
        winnerUserId: 'u1',
        skinsAwarded: 2,
        perPlayer: [
          { userId: 'u1', gross: 4, effectiveScore: 3, isWinner: true },
          { userId: 'u2', gross: 4, effectiveScore: 4, isWinner: false },
        ],
      }),
    ],
    players: [
      { userId: 'u1', totalSkins: 2, holesWon: 1, rank: 1, tiedWith: [] },
      { userId: 'u2', totalSkins: 0, holesWon: 0, rank: 2, tiedWith: [] },
    ],
    carriedPot: 0,
  };
}

function defaultProps(
  overrides: Partial<SkinsHolesViewProps> = {},
): SkinsHolesViewProps {
  const playersById: Map<string, SkinsPlayerInfo> = new Map([
    ['u1', { name: 'Alice Andersen', nickname: null }],
    ['u2', { name: 'Bjørn Berg', nickname: 'Bjørnen' }],
  ]);
  return {
    gameId: 'g1',
    gameName: 'Sommer-Skins',
    result: makeResult(),
    playersById,
    scoreVisibility: 'live',
    gameStatus: 'finished',
    ...overrides,
  };
}

describe('SkinsHolesView', () => {
  it('rendrer per-hull med per-spiller-scorer, vinner-highlight og carryover-kjede', () => {
    render(<SkinsHolesView {...defaultProps()} />);

    const list = screen.getByTestId('skins-holes-list');
    // Direkte barn = hull-kortene (per-spiller-radene er nested <li>).
    expect(list.children).toHaveLength(2);

    // Hull 1: delt → dratt videre, begge spillere med score 4.
    const card1 = screen.getByTestId('skins-holes-card-1');
    expect(card1.textContent).toContain('Hull 1');
    expect(card1.textContent).toContain('Delt → dratt videre');
    expect(card1.textContent).toContain('Alice Andersen');
    expect(card1.textContent).toContain('Bjørnen');

    // Hull 2: u1 vinner 2 skins, carriedIn=1 vises, brutto≠netto vises.
    const card2 = screen.getByTestId('skins-holes-card-2');
    expect(card2.textContent).toContain('+2 skins');
    expect(card2.textContent).toContain('1 skin rullet inn');
    // Netto 3 vist prominent, brutto 4 diskret (u1 fikk et slag).
    expect(card2.textContent).toContain('brutto 4');
    expect(card2.textContent).toContain('3');

    // Ingen hengende pott → boksen vises ikke.
    expect(screen.queryByTestId('skins-holes-unwon')).toBeNull();
  });
});
