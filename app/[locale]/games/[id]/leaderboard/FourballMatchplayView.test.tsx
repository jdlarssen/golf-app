import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  FourballMatchplayView,
  type FourballMatchplayViewProps,
  type FourballPlayerInfo,
} from './FourballMatchplayView';
import type {
  FourballMatchplayResult,
  FourballHoleRow,
  FourballSide,
} from '@/lib/scoring/modes/types';

// SmartLink calls useRouter — stub the navigation context for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSides(): [FourballSide, FourballSide] {
  return [
    {
      sideNumber: 1,
      players: [
        { userId: 'u1a', courseHandicap: 12, effectiveHandicap: 10 },
        { userId: 'u1b', courseHandicap: 18, effectiveHandicap: 15 },
      ],
    },
    {
      sideNumber: 2,
      players: [
        { userId: 'u2a', courseHandicap: 8, effectiveHandicap: 7 },
        { userId: 'u2b', courseHandicap: 22, effectiveHandicap: 19 },
      ],
    },
  ];
}

function makePlayerInfo(): Record<string, FourballPlayerInfo> {
  return {
    u1a: { name: 'Alice Andersen', nickname: null, courseHandicap: 12 },
    u1b: { name: 'Anders Aas', nickname: null, courseHandicap: 18 },
    u2a: { name: 'Bjørn Berg', nickname: 'Bjørnen', courseHandicap: 8 },
    u2b: { name: 'Berit Bø', nickname: null, courseHandicap: 22 },
  };
}

