import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import {
  SoloStrokeplayPodium,
  type SoloStrokeplayPodiumProps,
} from './SoloStrokeplayPodium';
import type {
  SoloStrokeplayPlayerInfo,
} from './SoloStrokeplayView';
import type { SoloStrokeplayResult } from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeResult(
  players: Array<{
    userId: string;
    totalNetStrokes: number;
    totalGrossStrokes: number;
    rank: number;
    holesPlayed: number;
  }>,
): SoloStrokeplayResult {
  return {
    kind: 'solo_strokeplay',
    players: players.map((p) => ({ ...p, tiedWith: [] })),
    // Per-hull-data brukes ikke av SoloStrokeplayPodium (topp-3-podium) — den
    // format-bevisste «Hull for hull»-flaten har egen render-test (#496).
    holes: [],
  };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, SoloStrokeplayPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function defaultProps(
  overrides: Partial<SoloStrokeplayPodiumProps> = {},
): SoloStrokeplayPodiumProps {
  return {
    gameId: 'g1',
    gameName: 'Sommerturnering',
    result: makeResult([
      { userId: 'u1', totalNetStrokes: 68, totalGrossStrokes: 78, rank: 1, holesPlayed: 18 },
      { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 82, rank: 2, holesPlayed: 18 },
      { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 80, rank: 3, holesPlayed: 18 },
      { userId: 'u4', totalNetStrokes: 80, totalGrossStrokes: 88, rank: 4, holesPlayed: 17 },
      { userId: 'u5', totalNetStrokes: 85, totalGrossStrokes: 93, rank: 5, holesPlayed: 16 },
    ]),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
      ['u5', 'Eva Eide', null],
    ]),
    holesPlayed: 18,
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('SoloStrokeplayPodium', () => {
  it('rendrer 3-trinns podium med 1., 2. og 3. plass når vi har 3+ spillere', () => {
    // Clear sessionStorage så ikke confetti-effect leker mellom tester.
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const podium = screen.getByTestId('strokeplay-podium');
    expect(podium).toBeInTheDocument();

    expect(within(podium).getByTestId('podium-rank-1')).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-2')).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-3')).toBeInTheDocument();
  });

  it('viser vinneren med netto-slag-total og navn på 1.-plassen', () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const podium = screen.getByTestId('strokeplay-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.textContent).toContain('68');
    expect(winner.textContent).toContain('Alice Andersen');
  });

  it('viser «slag»-label (ikke «poeng») på podium-trinnene', () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const podium = screen.getByTestId('strokeplay-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.textContent).toMatch(/slag/i);
    expect(winner.textContent).not.toMatch(/poeng/i);
  });

  it('viser «X hull»-chip per trinn på podiet', () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const podium = screen.getByTestId('strokeplay-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.textContent).toMatch(/18 hull/);
  });

  it('rendrer ConfettiBurst på 1.-plass etter useEffect har mountet', async () => {
    // Sørg for at sessionStorage er tom slik at useEffect ikke skipper.
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const podium = screen.getByTestId('strokeplay-podium');
    // useEffect setter replayKey > 0 etter mount → ConfettiBurst rendres
    // med `confetti-piece`-elementer. waitFor håndterer effect-flushing.
    await waitFor(() => {
      const pieces = podium.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBeGreaterThan(0);
    });
  });

  it('konfetti-sessionStorage-key er distinkt fra solo-stableford-podiet', async () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    await waitFor(() => {
      // Skal være satt med solo-strokeplay-prefiks
      expect(
        window.sessionStorage.getItem('torny-solo-strokeplay-podium-confetti-seen-g1'),
      ).toBe('1');
    });
    // Skal IKKE kollidere med stableford-key
    expect(
      window.sessionStorage.getItem('torny-stableford-podium-confetti-seen-g1'),
    ).toBeNull();
  });

  it('konfetti fyrer ikke når sessionStorage allerede har set-flagg for samme gameId', async () => {
    window.sessionStorage.clear();
    // Pre-set flagget — simulerer at brukeren har sett podiet før.
    window.sessionStorage.setItem('torny-solo-strokeplay-podium-confetti-seen-g1', '1');
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const podium = screen.getByTestId('strokeplay-podium');
    // Vent litt for å gi useEffect tid til å kjøre. Forventer null confetti-pieces.
    await new Promise((r) => setTimeout(r, 50));
    expect(podium.querySelectorAll('.confetti-piece').length).toBe(0);
  });

  it('vinneren får champagne accent (border-accent)', () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const podium = screen.getByTestId('strokeplay-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.className).toMatch(/border-accent/);
  });

  it('collapsed <details> for rank 4+ er rendret og lukket by default', () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const details = screen.getByTestId('strokeplay-rest');
    expect(details.tagName).toBe('DETAILS');
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(details.textContent).toMatch(/Se hele rangeringen/i);
    expect(details.textContent).toContain('5 spillere');
  });

  it('rest-listen inneholder rank 4+ med navn, netto og brutto', () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const details = screen.getByTestId('strokeplay-rest');
    expect(details.textContent).toContain('David Dahl');
    expect(details.textContent).toContain('Eva Eide');
    // Netto-total for rank 4 og 5
    expect(details.textContent).toContain('80');
    expect(details.textContent).toContain('85');
    // Brutto-total for rank 4 og 5 (vises som «N brutto»)
    expect(details.textContent).toContain('88 brutto');
    expect(details.textContent).toContain('93 brutto');
  });

  it('rest-listen rendres IKKE når det er ≤3 spillere', () => {
    window.sessionStorage.clear();
    render(
      <SoloStrokeplayPodium
        {...defaultProps({
          result: makeResult([
            { userId: 'u1', totalNetStrokes: 68, totalGrossStrokes: 78, rank: 1, holesPlayed: 18 },
            { userId: 'u2', totalNetStrokes: 72, totalGrossStrokes: 82, rank: 2, holesPlayed: 18 },
            { userId: 'u3', totalNetStrokes: 75, totalGrossStrokes: 80, rank: 3, holesPlayed: 18 },
          ]),
        })}
      />,
    );
    expect(screen.queryByTestId('strokeplay-rest')).toBeNull();
  });

  it('podium med 2 spillere viser kun 1. og 2.-plass (ingen 3.-trinn)', () => {
    window.sessionStorage.clear();
    render(
      <SoloStrokeplayPodium
        {...defaultProps({
          result: makeResult([
            { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 78, rank: 1, holesPlayed: 18 },
            { userId: 'u2', totalNetStrokes: 75, totalGrossStrokes: 82, rank: 2, holesPlayed: 18 },
          ]),
        })}
      />,
    );
    const podium = screen.getByTestId('strokeplay-podium');
    expect(within(podium).getByTestId('podium-rank-1')).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-2')).toBeInTheDocument();
    expect(within(podium).queryByTestId('podium-rank-3')).toBeNull();
  });

  it('podium med 1 spiller viser kun 1.-plass', () => {
    window.sessionStorage.clear();
    render(
      <SoloStrokeplayPodium
        {...defaultProps({
          result: makeResult([
            { userId: 'u1', totalNetStrokes: 70, totalGrossStrokes: 78, rank: 1, holesPlayed: 18 },
          ]),
        })}
      />,
    );
    const podium = screen.getByTestId('strokeplay-podium');
    expect(within(podium).getByTestId('podium-rank-1')).toBeInTheDocument();
    expect(within(podium).queryByTestId('podium-rank-2')).toBeNull();
    expect(within(podium).queryByTestId('podium-rank-3')).toBeNull();
  });

  it('viser «Ingen spillere å vise»-tekst når result.players er tomt', () => {
    window.sessionStorage.clear();
    render(
      <SoloStrokeplayPodium
        {...defaultProps({ result: makeResult([]) })}
      />,
    );
    expect(screen.getByText(/Ingen spillere å vise/i)).toBeInTheDocument();
  });

  it('formatRevealName brukes — Bjørn Berg vises som «Bjørnen» (kallenavn)', () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const podium = screen.getByTestId('strokeplay-podium');
    const second = within(podium).getByTestId('podium-rank-2');
    expect(second.textContent).toMatch(/Bjørnen/);
  });

  it('faller tilbake til «(ukjent spiller)» hvis info mangler', () => {
    window.sessionStorage.clear();
    render(
      <SoloStrokeplayPodium
        {...defaultProps({
          result: makeResult([
            { userId: 'unknown', totalNetStrokes: 70, totalGrossStrokes: 80, rank: 1, holesPlayed: 18 },
          ]),
          playersById: new Map(),
        })}
      />,
    );
    expect(screen.getByText('(ukjent spiller)')).toBeInTheDocument();
  });

  it('header-sub-tittel inneholder «Slagspill»', () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    expect(screen.getByText(/Slagspill/i)).toBeInTheDocument();
  });

  it('rangering er allerede lavest-først (Alice øverst med 68)', () => {
    window.sessionStorage.clear();
    render(<SoloStrokeplayPodium {...defaultProps()} />);
    const podium = screen.getByTestId('strokeplay-podium');
    const first = within(podium).getByTestId('podium-rank-1');
    const second = within(podium).getByTestId('podium-rank-2');
    const third = within(podium).getByTestId('podium-rank-3');
    expect(first.textContent).toMatch(/68/);
    expect(second.textContent).toMatch(/72/);
    expect(third.textContent).toMatch(/75/);
  });
});
