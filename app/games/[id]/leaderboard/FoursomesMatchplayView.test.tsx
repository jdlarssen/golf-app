import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  FoursomesMatchplayView,
  type FoursomesMatchplayViewProps,
  type FoursomesPlayerInfo,
} from './FoursomesMatchplayView';
import type {
  FoursomesMatchplayResult,
  FoursomesHoleRow,
  FoursomesSide,
} from '@/lib/scoring/modes/types';

// SmartLink calls useRouter — stub the navigation context for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSides(): [FoursomesSide, FoursomesSide] {
  return [
    {
      sideNumber: 1,
      players: [
        { userId: 'u1a', courseHandicap: 12 },
        { userId: 'u1b', courseHandicap: 18 },
      ],
      captainUserId: 'u1a',
      combinedCourseHandicap: 30,
      effectiveExtraHandicap: 0,
    },
    {
      sideNumber: 2,
      players: [
        { userId: 'u2a', courseHandicap: 8 },
        { userId: 'u2b', courseHandicap: 22 },
      ],
      captainUserId: 'u2a',
      combinedCourseHandicap: 30,
      effectiveExtraHandicap: 4,
    },
  ];
}

function makePlayerInfo(): Record<string, FoursomesPlayerInfo> {
  return {
    u1a: { name: 'Alice Andersen', nickname: null, courseHandicap: 12 },
    u1b: { name: 'Anders Aas', nickname: null, courseHandicap: 18 },
    u2a: { name: 'Bjørn Berg', nickname: 'Bjørnen', courseHandicap: 8 },
    u2b: { name: 'Berit Bø', nickname: null, courseHandicap: 22 },
  };
}

