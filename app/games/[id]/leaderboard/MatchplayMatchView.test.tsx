import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import {
  MatchplayMatchView,
  type MatchplayMatchViewProps,
  type MatchplayPlayerInfo,
} from './MatchplayMatchView';
import type {
  SinglesMatchplayResult,
  MatchplayHoleRow,
  MatchplaySide,
  MatchplayMatchResult,
} from '@/lib/scoring/modes/types';

// SmartLink calls useRouter — stub the navigation context for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSides(): [MatchplaySide, MatchplaySide] {
  return [
    { sideNumber: 1, userId: 'u1', courseHandicap: 12 },
    { sideNumber: 2, userId: 'u2', courseHandicap: 18 },
  ];
}

function makePlayerInfo(): Record<string, MatchplayPlayerInfo> {
  return {
    u1: { name: 'Alice Andersen', nickname: null, courseHandicap: 12 },
    u2: { name: 'Bjørn Berg', nickname: 'Bjørnen', courseHandicap: 18 },
  };
}

/**
 * Bygg en MatchplayHoleRow med default-verdier som er trygge å override.
 * `result` driver hvilke felt som er meningsfulle å overstyre i tester.
 */
function makeHole(
  holeNumber: number,
  overrides: Partial<MatchplayHoleRow> = {},
): MatchplayHoleRow {
  return {
    holeNumber,
    par: 4,
    strokeIndex: holeNumber,
    side1Gross: null,
    side2Gross: null,
    side1Net: null,
    side2Net: null,
    side1Extra: 0,
    side2Extra: 0,
    result: 'unplayed',
    ...overrides,
  };
}

