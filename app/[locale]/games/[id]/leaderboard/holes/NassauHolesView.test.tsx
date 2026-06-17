import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  NassauHolesView,
  type NassauHolesViewProps,
} from './NassauHolesView';
import type { NassauPlayerInfo } from '../NassauView';
import type {
  NassauResult,
  NassauSection,
  NassauSectionLine,
  NassauUnitLine,
  NassauHoleRow,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function sectionLine(
  userId: string,
  totalEffectiveStrokes: number,
  rank: number,
): NassauSectionLine {
  return {
    userId,
    totalEffectiveStrokes,
    totalGrossStrokes: totalEffectiveStrokes,
    holesPlayed: 9,
    rank,
    tiedWith: [],
  };
}

function section(
  name: NassauSection['name'],
  holeNumbers: number[],
  players: NassauSectionLine[],
  winnerUserIds: string[],
): NassauSection {
  return { name, holeNumbers, players, winnerUserIds, isPending: false };
}

function unitLine(
  userId: string,
  units: number,
  breakdown: NassauUnitLine['unitBreakdown'],
  rank: number,
): NassauUnitLine {
  return {
    userId,
    units,
    unitBreakdown: breakdown,
    total18EffectiveStrokes: 72,
    total18SectionRank: rank,
    rank,
    tiedWith: [],
  };
}

function hole(
  holeNumber: number,
  section: NassauHoleRow['section'],
  u1: number | null,
  u2: number | null,
  bestUserIds: string[],
): NassauHoleRow {
  return {
    holeNumber,
    par: 4,
    strokeIndex: holeNumber,
    section,
    perPlayer: [
      { userId: 'u1', gross: u1, effective: u1 },
      { userId: 'u2', gross: u2, effective: u2 },
    ],
    bestUserIds,
  };
}

function makeResult(): NassauResult {
  return {
    kind: 'nassau',
    scoring: 'net',
    sections: {
      front9: section(
        'front9',
        [1, 2],
        [sectionLine('u1', 36, 1), sectionLine('u2', 40, 2)],
        ['u1'], // Jørgen vant For 9
      ),
      back9: section(
        'back9',
        [10, 11],
        [sectionLine('u2', 37, 1), sectionLine('u1', 39, 2)],
        ['u2'], // Ola vant Bak 9
      ),
      total18: section(
        'total18',
        [1, 2, 10, 11],
        [sectionLine('u1', 75, 1), sectionLine('u2', 77, 2)],
        ['u1'], // Jørgen vant Totalt
      ),
    },
    players: [
      unitLine('u1', 2, { front9: true, back9: false, total18: true }, 1),
      unitLine('u2', 1, { front9: false, back9: true, total18: false }, 2),
    ],
    holes: [
      hole(1, 'front9', 4, 5, ['u1']), // Jørgen vant hullet
      hole(2, 'front9', 5, 4, ['u2']),
      hole(10, 'back9', 4, 4, ['u1', 'u2']), // delt
      hole(11, 'back9', 5, 4, ['u2']),
    ],
  };
}

function defaultProps(
  overrides: Partial<NassauHolesViewProps> = {},
): NassauHolesViewProps {
  const playersById: Map<string, NassauPlayerInfo> = new Map([
    ['u1', { name: 'Jørgen Larsen', nickname: null }],
    ['u2', { name: 'Ola Olsen', nickname: null }],
  ]);
  return {
    gameId: 'g1',
    gameName: 'Nassau-runde',
    result: makeResult(),
    playersById,
    scoreVisibility: 'live',
    gameStatus: 'finished',
    ...overrides,
  };
}

describe('NassauHolesView', () => {
  // Fokus: det Nassau-spesifikke — tre seksjons-tro bolker (For 9 / Bak 9 /
  // Totalt) med per-hull netto per spiller og hull-vinner uthevet, der Totalt-
  // bolken er rent sammendrag (ingen per-hull-kort). NassauView (leaderboard)
  // viser kun seksjons-totaler, så vi re-asserter ikke ranking-tallene her.
  it('rendrer tre bolker med per-hull-kort i For 9 / Bak 9 og sammendrag i Totalt', () => {
    render(<NassauHolesView {...defaultProps()} />);

    // De tre bolkene finnes (seksjons-tro struktur, ikke ett lag-scorekort).
    const front = screen.getByTestId('nassau-holes-front9');
    const back = screen.getByTestId('nassau-holes-back9');
    const total = screen.getByTestId('nassau-holes-total18');

    // Bolk-vinner markert i header (champagne ★ + navn).
    expect(within(front).getByTestId('nassau-holes-front9-winner').textContent)
      .toContain('Jørgen');
    expect(within(back).getByTestId('nassau-holes-back9-winner').textContent)
      .toContain('Ola');

    // For 9 har per-hull-kort med begge spillernes netto, og hull-vinneren
    // uthevet i champagne med ★. (Det NassauView mangler.)
    const card1 = within(front).getByTestId('nassau-holes-card-1');
    expect(card1.textContent).toContain('Jørgen');
    expect(card1.textContent).toContain('Ola');
    expect(card1.textContent).toContain('★');
    expect(card1.querySelector('[class*="border-accent"]')).not.toBeNull();

    // Delt hull (10): ingen enkelt-vinner-utheving (begge laveste).
    const card10 = within(back).getByTestId('nassau-holes-card-10');
    expect(card10.querySelector('[class*="border-accent"]')).toBeNull();

    // Totalt-bolken er rent sammendrag — ingen per-hull-kort repeteres der.
    expect(within(total).queryByTestId('nassau-holes-card-1')).toBeNull();
    expect(total.querySelector('[data-testid^="nassau-holes-card-"]')).toBeNull();

    // Units-sammendrag på toppen viser seksjoner vunnet per spiller.
    expect(screen.getByTestId('nassau-holes-units').textContent).toContain('Jørgen');
  });
});