function makeHole(
  holeNumber: number,
  overrides: Partial<FoursomesHoleRow> = {},
): FoursomesHoleRow {
  return {
    holeNumber,
    par: 4,
    side1Par: 4,
    side2Par: 4,
    strokeIndex: holeNumber,
    side1Gross: null,
    side2Gross: null,
    side1Extra: 0,
    side2Extra: 0,
    side1Net: null,
    side2Net: null,
    result: 'unplayed',
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<FoursomesMatchplayResult> = {},
): FoursomesMatchplayResult {
  return {
    kind: 'foursomes_matchplay',
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
  overrides: Partial<FoursomesMatchplayViewProps> = {},
): FoursomesMatchplayViewProps {
  return {
    gameId: 'g1',
    gameName: 'Foursomes-finale',
    result: makeResult(),
    playerInfo: makePlayerInfo(),
    formatLabel: 'Foursomes',
    gameStatus: 'active',
    backHref: '/games/g1',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FoursomesMatchplayView', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  describe('format-label', () => {
    it('viser formatLabel i overskriften', () => {
      render(<FoursomesMatchplayView {...defaultProps({ formatLabel: 'Gruesome' })} />);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Gruesome/);
    });

    it('viser alternativ formatLabel «Greensome»', () => {
      render(<FoursomesMatchplayView {...defaultProps({ formatLabel: 'Greensome' })} />);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Greensome/);
    });
  });

  describe('lag-header', () => {
    it('viser begge lag med 2 spillere, generisk «Lag 1»/«Lag 2» når labels ikke er gitt', () => {
      render(<FoursomesMatchplayView {...defaultProps()} />);
      const side1 = screen.getByTestId('foursomes-side-1');
      const side2 = screen.getByTestId('foursomes-side-2');
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
        <FoursomesMatchplayView
          {...defaultProps({
            side1Label: 'Lag Skog',
            side2Label: 'Lag Sjø',
          })}
        />,
      );
      const side1 = screen.getByTestId('foursomes-side-1');
      const side2 = screen.getByTestId('foursomes-side-2');
      expect(side1.textContent).toMatch(/Lag Skog/);
      expect(side2.textContent).toMatch(/Lag Sjø/);
    });

    it('viser lag-nivå combinedCourseHandicap på lag 1', () => {
      render(<FoursomesMatchplayView {...defaultProps()} />);
      const side1 = screen.getByTestId('foursomes-side-1');
      // combinedCourseHandicap = 30
      expect(side1.textContent).toMatch(/Lag-HCP: 30/);
    });

    it('viser effectiveExtraHandicap som slag-bonus på laget som får ekstra', () => {
      render(<FoursomesMatchplayView {...defaultProps()} />);
      const side2 = screen.getByTestId('foursomes-side-2');
      // effectiveExtraHandicap = 4 → «+4 slag»
      expect(side2.textContent).toMatch(/\+4 slag/);
    });
  });

  describe('status-banner', () => {
    it('viser «Matchen er ikke startet ennå» når 0 hull er spilt', () => {
      render(<FoursomesMatchplayView {...defaultProps()} />);
      const banner = screen.getByTestId('foursomes-banner-live');
      expect(banner.textContent).toMatch(/ikke startet/i);
    });

    it('viser «Lag 1 leder X up» når lag 1 leder live', () => {
      const holes = [
        makeHole(1, { side1Net: 4, side2Net: 5, result: 'side1_wins' }),
        makeHole(2, { side1Net: 4, side2Net: 5, result: 'side1_wins' }),
        ...Array.from({ length: 16 }, (_, i) => makeHole(i + 3)),
      ];
      render(
        <FoursomesMatchplayView
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
      const banner = screen.getByTestId('foursomes-status-banner');
      expect(banner.textContent).toMatch(/Lag 1/);
      expect(banner.textContent).toMatch(/leder/);
      expect(banner.textContent).toMatch(/2 up/);
    });

    it('viser avgjort banner med vinner-label når matchen er ferdig (decided)', () => {
      render(
        <FoursomesMatchplayView
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
      const banner = screen.getByTestId('foursomes-banner-decided');
      expect(banner.textContent).toMatch(/Lag 2/);
      expect(banner.textContent).toMatch(/vant/);
      expect(banner.textContent).toMatch(/3&2/);
    });

    it('viser AS-banner uten konfetti når matchen ender uavgjort', () => {
      const { container } = render(
        <FoursomesMatchplayView
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
      const banner = screen.getByTestId('foursomes-banner-tied');
      expect(banner.textContent).toMatch(/AS/);
      // Ingen konfetti ved AS
      const pieces = container.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBe(0);
    });
  });

  describe('per-hull-grid', () => {
    it('rendrer en rad per hull i result.holes', () => {
      render(<FoursomesMatchplayView {...defaultProps()} />);
      const grid = screen.getByTestId('foursomes-hole-grid');
      // 18 rader + 1 header
      const rows = within(grid).getAllByRole('row');
      expect(rows.length).toBe(19);
    });

    it('har foursomes-hole-{n} testid for hvert hull', () => {
      render(<FoursomesMatchplayView {...defaultProps()} />);
      for (let n = 1; n <= 18; n++) {
        expect(screen.getByTestId(`foursomes-hole-${n}`)).toBeInTheDocument();
      }
    });

    it('viser netto per side og vinner-indikator for spilte hull', () => {
      const holes = [
        makeHole(1, { side1Net: 4, side2Net: 5, side1Gross: 5, side2Gross: 6, result: 'side1_wins' }),
        ...Array.from({ length: 17 }, (_, i) => makeHole(i + 2)),
      ];
      render(
        <FoursomesMatchplayView
          {...defaultProps({
            result: makeResult({ holes, holesUp: 1, holesPlayed: 1, holesRemaining: 17 }),
          })}
        />,
      );
      const hole1 = screen.getByTestId('foursomes-hole-1');
      expect(hole1.dataset.result).toBe('side1_wins');
      expect(hole1.textContent).toMatch(/4/);
      expect(hole1.textContent).toMatch(/5/);
      expect(hole1.textContent).toMatch(/L1/);
    });

    it('viser «—» når en side er unplayed', () => {
      render(<FoursomesMatchplayView {...defaultProps()} />);
      const hole1 = screen.getByTestId('foursomes-hole-1');
      expect(hole1.dataset.result).toBe('unplayed');
      const dashes = hole1.textContent?.match(/—/g) ?? [];
      // Minst 3 «—» (S1, S2, vinner)
      expect(dashes.length).toBeGreaterThanOrEqual(3);
    });

    it('viser «=» som vinner-indikator for tied hull', () => {
      const holes = [
        makeHole(1, { side1Net: 4, side2Net: 4, result: 'tied' }),
        ...Array.from({ length: 17 }, (_, i) => makeHole(i + 2)),
      ];
      render(
        <FoursomesMatchplayView
          {...defaultProps({
            result: makeResult({ holes, holesUp: 0, holesPlayed: 1, holesRemaining: 17 }),
          })}
        />,
      );
      const hole1 = screen.getByTestId('foursomes-hole-1');
      expect(hole1.dataset.result).toBe('tied');
      expect(hole1.textContent).toMatch(/=/);
    });
  });

  describe('edge case — defensiv fallback', () => {
    it('viser fallback-melding når result.holes er tomt', () => {
      render(
        <FoursomesMatchplayView
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
