import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  BingoBangoBongoHolesView,
  type BingoBangoBongoHolesViewProps,
} from './BingoBangoBongoHolesView';
import type { BingoBangoBongoPlayerInfo } from '../BingoBangoBongoView';
import type {
  BingoBangoBongoResult,
  BingoBangoBongoHoleRow,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeHole(
  overrides: Partial<BingoBangoBongoHoleRow>,
): BingoBangoBongoHoleRow {
  return {
    holeNumber: 1,
    bingoUserId: null,
    bangoUserId: null,
    bongoUserId: null,
    pointsByPlayer: {},
    ...overrides,
  };
}

function makeResult(): BingoBangoBongoResult {
  return {
    kind: 'bingo_bango_bongo',
    holes: [
      // Hull 1 (normalt): tre ulike vinnere — Alice bingo, Bjørn bango,
      // Camilla bongo. Ingen sweep.
      makeHole({
        holeNumber: 1,
        bingoUserId: 'u1',
        bangoUserId: 'u2',
        bongoUserId: 'u3',
        pointsByPlayer: { u1: 1, u2: 1, u3: 1 },
      }),
      // Hull 2 (sweep): Alice tok alle tre → «Feiet!».
      makeHole({
        holeNumber: 2,
        bingoUserId: 'u1',
        bangoUserId: 'u1',
        bongoUserId: 'u1',
        pointsByPlayer: { u1: 3 },
      }),
      // Hull 3 (delvis): kun bingo registrert — bango/bongo «ikke satt».
      makeHole({
        holeNumber: 3,
        bingoUserId: 'u2',
        bangoUserId: null,
        bongoUserId: null,
        pointsByPlayer: { u2: 1 },
      }),
      // Hull 4 (pending): ingen rad registrert.
      makeHole({
        holeNumber: 4,
        pointsByPlayer: {},
      }),
    ],
    players: [],
  };
}

function defaultProps(
  overrides: Partial<BingoBangoBongoHolesViewProps> = {},
): BingoBangoBongoHolesViewProps {
  const playersById: Map<string, BingoBangoBongoPlayerInfo> = new Map([
    ['u1', { name: 'Alice Andersen', nickname: null }],
    ['u2', { name: 'Bjørn Berg', nickname: null }],
    ['u3', { name: 'Camilla Carlsen', nickname: null }],
  ]);
  return {
    gameId: 'g1',
    gameName: 'BBB-runde',
    result: makeResult(),
    playersById,
    scoreVisibility: 'live',
    gameStatus: 'finished',
    ...overrides,
  };
}

describe('BingoBangoBongoHolesView', () => {
  // Fokus: det BBB-spesifikke — prestasjons-først per hull (Bingo/Bango/Bongo
  // → vinner-navn), sweep-uthevning og pending/«ikke satt». BingoBangoBongoView
  // (leaderboard) har ingen per-hull-visning, så det finnes ingenting å
  // re-assertere fra.
  it('viser de tre prestasjonene med vinner-navn, sweep og pending', () => {
    render(<BingoBangoBongoHolesView {...defaultProps()} />);

    const list = screen.getByTestId('bbb-holes-list');
    expect(list.children).toHaveLength(4);

    // Hull 1 (normalt): tre prestasjoner med tre ulike vinnere. Ingen «Feiet!».
    const card1 = screen.getByTestId('bbb-holes-card-1');
    expect(card1.textContent).toContain('Bingo');
    expect(card1.textContent).toContain('Bango');
    expect(card1.textContent).toContain('Bongo');
    expect(card1.textContent).toContain('Alice Andersen');
    expect(card1.textContent).toContain('Bjørn Berg');
    expect(card1.textContent).toContain('Camilla Carlsen');
    expect(card1.textContent).not.toContain('Feiet');

    // Hull 2 (sweep): én spiller tok alle tre → «Feiet!»-markering.
    const card2 = screen.getByTestId('bbb-holes-card-2');
    expect(card2.textContent).toContain('Feiet');
    expect(card2.textContent).toContain('Alice Andersen');

    // Hull 3 (delvis): bingo satt, resten «ikke satt» — ikke pending.
    const card3 = screen.getByTestId('bbb-holes-card-3');
    expect(card3.textContent).toContain('Bjørn Berg');
    expect(card3.textContent).toContain('ikke satt');
    expect(card3.textContent).not.toContain('Venter');

    // Hull 4 (pending): ingen prestasjoner — «Venter», ingen vinner-navn.
    const card4 = screen.getByTestId('bbb-holes-card-4');
    expect(card4.textContent).toContain('Venter');
    expect(within(card4).queryByText('Alice Andersen')).toBeNull();
  });
});