function makeResult(
  overrides: Partial<SinglesMatchplayResult> = {},
): SinglesMatchplayResult {
  return {
    kind: 'singles_matchplay',
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
  overrides: Partial<MatchplayMatchViewProps> = {},
): MatchplayMatchViewProps {
  return {
    gameId: 'g1',
    gameName: 'Matchplay-finale',
    result: makeResult(),
    playerInfo: makePlayerInfo(),
    gameStatus: 'active',
    backHref: '/games/g1',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MatchplayMatchView', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  describe('live state', () => {
    it('viser «Matchen er ikke startet ennå» når 0 hull er spilt', () => {
      render(<MatchplayMatchView {...defaultProps()} />);
      const banner = screen.getByTestId('matchplay-banner-live');
      expect(banner.textContent).toMatch(/ikke startet/i);
    });

    it('viser «X up etter Y hull» når side 1 leder', () => {
      const holes = [
        makeHole(1, {
          side1Gross: 4,
          side2Gross: 5,
          side1Net: 4,
          side2Net: 5,
          result: 'side1_wins',
        }),
        makeHole(2, {
          side1Gross: 4,
          side2Gross: 5,
          side1Net: 4,
          side2Net: 5,
          result: 'side1_wins',
        }),
        makeHole(3, {
          side1Gross: 4,
          side2Gross: 5,
          side1Net: 4,
          side2Net: 5,
          result: 'side1_wins',
        }),
        ...Array.from({ length: 15 }, (_, i) => makeHole(i + 4)),
      ];
      render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 3,
              holesPlayed: 3,
              holesRemaining: 15,
              result: null,
            }),
          })}
        />,
      );
      const banner = screen.getByTestId('matchplay-banner-live');
      expect(banner.textContent).toMatch(/Alice/);
      expect(banner.textContent).toMatch(/leder/);
      expect(banner.textContent).toMatch(/3 up/);
      expect(banner.textContent).toMatch(/Etter 3 hull/);
    });

    it('viser «X up etter Y hull» når side 2 leder (negativ holesUp)', () => {
      const holes = [
        makeHole(1, { side1Gross: 5, side2Gross: 4, side1Net: 5, side2Net: 4, result: 'side2_wins' }),
        makeHole(2, { side1Gross: 5, side2Gross: 4, side1Net: 5, side2Net: 4, result: 'side2_wins' }),
        ...Array.from({ length: 16 }, (_, i) => makeHole(i + 3)),
      ];
      render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: -2,
              holesPlayed: 2,
              holesRemaining: 16,
              result: null,
            }),
          })}
        />,
      );
      const banner = screen.getByTestId('matchplay-banner-live');
      // formatRevealName for Bjørn med kallenavn Bjørnen → 'Bjørn "Bjørnen" Berg'
      expect(banner.textContent).toMatch(/Bjørnen/);
      expect(banner.textContent).toMatch(/leder/);
      expect(banner.textContent).toMatch(/2 up/);
    });

    it('viser «Alt likt etter Y hull» når matchen er tied midt i runden', () => {
      const holes = [
        makeHole(1, { side1Gross: 4, side2Gross: 5, side1Net: 4, side2Net: 5, result: 'side1_wins' }),
        makeHole(2, { side1Gross: 5, side2Gross: 4, side1Net: 5, side2Net: 4, result: 'side2_wins' }),
        ...Array.from({ length: 16 }, (_, i) => makeHole(i + 3)),
      ];
      render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 0,
              holesPlayed: 2,
              holesRemaining: 16,
              result: null,
            }),
          })}
        />,
      );
      const banner = screen.getByTestId('matchplay-banner-live');
      expect(banner.textContent).toMatch(/Alt likt etter 2 hull/);
    });

    it('fyrer IKKE konfetti i live state', async () => {
      const holes = [
        makeHole(1, { side1Gross: 4, side2Gross: 5, side1Net: 4, side2Net: 5, result: 'side1_wins' }),
        ...Array.from({ length: 17 }, (_, i) => makeHole(i + 2)),
      ];
      const { container } = render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 1,
              holesPlayed: 1,
              holesRemaining: 17,
              result: null,
            }),
          })}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
      const pieces = container.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBe(0);
    });
  });

  describe('finished state — vinner', () => {
    function decided(formatted: string, winner: 'side1' | 'side2'): MatchplayMatchResult {
      return {
        winner,
        marginUp: 3,
        decidedAtHole: 16,
        remainingAtDecision: 2,
        formatted,
      };
    }

    it('viser vinner-banner med formattert resultat «3&2» når mat-em', () => {
      render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes: Array.from({ length: 18 }, (_, i) => makeHole(i + 1)),
              holesUp: 3,
              holesPlayed: 16,
              holesRemaining: 2,
              result: decided('3&2', 'side1'),
            }),
            gameStatus: 'finished',
          })}
        />,
      );
      const banner = screen.getByTestId('matchplay-banner-decided');
      expect(banner.textContent).toMatch(/Alice/);
      expect(banner.textContent).toMatch(/vant/);
      expect(banner.textContent).toMatch(/3&2/);
      expect(banner.textContent).toMatch(/Avgjort på hull 16/);
    });

    it('viser vinner-banner med formattert resultat «2up» når spilt ferdig 18', () => {
      render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes: Array.from({ length: 18 }, (_, i) => makeHole(i + 1)),
              holesUp: 2,
              holesPlayed: 18,
              holesRemaining: 0,
              result: {
                winner: 'side2',
                marginUp: 2,
                decidedAtHole: 18,
                remainingAtDecision: 0,
                formatted: '2up',
              },
            }),
            gameStatus: 'finished',
          })}
        />,
      );
      const banner = screen.getByTestId('matchplay-banner-decided');
      expect(banner.textContent).toMatch(/Bjørnen/);
      expect(banner.textContent).toMatch(/2up/);
      expect(banner.textContent).toMatch(/Avgjort på hull 18/);
    });

    it('fyrer konfetti etter useEffect har mountet ved avgjort vinner', async () => {
      const { container } = render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes: Array.from({ length: 18 }, (_, i) => makeHole(i + 1)),
              holesUp: 3,
              holesPlayed: 16,
              holesRemaining: 2,
              result: decided('3&2', 'side1'),
            }),
            gameStatus: 'finished',
          })}
        />,
      );
      await waitFor(() => {
        const pieces = container.querySelectorAll('.confetti-piece');
        expect(pieces.length).toBeGreaterThan(0);
      });
    });

    it('bruker distinkt sessionStorage-key fra solo-stableford-podium', async () => {
      // Pre-set solo-stableford-key — bekrefter at matchplay ikke leser den.
      window.sessionStorage.setItem(
        'torny-stableford-podium-confetti-seen-g1',
        '1',
      );
      const { container } = render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes: Array.from({ length: 18 }, (_, i) => makeHole(i + 1)),
              holesUp: 3,
              holesPlayed: 16,
              holesRemaining: 2,
              result: decided('3&2', 'side1'),
            }),
            gameStatus: 'finished',
          })}
        />,
      );
      await waitFor(() => {
        const pieces = container.querySelectorAll('.confetti-piece');
        expect(pieces.length).toBeGreaterThan(0);
      });
      // Bekreft at matchplay-key nå er satt etter fyringen.
      expect(
        window.sessionStorage.getItem('torny-matchplay-result-confetti-seen-g1'),
      ).toBe('1');
    });

    it('hopper over konfetti hvis matchplay-key allerede er satt for samme gameId', async () => {
      window.sessionStorage.setItem(
        'torny-matchplay-result-confetti-seen-g1',
        '1',
      );
      const { container } = render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes: Array.from({ length: 18 }, (_, i) => makeHole(i + 1)),
              holesUp: 3,
              holesPlayed: 16,
              holesRemaining: 2,
              result: decided('3&2', 'side1'),
            }),
            gameStatus: 'finished',
          })}
        />,
      );
      await new Promise((r) => setTimeout(r, 50));
      const pieces = container.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBe(0);
    });
  });

  describe('finished state — AS (uavgjort)', () => {
    it('viser «AS»-banner uten konfetti', async () => {
      const { container } = render(
        <MatchplayMatchView
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
      const banner = screen.getByTestId('matchplay-banner-tied');
      expect(banner.textContent).toMatch(/AS/);
      expect(banner.textContent).toMatch(/All square etter 18 hull/);
      // Ingen konfetti ved AS — kun ved decided winner.
      await new Promise((r) => setTimeout(r, 50));
      const pieces = container.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBe(0);
    });
  });

  describe('sider-header', () => {
    it('viser begge sider med navn og HCP fra playerInfo', () => {
      render(<MatchplayMatchView {...defaultProps()} />);
      const side1 = screen.getByTestId('matchplay-side-1');
      const side2 = screen.getByTestId('matchplay-side-2');
      expect(side1.textContent).toMatch(/Alice Andersen/);
      expect(side1.textContent).toMatch(/HCP 12/);
      expect(side2.textContent).toMatch(/Bjørnen/);
      expect(side2.textContent).toMatch(/HCP 18/);
    });

    it('faller tilbake til «(ukjent spiller)» når playerInfo mangler', () => {
      render(
        <MatchplayMatchView
          {...defaultProps({ playerInfo: {} })}
        />,
      );
      const side1 = screen.getByTestId('matchplay-side-1');
      expect(side1.textContent).toMatch(/\(ukjent spiller\)/);
    });
  });

  describe('per-hull-grid', () => {
    it('rendrer en rad per hull i result.holes', () => {
      render(<MatchplayMatchView {...defaultProps()} />);
      const grid = screen.getByTestId('matchplay-hole-grid');
      // 18 rader + 1 header
      const rows = within(grid).getAllByRole('row');
      expect(rows.length).toBe(19);
    });

    it('viser «—» i begge gross-celler for uplayed hull og «—» som vinner', () => {
      render(<MatchplayMatchView {...defaultProps()} />);
      const hole1 = screen.getByTestId('matchplay-hole-1');
      expect(hole1.dataset.result).toBe('unplayed');
      // Telle minst 3 «—» (S1, S2, Vinner-celle).
      const dashes = hole1.textContent?.match(/—/g) ?? [];
      expect(dashes.length).toBeGreaterThanOrEqual(3);
    });

    it('viser «=» som vinner-indikator for tied hull', () => {
      const holes = [
        makeHole(1, {
          side1Gross: 4,
          side2Gross: 4,
          side1Net: 4,
          side2Net: 4,
          result: 'tied',
        }),
        ...Array.from({ length: 17 }, (_, i) => makeHole(i + 2)),
      ];
      render(
        <MatchplayMatchView
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
      const hole1 = screen.getByTestId('matchplay-hole-1');
      expect(hole1.dataset.result).toBe('tied');
      expect(hole1.textContent).toMatch(/=/);
    });

    it('viser «S1»/«S2» som vinner-indikator når en side vinner hullet', () => {
      const holes = [
        makeHole(1, {
          side1Gross: 4,
          side2Gross: 5,
          side1Net: 4,
          side2Net: 5,
          result: 'side1_wins',
        }),
        makeHole(2, {
          side1Gross: 5,
          side2Gross: 4,
          side1Net: 5,
          side2Net: 4,
          result: 'side2_wins',
        }),
        ...Array.from({ length: 16 }, (_, i) => makeHole(i + 3)),
      ];
      render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 0,
              holesPlayed: 2,
              holesRemaining: 16,
            }),
          })}
        />,
      );
      const hole1 = screen.getByTestId('matchplay-hole-1');
      const hole2 = screen.getByTestId('matchplay-hole-2');
      expect(hole1.textContent).toMatch(/S1/);
      expect(hole2.textContent).toMatch(/S2/);
    });

    it('viser netto-tall (Nnet) når en side har extra strokes på hullet', () => {
      const holes = [
        makeHole(1, {
          side1Gross: 5,
          side2Gross: 6,
          side1Net: 4, // 5 - 1 extra
          side2Net: 6,
          side1Extra: 1,
          side2Extra: 0,
          result: 'side1_wins',
        }),
        ...Array.from({ length: 17 }, (_, i) => makeHole(i + 2)),
      ];
      render(
        <MatchplayMatchView
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
      const hole1 = screen.getByTestId('matchplay-hole-1');
      // Side 1 har gross 5 + (4N) — netto-vises som "(4N)"
      expect(hole1.textContent).toMatch(/5/);
      expect(hole1.textContent).toMatch(/4N/);
    });

    it('rendrer 9-hulls-bane med kun 9 grid-rader', () => {
      const holes = Array.from({ length: 9 }, (_, i) => makeHole(i + 1));
      render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({ holes }),
          })}
        />,
      );
      const grid = screen.getByTestId('matchplay-hole-grid');
      const rows = within(grid).getAllByRole('row');
      // 9 datarader + 1 header
      expect(rows.length).toBe(10);
    });
  });

  describe('match-meta', () => {
    it('viser Spilt / Igjen / Status med korrekte tall', () => {
      const holes = [
        makeHole(1, { side1Gross: 4, side2Gross: 5, side1Net: 4, side2Net: 5, result: 'side1_wins' }),
        makeHole(2, { side1Gross: 5, side2Gross: 5, side1Net: 5, side2Net: 5, result: 'tied' }),
        ...Array.from({ length: 16 }, (_, i) => makeHole(i + 3)),
      ];
      render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({
              holes,
              holesUp: 1,
              holesPlayed: 2,
              holesRemaining: 16,
            }),
          })}
        />,
      );
      const meta = screen.getByTestId('matchplay-meta');
      expect(meta.textContent).toMatch(/Spilt/);
      expect(meta.textContent).toMatch(/2/);
      expect(meta.textContent).toMatch(/Igjen/);
      expect(meta.textContent).toMatch(/16/);
      expect(meta.textContent).toMatch(/Status/);
      expect(meta.textContent).toMatch(/1 up/);
    });

    it('viser «AS» som Status når holesUp er 0', () => {
      render(<MatchplayMatchView {...defaultProps()} />);
      const meta = screen.getByTestId('matchplay-meta');
      expect(meta.textContent).toMatch(/AS/);
    });
  });

  describe('edge case — defensiv fallback', () => {
    it('viser fallback-melding når result.holes er tomt', () => {
      render(
        <MatchplayMatchView
          {...defaultProps({
            result: makeResult({ holes: [] }),
          })}
        />,
      );
      expect(screen.getByText(/Matchen kan ikke vises/i)).toBeInTheDocument();
      expect(
        screen.getByText(/ikke korrekt fordelt på to sider/i),
      ).toBeInTheDocument();
    });
  });
});
