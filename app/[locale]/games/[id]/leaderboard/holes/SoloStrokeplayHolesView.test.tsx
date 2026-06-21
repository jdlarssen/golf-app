import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  SoloStrokeplayHolesView,
  type SoloStrokeplayHolesViewProps,
} from './SoloStrokeplayHolesView';
import type { SoloStrokeplayPlayerInfo } from '../SoloStrokeplayView';
import type {
  SoloStrokeplayResult,
  SoloStrokeplayHoleRow,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function hole(
  holeNumber: number,
  u1: number | null,
  u2: number | null,
  bestUserIds: string[],
): SoloStrokeplayHoleRow {
  return {
    holeNumber,
    par: 4,
    strokeIndex: holeNumber,
    perPlayer: [
      { userId: 'u1', gross: u1, net: u1, par: 4 },
      { userId: 'u2', gross: u2, net: u2, par: 4 },
    ],
    bestUserIds,
  };
}

function makeResult(): SoloStrokeplayResult {
  return {
    kind: 'solo_strokeplay',
    players: [
      {
        userId: 'u1',
        totalNetStrokes: 70,
        totalGrossStrokes: 70,
        holesPlayed: 4,
        rank: 1,
        tiedWith: [],
      },
      {
        userId: 'u2',
        totalNetStrokes: 74,
        totalGrossStrokes: 74,
        holesPlayed: 4,
        rank: 2,
        tiedWith: [],
      },
    ],
    holes: [
      hole(1, 4, 5, ['u1']), // u1 vinner hull 1
      hole(2, 5, 4, ['u2']),
      hole(10, 4, 4, ['u1', 'u2']), // delt
      hole(11, 5, 4, ['u2']),
    ],
  };
}

function defaultProps(
  overrides: Partial<SoloStrokeplayHolesViewProps> = {},
): SoloStrokeplayHolesViewProps {
  const playersById: Map<string, SoloStrokeplayPlayerInfo> = new Map([
    ['u1', { name: 'Jørgen Larsen', nickname: null }],
    ['u2', { name: 'Ola Olsen', nickname: null }],
  ]);
  return {
    gameId: 'g1',
    gameName: 'Slagspill-runde',
    result: makeResult(),
    playersById,
    scoreVisibility: 'live',
    gameStatus: 'finished',
    ...overrides,
  };
}

describe('SoloStrokeplayHolesView', () => {
  // Fokus: det solo-strokeplay-spesifikke — et klassisk per-spiller-scorekort
  // (stillings-header + Ut/Inn per-hull-kort med netto per spiller, lavest
  // uthevet), IKKE et best-ball «Lag N»-scorekort. SoloStrokeplayView
  // (leaderboard) viser kun totaler, så vi re-asserter ikke ranking-tallene.
  it('rendrer stillings-header + Ut/Inn per-hull-kort med lavest netto uthevet', () => {
    render(<SoloStrokeplayHolesView {...defaultProps()} />);

    // Stillings-header med begge spillere — per spiller, ikke «Lag N».
    const totals = screen.getByTestId('solo-strokeplay-holes-totals');
    expect(totals.textContent).toContain('Jørgen');
    expect(totals.textContent).toContain('Ola');
    expect(totals.textContent).not.toContain('Lag');

    const front = screen.getByTestId('solo-strokeplay-holes-front9');
    const back = screen.getByTestId('solo-strokeplay-holes-back9');

    // Ut-bolken har per-hull-kort med begge spillernes netto, og hull-vinneren
    // (lavest netto) uthevet i champagne med ★.
    const card1 = within(front).getByTestId('solo-strokeplay-holes-card-1');
    expect(card1.textContent).toContain('Jørgen');
    expect(card1.textContent).toContain('Ola');
    expect(card1.textContent).toContain('★');
    expect(card1.querySelector('[class*="border-accent"]')).not.toBeNull();

    // Delt hull (10, i Inn): ingen enkelt-vinner-utheving.
    const card10 = within(back).getByTestId('solo-strokeplay-holes-card-10');
    expect(card10.querySelector('[class*="border-accent"]')).toBeNull();
  });
});
