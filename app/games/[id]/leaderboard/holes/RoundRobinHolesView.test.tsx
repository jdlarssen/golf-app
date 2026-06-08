import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  RoundRobinHolesView,
  type RoundRobinHolesViewProps,
} from './RoundRobinHolesView';
import type { RoundRobinPlayerInfo } from '../RoundRobinView';
import type {
  RoundRobinResult,
  RoundRobinHoleRow,
  RoundRobinPlayerCell,
  MatchplayHoleResult,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function cell(
  userId: string,
  gross: number | null,
  net: number | null,
  isContributor = false,
): RoundRobinPlayerCell {
  return {
    userId,
    gross,
    extraStrokes: gross != null && net != null ? gross - net : 0,
    net,
    isContributor,
    par: 4,
  };
}

function makeHole(
  holeNumber: number,
  segment: 1 | 2 | 3,
  side1Ids: [string, string],
  side2Ids: [string, string],
  side1: RoundRobinPlayerCell[],
  side2: RoundRobinPlayerCell[],
  result: MatchplayHoleResult,
): RoundRobinHoleRow {
  return {
    holeNumber,
    segment,
    par: 4,
    side1Par: 4,
    side2Par: 4,
    strokeIndex: holeNumber,
    side1PlayerIds: side1Ids,
    side2PlayerIds: side2Ids,
    side1Players: side1,
    side2Players: side2,
    side1BestNet: side1[0]?.net ?? null,
    side2BestNet: side2[0]?.net ?? null,
    side1ContributorIds: side1.filter((c) => c.isContributor).map((c) => c.userId),
    side2ContributorIds: side2.filter((c) => c.isContributor).map((c) => c.userId),
    result,
    holeWinByPlayer: {},
  };
}

function makeResult(): RoundRobinResult {
  return {
    kind: 'round_robin',
    allowancePct: 100,
    holes: [
      // Segment 1 (A+B mot C+D). Hull 1: side 1 vant. Alice fikk et slag (brutto 5, netto 4).
      makeHole(
        1,
        1,
        ['u1', 'u2'],
        ['u3', 'u4'],
        [cell('u1', 5, 4, true), cell('u2', 5, 5)],
        [cell('u3', 5, 5, true), cell('u4', 6, 6)],
        'side1_wins',
      ),
      // Hull 2: delt.
      makeHole(
        2,
        1,
        ['u1', 'u2'],
        ['u3', 'u4'],
        [cell('u1', 4, 4, true), cell('u2', 5, 5)],
        [cell('u3', 4, 4, true), cell('u4', 5, 5)],
        'tied',
      ),
      // Segment 2 (A+C mot B+D) — rotert konstellasjon. Hull 7: side 2 vant.
      makeHole(
        7,
        2,
        ['u1', 'u3'],
        ['u2', 'u4'],
        [cell('u1', 5, 5, true), cell('u3', 6, 6)],
        [cell('u2', 3, 3, true), cell('u4', 4, 4)],
        'side2_wins',
      ),
      // Hull 8: unplayed (kun Bjørn har tastet).
      makeHole(
        8,
        2,
        ['u1', 'u3'],
        ['u2', 'u4'],
        [cell('u1', null, null), cell('u3', null, null)],
        [cell('u2', 4, 4), cell('u4', null, null)],
        'unplayed',
      ),
    ],
    players: [],
  };
}

function defaultProps(
  overrides: Partial<RoundRobinHolesViewProps> = {},
): RoundRobinHolesViewProps {
  const playersById: Map<string, RoundRobinPlayerInfo> = new Map([
    ['u1', { name: 'Alice Andersen', nickname: null }],
    ['u2', { name: 'Bjørn Berg', nickname: null }],
    ['u3', { name: 'Camilla Carlsen', nickname: null }],
    ['u4', { name: 'David Dahl', nickname: null }],
  ]);
  return {
    gameId: 'g1',
    gameName: 'Robin-runde',
    result: makeResult(),
    playersById,
    scoreVisibility: 'live',
    gameStatus: 'finished',
    ...overrides,
  };
}

describe('RoundRobinHolesView', () => {
  // Fokus: det Round Robin-spesifikke — segment-grupperingen med roterende
  // konstellasjon, og per hull begge sidenes per-spiller-netto + vinner-
  // utheving. RoundRobinView (leaderboard) har ingen per-hull-visning, så
  // alt her er nytt og ikke duplisert fra en annen test.
  it('grupperer på segment med roterende konstellasjon, side-vinner og pending', () => {
    render(<RoundRobinHolesView {...defaultProps()} />);

    // To segment-bolker rendret.
    const segments = screen.getByTestId('round-robin-holes-segments');
    expect(segments.children).toHaveLength(2);

    // Segment 1: konstellasjon A+B mot C+D.
    const seg1 = screen.getByTestId('round-robin-holes-segment-1');
    expect(seg1.textContent).toContain('Alice Andersen + Bjørn Berg');
    expect(seg1.textContent).toContain('Camilla Carlsen + David Dahl');

    // Segment 2: ROTERT konstellasjon A+C mot B+D — beviset på at rotasjonen vises.
    const seg2 = screen.getByTestId('round-robin-holes-segment-2');
    expect(seg2.textContent).toContain('Alice Andersen + Camilla Carlsen');
    expect(seg2.textContent).toContain('Bjørn Berg + David Dahl');

    // Hull 1: side 1 vant + Alice sitt slag (brutto≠netto) vises.
    const card1 = screen.getByTestId('round-robin-holes-card-1');
    expect(card1.textContent).toContain('Vant hullet');
    expect(card1.textContent).toContain('brutto 5'); // Alice netto 4

    // Hull 8 (unplayed): «Venter», manglende netto som «–», ingen vinner-utheving.
    const card8 = screen.getByTestId('round-robin-holes-card-8');
    expect(card8.textContent).toContain('Venter');
    expect(card8.textContent).toContain('–');
    expect(card8.textContent).not.toContain('Vant hullet');
    expect(card8.querySelector('[class*="border-accent"]')).toBeNull();
  });
});
