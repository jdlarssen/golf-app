import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WolfHolesView, type WolfHolesViewProps } from './WolfHolesView';
import type { WolfPlayerInfo } from '../WolfView';
import type {
  WolfResult,
  WolfHoleRow,
  WolfPlayerLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

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

function line(
  userId: string,
  teamNumber: number,
  totalPoints: number,
  rank: number,
): WolfPlayerLine {
  return {
    userId,
    teamNumber,
    totalPoints,
    wolfHolesPlayed: 0,
    blindWolfWins: 0,
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
      // Hull 1: Alice er Wolf, velger Bjørn som partner; Wolf-siden vinner.
      // Alice fikk et slag (brutto 5, netto 4) og er contributor på sin side.
      makeHole({
        holeNumber: 1,
        par: 4,
        strokeIndex: 1,
        wolfUserId: 'u1',
        choice: 'partner',
        partnerUserId: 'u2',
        stake: 1,
        outcome: 'wolf_side_wins',
        players: [
          { userId: 'u1', gross: 5, effectiveScore: 4, side: 'wolf', isContributor: true },
          { userId: 'u2', gross: 5, effectiveScore: 5, side: 'wolf', isContributor: false },
          { userId: 'u3', gross: 5, effectiveScore: 5, side: 'opp', isContributor: true },
          { userId: 'u4', gross: 6, effectiveScore: 6, side: 'opp', isContributor: false },
        ],
        pointsByPlayer: { u1: 2, u2: 2 },
      }),
      // Hull 2: Bjørn er Lone Wolf, innsats 2x (carry), Andre-siden vinner.
      makeHole({
        holeNumber: 2,
        par: 3,
        strokeIndex: 9,
        wolfUserId: 'u2',
        choice: 'lone',
        partnerUserId: null,
        stake: 2,
        outcome: 'opp_side_wins',
        players: [
          { userId: 'u2', gross: 4, effectiveScore: 4, side: 'wolf', isContributor: true },
          { userId: 'u1', gross: 3, effectiveScore: 3, side: 'opp', isContributor: true },
          { userId: 'u3', gross: 4, effectiveScore: 4, side: 'opp', isContributor: false },
          { userId: 'u4', gross: 4, effectiveScore: 4, side: 'opp', isContributor: false },
        ],
        pointsByPlayer: { u1: 4, u3: 4, u4: 4 },
      }),
    ],
    players: [
      line('u1', 1, 6, 1),
      line('u2', 2, 2, 2),
      line('u3', 3, 4, 3),
      line('u4', 4, 4, 4),
    ],
  };
}

function defaultProps(
  overrides: Partial<WolfHolesViewProps> = {},
): WolfHolesViewProps {
  const playersById: Map<string, WolfPlayerInfo> = new Map([
    ['u1', { name: 'Alice Andersen', nickname: null }],
    ['u2', { name: 'Bjørn Berg', nickname: 'Bjørnen' }],
    ['u3', { name: 'Camilla Carlsen', nickname: null }],
    ['u4', { name: 'David Dahl', nickname: null }],
  ]);
  return {
    gameId: 'g1',
    gameName: 'Ulve-runde',
    result: makeResult(),
    playersById,
    scoreVisibility: 'live',
    gameStatus: 'finished',
    ...overrides,
  };
}

describe('WolfHolesView', () => {
  // Fokus: WolfHolesView sitt bidrag OVER WolfView sin PER HULL — per-spiller
  // side + score + poeng + innsats. Choice/outcome-labelene er delte
  // (lib/wolf/holeLabels) og dekkes av WolfView.test, så vi re-asserter dem ikke.
  it('rendrer per-hull med per-spiller side, score og poeng', () => {
    render(<WolfHolesView {...defaultProps()} />);

    const list = screen.getByTestId('wolf-holes-list');
    // Direkte barn = hull-kortene (per-spiller-radene er nested <li>).
    expect(list.children).toHaveLength(2);

    // Hull 1: sidene + netto/brutto + poeng vises (det WolfView mangler).
    const card1 = screen.getByTestId('wolf-holes-card-1');
    expect(card1.textContent).toContain('Wolf-side');
    expect(card1.textContent).toContain('Andre');
    expect(card1.textContent).toContain('brutto 5'); // Alice fikk et slag → netto 4
    expect(card1.textContent).toContain('+2'); // poeng til Wolf-siden

    // Hull 2: innsats-carry vises.
    expect(screen.getByTestId('wolf-holes-card-2').textContent).toContain('2x');
  });
});
