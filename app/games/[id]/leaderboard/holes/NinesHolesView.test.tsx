import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NinesHolesView, type NinesHolesViewProps } from './NinesHolesView';
import type { NinesPlayerInfo } from '../NinesView';
import type {
  NinesResult,
  NinesHoleRow,
  NinesPlayerLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

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

function line(
  userId: string,
  rank: number,
  totalPoints: number,
): NinesPlayerLine {
  return { userId, totalPoints, holesScored: 2, rank, tiedWith: [] };
}

function makeResult(): NinesResult {
  return {
    kind: 'nines',
    variant: 'nines',
    scoring: 'net',
    holes: [
      // Hull 1 (normalt): Alice vinner hullet (netto 3, fikk et slag → brutto 4)
      // = +5, Bjørn netto 4 = +3, Camilla netto 5 = +1.
      makeHole({
        holeNumber: 1,
        par: 4,
        strokeIndex: 1,
        pending: false,
        perPlayer: [
          { userId: 'u1', gross: 4, effectiveScore: 3, points: 5 },
          { userId: 'u2', gross: 4, effectiveScore: 4, points: 3 },
          { userId: 'u3', gross: 5, effectiveScore: 5, points: 1 },
        ],
        pointsByPlayer: { u1: 5, u2: 3, u3: 1 },
      }),
      // Hull 2 (tie lavest): Bjørn + Camilla delt lavest (netto 4) → (5+3)/2 = 4
      // hver (delt plassering 1). Alice netto 5 → plassering 3, +1.
      makeHole({
        holeNumber: 2,
        par: 3,
        strokeIndex: 9,
        pending: false,
        perPlayer: [
          { userId: 'u1', gross: 5, effectiveScore: 5, points: 1 },
          { userId: 'u2', gross: 4, effectiveScore: 4, points: 4 },
          { userId: 'u3', gross: 4, effectiveScore: 4, points: 4 },
        ],
        pointsByPlayer: { u1: 1, u2: 4, u3: 4 },
      }),
      // Hull 3 (pending): kun Alice har tastet, ingen poeng deles ut.
      makeHole({
        holeNumber: 3,
        par: 4,
        strokeIndex: 5,
        pending: true,
        perPlayer: [
          { userId: 'u1', gross: 4, effectiveScore: 4, points: 0 },
          { userId: 'u2', gross: null, effectiveScore: null, points: 0 },
          { userId: 'u3', gross: null, effectiveScore: null, points: 0 },
        ],
        pointsByPlayer: { u1: 0, u2: 0, u3: 0 },
      }),
    ],
    players: [line('u2', 1, 7), line('u1', 2, 6), line('u3', 3, 5)],
  };
}

function defaultProps(
  overrides: Partial<NinesHolesViewProps> = {},
): NinesHolesViewProps {
  const playersById: Map<string, NinesPlayerInfo> = new Map([
    ['u1', { name: 'Alice Andersen', nickname: null }],
    ['u2', { name: 'Bjørn Berg', nickname: null }],
    ['u3', { name: 'Camilla Carlsen', nickname: null }],
  ]);
  return {
    gameId: 'g1',
    gameName: 'Sommer-Nines',
    result: makeResult(),
    playersById,
    scoreVisibility: 'live',
    gameStatus: 'finished',
    ...overrides,
  };
}

describe('NinesHolesView', () => {
  // Fokus: NinesHolesView sitt bidrag OVER NinesView sin PER HULL — pott,
  // plassering-først-rangering, per-spiller brutto/netto-score og poeng.
  // NinesView.test dekker leaderboard-tabellen og kompakt poeng-rutenett, så
  // vi re-asserter ikke de tallene her.
  it('rendrer per hull pott, plassering, score og poeng', () => {
    render(<NinesHolesView {...defaultProps()} />);

    const list = screen.getByTestId('nines-holes-list');
    // Direkte barn = hull-kortene (per-spiller-radene er nested <li>).
    expect(list.children).toHaveLength(3);

    // Hull 1: pott-badge, vinnerens slag (brutto≠netto) og poeng vises.
    const card1 = screen.getByTestId('nines-holes-card-1');
    expect(card1.textContent).toContain('9 poeng');
    expect(card1.textContent).toContain('brutto 4'); // Alice fikk et slag → netto 3
    expect(card1.textContent).toContain('+5'); // mest poeng til lavest score

    // Hull 2 (tie): delte poeng vises, og plassering-først-rekkefølgen flytter
    // den høyeste scoren (Alice, plassering 3) til bunnen av kortet.
    const card2 = screen.getByTestId('nines-holes-card-2');
    expect(card2.textContent).toContain('+4'); // (5+3)/2 delt mellom de to lavest
    const card2Rows = within(card2).getAllByRole('listitem');
    expect(card2Rows[2].textContent).toContain('Alice Andersen');

    // Hull 3 (pending): ingen pott, venter-status, manglende score som «–».
    const card3 = screen.getByTestId('nines-holes-card-3');
    expect(card3.textContent).toContain('Venter på score');
    expect(card3.textContent).not.toContain('9 poeng');
    expect(card3.textContent).toContain('–');
  });
});