function makeHole(
  holeNumber: number,
  overrides: Partial<FourballHoleRow> = {},
): FourballHoleRow {
  return {
    holeNumber,
    par: 4,
    side1Par: 4,
    side2Par: 4,
    strokeIndex: holeNumber,
    side1Players: [
      {
        userId: 'u1a',
        gross: null,
        extraStrokes: 0,
        net: null,
        isContributor: false,
        par: 4,
      },
      {
        userId: 'u1b',
        gross: null,
        extraStrokes: 0,
        net: null,
        isContributor: false,
        par: 4,
      },
    ],
    side2Players: [
      {
        userId: 'u2a',
        gross: null,
        extraStrokes: 0,
        net: null,
        isContributor: false,
        par: 4,
      },
      {
        userId: 'u2b',
        gross: null,
        extraStrokes: 0,
        net: null,
        isContributor: false,
        par: 4,
      },
    ],
    side1BestNet: null,
    side2BestNet: null,
    side1ContributorIds: [],
    side2ContributorIds: [],
    result: 'unplayed',
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<FourballMatchplayResult> = {},
): FourballMatchplayResult {
  return {
    kind: 'fourball_matchplay',
    sides: makeSides(),
    holes: Array.from({ length: 18 }, (_, i) => makeHole(i + 1)),
    holesUp: 0,
    holesPlayed: 0,
    holesRemaining: 18,
    result: null,
    ...overrides,
  };
}

function defaultProps(
  overrides: Partial<FourballMatchplayViewProps> = {},
): FourballMatchplayViewProps {
  return {
    gameId: 'g1',
    gameName: 'Fourball-finale',
    result: makeResult(),
    playerInfo: makePlayerInfo(),
    gameStatus: 'active',
    backHref: '/games/g1',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FourballMatchplayView', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  describe('lag-header', () => {
    it('viser begge lag med 2 spillere hver, generisk «Lag 1»/«Lag 2» når labels ikke er gitt', () => {
      render(<FourballMatchplayView {...defaultProps()} />);
      const side1 = screen.getByTestId('fourball-side-1');
      const side2 = screen.getByTestId('fourball-side-2');
      expect(side1.textContent).toMatch(/Lag 1/);
      expect(side2.textContent).toMatch(/Lag 2/);
      // Spillerne på lag 1
      expect(side1.textContent).toMatch(/Alice/);
      expect(side1.textContent).toMatch(/Anders/);
      // Spillerne på lag 2 (Bjørn med kallenavn → formatRevealName)
      expect(side2.textContent).toMatch(/Bjørnen/);
      expect(side2.textContent).toMatch(/Berit/);
    });

    it('rendrer side-labels fra tournament når props sender dem', () => {
      render(
        <FourballMatchplayView
          {...defaultProps({
            side1Label: 'Lag Skog',
            side2Label: 'Lag Sjø',
          })}
        />,
      );
      const side1 = screen.getByTestId('fourball-side-1');
      const side2 = screen.getByTestId('fourball-side-2');
      expect(side1.textContent).toMatch(/Lag Skog/);
      expect(side2.textContent).toMatch(/Lag Sjø/);
    });

    it('viser effektiv HCP for hver av de 4 spillerne', () => {
      render(<FourballMatchplayView {...defaultProps()} />);
      const side1 = screen.getByTestId('fourball-side-1');
      // effectiveHandicap = 10 og 15 for lag 1
      expect(side1.textContent).toMatch(/HCP 10/);
      expect(side1.textContent).toMatch(/HCP 15/);
    });
  });

  describe('status-banner', () => {
    it('viser «Matchen er ikke startet ennå» når 0 hull er spilt', () => {
      render(<FourballMatchplayView {...defaultProps()} />);
      const banner = screen.getByTestId('fourball-banner-live');
      expect(banner.textContent).toMatch(/ikke startet/i);
    });

    it('viser «Lag 1 leder X up» når lag 1 leder live', () => {
      const holes = [
        makeHole(1, {
          side1BestNet: 4,
          side2BestNet: 5,
          side1ContributorIds: ['u1a'],
          side2ContributorIds: ['u2a'],
          result: 'side1_wins',
        }),
        makeHole(2, {
          side1BestNet: 4,
          side2BestNet: 5,
          side1ContributorIds: ['u1a'],
          side2ContributorIds: ['u2a'],
          result: 'side1_wins',
        }),
        ...Array.from({ length: 16 }, (_, i) => makeHole(i + 3)),
      ];
      render(
        <FourballMatchplayView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 2,
              holesPlayed: 2,
              holesRemaining: 16,
            }),
          })}
        />,
      );
      const banner = screen.getByTestId('fourball-banner-live');
      expect(banner.textContent).toMatch(/Lag 1/);
      expect(banner.textContent).toMatch(/leder/);
      expect(banner.textContent).toMatch(/2 up/);
      expect(banner.textContent).toMatch(/Etter 2 hull/);
    });

    it('viser «Lag 2 vant 3&2» når matchen er avgjort med mat-em', () => {
      render(
        <FourballMatchplayView
          {...defaultProps({
            result: makeResult({
              holes: Array.from({ length: 18 }, (_, i) => makeHole(i + 1)),
              holesUp: -3,
              holesPlayed: 16,
              holesRemaining: 2,
              result: {
                winner: 'side2',
                marginUp: 3,
                decidedAtHole: 16,
                remainingAtDecision: 2,
                formatted: '3&2',
              },
            }),
            gameStatus: 'finished',
          })}
        />,
      );
      const banner = screen.getByTestId('fourball-banner-decided');
      expect(banner.textContent).toMatch(/Lag 2/);
      expect(banner.textContent).toMatch(/vant/);
      expect(banner.textContent).toMatch(/3&2/);
      expect(banner.textContent).toMatch(/Avgjort på hull 16/);
    });

    it('viser AS-banner uten konfetti når matchen ender uavgjort', () => {
      const { container } = render(
        <FourballMatchplayView
          {...defaultProps({
            result: makeResult({
              holes: Array.from({ length: 18 }, (_, i) => makeHole(i + 1)),
              holesUp: 0,
              holesPlayed: 18,
              holesRemaining: 0,
              result: {
                winner: 'tied',
                marginUp: 0,
                decidedAtHole: 18,
                remainingAtDecision: 0,
                formatted: 'AS',
              },
            }),
            gameStatus: 'finished',
          })}
        />,
      );
      const banner = screen.getByTestId('fourball-banner-tied');
      expect(banner.textContent).toMatch(/AS/);
      // Ingen konfetti ved AS
      const pieces = container.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBe(0);
    });
  });

  describe('per-hull-grid', () => {
    it('rendrer en rad per hull i result.holes', () => {
      render(<FourballMatchplayView {...defaultProps()} />);
      const grid = screen.getByTestId('fourball-hole-grid');
      // 18 rader + 1 header
      const rows = within(grid).getAllByRole('row');
      expect(rows.length).toBe(19);
    });

    it('viser lag-best netto i hver side-celle for spilte hull', () => {
      const holes = [
        makeHole(1, {
          side1BestNet: 4,
          side2BestNet: 5,
          side1ContributorIds: ['u1a'],
          side2ContributorIds: ['u2a'],
          result: 'side1_wins',
        }),
        ...Array.from({ length: 17 }, (_, i) => makeHole(i + 2)),
      ];
      render(
        <FourballMatchplayView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 1,
              holesPlayed: 1,
              holesRemaining: 17,
            }),
          })}
        />,
      );
      const hole1 = screen.getByTestId('fourball-hole-1');
      expect(hole1.dataset.result).toBe('side1_wins');
      // Lag-best 4 (side 1) og 5 (side 2)
      expect(hole1.textContent).toMatch(/4/);
      expect(hole1.textContent).toMatch(/5/);
      // L1 som vinner-indikator
      expect(hole1.textContent).toMatch(/L1/);
    });

    it('viser contributor-initialer som indikator for hvem som hadde lag-best', () => {
      const holes = [
        makeHole(1, {
          side1BestNet: 4,
          side2BestNet: 5,
          // u1a (Alice) er lag-best contributor for side 1
          side1ContributorIds: ['u1a'],
          side2ContributorIds: ['u2a'],
          result: 'side1_wins',
        }),
        ...Array.from({ length: 17 }, (_, i) => makeHole(i + 2)),
      ];
      render(
        <FourballMatchplayView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 1,
              holesPlayed: 1,
              holesRemaining: 17,
            }),
          })}
        />,
      );
      const hole1 = screen.getByTestId('fourball-hole-1');
      // Initial fra Alice (A) bør være med i side1-cellen
      expect(hole1.textContent).toMatch(/A/);
    });

    it('viser «—» når en side er unplayed', () => {
      render(<FourballMatchplayView {...defaultProps()} />);
      const hole1 = screen.getByTestId('fourball-hole-1');
      expect(hole1.dataset.result).toBe('unplayed');
      const dashes = hole1.textContent?.match(/—/g) ?? [];
      // Minst 3 «—» (S1, S2, vinner)
      expect(dashes.length).toBeGreaterThanOrEqual(3);
    });

    it('viser «=» som vinner-indikator for tied hull', () => {
      const holes = [
        makeHole(1, {
          side1BestNet: 4,
          side2BestNet: 4,
          side1ContributorIds: ['u1a'],
          side2ContributorIds: ['u2a'],
          result: 'tied',
        }),
        ...Array.from({ length: 17 }, (_, i) => makeHole(i + 2)),
      ];
      render(
        <FourballMatchplayView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 0,
              holesPlayed: 1,
              holesRemaining: 17,
            }),
          })}
        />,
      );
      const hole1 = screen.getByTestId('fourball-hole-1');
      expect(hole1.dataset.result).toBe('tied');
      expect(hole1.textContent).toMatch(/=/);
    });
  });

  describe('stilling-kolonne (#546)', () => {
    it('viser løpende stilling per spilt hull og «—» for uspilte, uten meta-rad', () => {
      const holes = [
        makeHole(1, {
          side1BestNet: 4,
          side2BestNet: 5,
          result: 'side1_wins',
        }),
        ...Array.from({ length: 17 }, (_, i) => makeHole(i + 2)),
      ];
      render(
        <FourballMatchplayView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 1,
              holesPlayed: 1,
              holesRemaining: 17,
            }),
          })}
        />,
      );
      expect(
        screen.getByTestId('fourball-hole-1').textContent,
      ).toContain('1up');
      expect(
        screen.getByTestId('fourball-hole-2').textContent,
      ).toContain('—');
      expect(screen.queryByTestId('fourball-meta')).not.toBeInTheDocument();
    });
  });

  describe('edge case — defensiv fallback', () => {
    it('viser fallback-melding når result.holes er tomt', () => {
      render(
        <FourballMatchplayView
          {...defaultProps({
            result: makeResult({ holes: [] }),
          })}
        />,
      );
      expect(screen.getByText(/Matchen kan ikke vises/i)).toBeInTheDocument();
      expect(
        screen.getByText(/ikke korrekt fordelt på to lag/i),
      ).toBeInTheDocument();
    });
  });
});
