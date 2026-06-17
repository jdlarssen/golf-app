import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  NassauView,
  type NassauPlayerInfo,
  type NassauViewProps,
} from './NassauView';
import type {
  NassauResult,
  NassauSection,
  NassauSectionLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeLine(
  userId: string,
  rank: number,
  totalEffective: number,
  totalGross: number,
  holesPlayed: number,
  tiedWith: string[] = [],
): NassauSectionLine {
  return {
    userId,
    totalEffectiveStrokes: totalEffective,
    totalGrossStrokes: totalGross,
    holesPlayed,
    rank,
    tiedWith,
  };
}

function makeSection(
  name: 'front9' | 'back9' | 'total18',
  players: NassauSectionLine[],
  winnerUserIds: string[],
  isPending = false,
): NassauSection {
  const holeNumbers =
    name === 'front9'
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
      : name === 'back9'
        ? [10, 11, 12, 13, 14, 15, 16, 17, 18]
        : Array.from({ length: 18 }, (_, i) => i + 1);
  return {
    name,
    holeNumbers,
    players,
    winnerUserIds,
    isPending,
  };
}

function makeResult(): NassauResult {
  // Blandet utfall: A vinner Front 9, B vinner Back 9, C vinner Total 18.
  return {
    kind: 'nassau',
    scoring: 'net',
    sections: {
      front9: makeSection(
        'front9',
        [
          makeLine('uA', 1, 36, 40, 9),
          makeLine('uB', 2, 38, 42, 9),
          makeLine('uC', 3, 40, 44, 9),
        ],
        ['uA'],
      ),
      back9: makeSection(
        'back9',
        [
          makeLine('uB', 1, 35, 39, 9),
          makeLine('uA', 2, 39, 43, 9),
          makeLine('uC', 3, 41, 45, 9),
        ],
        ['uB'],
      ),
      total18: makeSection(
        'total18',
        [
          makeLine('uC', 1, 75, 83, 18),
          makeLine('uA', 2, 76, 84, 18),
          makeLine('uB', 3, 78, 86, 18),
        ],
        ['uC'],
      ),
    },
    players: [
      {
        userId: 'uA',
        units: 1,
        unitBreakdown: { front9: true, back9: false, total18: false },
        total18EffectiveStrokes: 76,
        total18SectionRank: 2,
        rank: 1,
        tiedWith: ['uB', 'uC'],
      },
      {
        userId: 'uB',
        units: 1,
        unitBreakdown: { front9: false, back9: true, total18: false },
        total18EffectiveStrokes: 78,
        total18SectionRank: 3,
        rank: 1,
        tiedWith: ['uA', 'uC'],
      },
      {
        userId: 'uC',
        units: 1,
        unitBreakdown: { front9: false, back9: false, total18: true },
        total18EffectiveStrokes: 75,
        total18SectionRank: 1,
        rank: 1,
        tiedWith: ['uA', 'uB'],
      },
    ],
    // Per-hull-data brukes ikke av NassauView (seksjons-sammendrag) — den
    // format-bevisste «Hull for hull»-flaten har egen render-test (#496).
    holes: [],
  };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, NassauPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function defaultProps(
  overrides: Partial<NassauViewProps> = {},
): NassauViewProps {
  return {
    gameId: 'g1',
    gameName: 'Sommer-Nassau',
    result: makeResult(),
    playersById: makePlayers([
      ['uA', 'Alice Andersen', null],
      ['uB', 'Bjørn Berg', 'Bjørnen'],
      ['uC', 'Camilla Carlsen', null],
    ]),
    scoreVisibility: 'live',
    gameStatus: 'finished',
    holesPlayed: 18,
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('NassauView', () => {
  it('rendrer alle tre seksjoner med headers, vinner-highlight, spillere og effective-totaler', () => {
    const { unmount } = render(<NassauView {...defaultProps()} />);

    // Tre seksjons-headere er synlige.
    expect(screen.getByText('Front 9')).toBeInTheDocument();
    expect(screen.getByText('Back 9')).toBeInTheDocument();
    expect(screen.getByText('Totalt 18 hull')).toBeInTheDocument();

    // Front 9: A er vinner (rank 1, highlightet), B og C under
    const front9 = screen.getByTestId('nassau-section-front9');
    const front9Rows = within(front9).getAllByRole('listitem');
    expect(front9Rows).toHaveLength(3);
    expect(front9Rows[0].textContent).toContain('Alice Andersen');
    expect(front9Rows[0].textContent).toContain('36');
    expect(front9Rows[0].dataset.winner).toBe('true');
    expect(front9Rows[1].dataset.winner).toBeUndefined();

    // Back 9: B er vinner
    const back9 = screen.getByTestId('nassau-section-back9');
    const back9Rows = within(back9).getAllByRole('listitem');
    expect(back9Rows[0].textContent).toContain('Bjørnen');
    expect(back9Rows[0].textContent).toContain('35');
    expect(back9Rows[0].dataset.winner).toBe('true');

    // Total 18: C er vinner
    const total18 = screen.getByTestId('nassau-section-total18');
    const total18Rows = within(total18).getAllByRole('listitem');
    expect(total18Rows[0].textContent).toContain('Camilla Carlsen');
    expect(total18Rows[0].textContent).toContain('75');
    expect(total18Rows[0].dataset.winner).toBe('true');

    // Brutto + hull-spilt vises som sekundær tekst.
    expect(front9Rows[0].textContent).toContain('40 brutto');
    expect(front9Rows[0].textContent).toContain('9 hull spilt');

    // Header-sub-tittel inneholder Nassau + Netto.
    expect(screen.getByText(/Nassau/)).toBeInTheDocument();
    expect(screen.getByText(/Netto/)).toBeInTheDocument();

    unmount();
  });

  it('viser «Resultatene avsløres etter runden» i reveal-modus midt-runde', () => {
    render(
      <NassauView
        {...defaultProps({
          scoreVisibility: 'reveal',
          gameStatus: 'active',
        })}
      />,
    );
    const hidden = screen.getByTestId('nassau-reveal-hidden');
    expect(hidden.textContent).toContain('Resultatene avsløres etter runden');
    // Selve seksjonene skal ikke være rendret.
    expect(screen.queryByTestId('nassau-sections')).toBeNull();
    expect(screen.queryByTestId('nassau-section-front9')).toBeNull();
  });

  it('viser pending-melding når en seksjon ikke har noen ferdig-spiller', () => {
    const pendingResult = makeResult();
    pendingResult.sections.back9 = makeSection(
      'back9',
      [
        makeLine('uA', 1, 18, 20, 5),
        makeLine('uB', 2, 20, 22, 4),
        makeLine('uC', 3, 25, 26, 3),
      ],
      [],
      true,
    );
    render(<NassauView {...defaultProps({ result: pendingResult })} />);
    const pending = screen.getByTestId('nassau-section-back9-pending');
    expect(pending.textContent).toMatch(/Venter på spilte hull/i);
    // Front 9 og Total 18 fortsatt rendret normalt.
    expect(screen.getByTestId('nassau-section-front9-list')).toBeInTheDocument();
    expect(screen.getByTestId('nassau-section-total18-list')).toBeInTheDocument();
  });

  it('viser «Delt 1.-plass»-chip og T-prefix når flere spillere deler vinst (push)', () => {
    const pushResult = makeResult();
    pushResult.sections.front9 = makeSection(
      'front9',
      [
        makeLine('uA', 1, 36, 40, 9, ['uB']),
        makeLine('uB', 1, 36, 41, 9, ['uA']),
        makeLine('uC', 3, 40, 44, 9),
      ],
      ['uA', 'uB'],
    );
    render(<NassauView {...defaultProps({ result: pushResult })} />);

    const front9 = screen.getByTestId('nassau-section-front9');
    expect(within(front9).getByTestId('nassau-section-front9-push')).toBeInTheDocument();
    const rows = within(front9).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('T1');
    expect(rows[1].textContent).toContain('T1');
    // Ingen ren vinner-highlight i push-tilstand.
    expect(rows[0].dataset.winner).toBeUndefined();
    expect(rows[1].dataset.winner).toBeUndefined();
  });
});
