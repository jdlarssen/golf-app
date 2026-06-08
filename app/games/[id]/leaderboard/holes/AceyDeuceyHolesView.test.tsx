import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  AceyDeuceyHolesView,
  type AceyDeuceyHolesViewProps,
} from './AceyDeuceyHolesView';
import type { AceyDeuceyPlayerInfo } from '../AceyDeuceyView';
import type {
  AceyDeuceyResult,
  AceyDeuceyHoleRow,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

type Cell = AceyDeuceyHoleRow['perPlayer'][number];

function cell(
  userId: string,
  gross: number | null,
  effectiveScore: number | null,
  points: number,
): Cell {
  return { userId, gross, effectiveScore, points };
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

function makeResult(): AceyDeuceyResult {
  return {
    kind: 'acey_deucey',
    scoring: 'net',
    holes: [
      // Hull 1 (normalt): Alice ace (netto 3, fikk et slag → brutto 4) +3,
      // Bjørn/Camilla midt (netto 4) 0, David deuce (netto 6) −3.
      makeHole({
        holeNumber: 1,
        scored: true,
        aceUserId: 'u1',
        deuceUserId: 'u4',
        pointsByPlayer: { u1: 3, u2: 0, u3: 0, u4: -3 },
        perPlayer: [
          cell('u1', 4, 3, 3),
          cell('u2', 4, 4, 0),
          cell('u3', 4, 4, 0),
          cell('u4', 6, 6, -3),
        ],
      }),
      // Hull 2 (delt lavest): Alice + Bjørn begge netto 4 → INGEN ace.
      // David deuce (netto 7) −3.
      makeHole({
        holeNumber: 2,
        scored: true,
        aceUserId: null,
        deuceUserId: 'u4',
        pointsByPlayer: { u1: 0, u2: 0, u3: 0, u4: -3 },
        perPlayer: [
          cell('u1', 4, 4, 0),
          cell('u2', 4, 4, 0),
          cell('u3', 5, 5, 0),
          cell('u4', 7, 7, -3),
        ],
      }),
      // Hull 3 (pending): kun Alice har tastet.
      makeHole({
        holeNumber: 3,
        scored: false,
        aceUserId: null,
        deuceUserId: null,
        pointsByPlayer: { u1: 0, u2: 0, u3: 0, u4: 0 },
        perPlayer: [
          cell('u1', 4, 4, 0),
          cell('u2', null, null, 0),
          cell('u3', null, null, 0),
          cell('u4', null, null, 0),
        ],
      }),
    ],
    players: [],
  };
}

function defaultProps(
  overrides: Partial<AceyDeuceyHolesViewProps> = {},
): AceyDeuceyHolesViewProps {
  const playersById: Map<string, AceyDeuceyPlayerInfo> = new Map([
    ['u1', { name: 'Alice Andersen', nickname: null }],
    ['u2', { name: 'Bjørn Berg', nickname: null }],
    ['u3', { name: 'Camilla Carlsen', nickname: null }],
    ['u4', { name: 'David Dahl', nickname: null }],
  ]);
  return {
    gameId: 'g1',
    gameName: 'Acey-runde',
    result: makeResult(),
    playersById,
    scoreVisibility: 'live',
    gameStatus: 'finished',
    ...overrides,
  };
}

describe('AceyDeuceyHolesView', () => {
  // Fokus: det Acey-Deucey-spesifikke — alle 4 spillere score-rangert med
  // ace (champagne+★, +3) og deuce (kald, −3), og at delt ekstrem IKKE
  // uthever. AceyDeuceyView (leaderboard) viser kun ace/deuce-navn, så vi
  // re-asserter ikke det her.
  it('rangerer på score med ace/deuce-markering og uthever ikke delt ekstrem', () => {
    render(<AceyDeuceyHolesView {...defaultProps()} />);

    const list = screen.getByTestId('acey-deucey-holes-list');
    expect(list.children).toHaveLength(3);

    // Hull 1: ace ★ + slag + symmetriske poeng. Score-rangert: ace øverst,
    // deuce nederst.
    const card1 = screen.getByTestId('acey-deucey-holes-card-1');
    expect(card1.textContent).toContain('★');
    expect(card1.textContent).toContain('brutto 4'); // Alice netto 3
    expect(card1.textContent).toContain('−3'); // deuce (U+2212)
    const card1Rows = within(card1).getAllByRole('listitem');
    expect(card1Rows[0].textContent).toContain('Alice Andersen'); // ace øverst
    expect(card1Rows[3].textContent).toContain('David Dahl'); // deuce nederst

    // Hull 2 (delt lavest): INGEN ace-utheving (ingen champagne) selv om to har
    // laveste score — men deuce er fortsatt markert.
    const card2 = screen.getByTestId('acey-deucey-holes-card-2');
    expect(card2.querySelector('[class*="border-accent"]')).toBeNull();
    expect(card2.textContent).toContain('−3');

    // Hull 3 (pending): «Venter», manglende score som «–», ingen ace-utheving.
    const card3 = screen.getByTestId('acey-deucey-holes-card-3');
    expect(card3.textContent).toContain('Venter');
    expect(card3.textContent).toContain('–');
    expect(card3.querySelector('[class*="border-accent"]')).toBeNull();
  });
});
