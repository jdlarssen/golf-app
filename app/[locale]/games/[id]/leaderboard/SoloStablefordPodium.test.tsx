import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import {
  SoloStablefordPodium,
  type SoloStablefordPodiumProps,
} from './SoloStablefordPodium';
import type {
  SoloStablefordPlayerInfo,
} from './SoloStablefordView';
import type { StablefordSoloResult } from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeResult(
  players: Array<{
    userId: string;
    totalPoints: number;
    rank: number;
    holesPlayed: number;
  }>,
): StablefordSoloResult {
  return {
    kind: 'stableford',
    variant: 'solo',
    players: players.map((p) => ({ ...p, tiedWith: [] })),
    // Per-hull-data brukes ikke av SoloStablefordPodium (topp-3-podium) — den
    // format-bevisste «Hull for hull»-flaten har egen render-test (#496).
    holes: [],
  };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, SoloStablefordPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function defaultProps(
  overrides: Partial<SoloStablefordPodiumProps> = {},
): SoloStablefordPodiumProps {
  return {
    gameId: 'g1',
    gameName: 'Sommerturnering',
    result: makeResult([
      { userId: 'u1', totalPoints: 38, rank: 1, holesPlayed: 18 },
      { userId: 'u2', totalPoints: 32, rank: 2, holesPlayed: 18 },
      { userId: 'u3', totalPoints: 28, rank: 3, holesPlayed: 18 },
      { userId: 'u4', totalPoints: 24, rank: 4, holesPlayed: 17 },
      { userId: 'u5', totalPoints: 20, rank: 5, holesPlayed: 16 },
    ]),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
      ['u5', 'Eva Eide', null],
    ]),
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('SoloStablefordPodium', () => {
  it('rendrer 3-trinns podium med 1., 2. og 3. plass når vi har 3+ spillere', () => {
    render(<SoloStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-podium');
    expect(podium).toBeInTheDocument();

    expect(within(podium).getByTestId('podium-rank-1')).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-2')).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-3')).toBeInTheDocument();
  });

  it('viser vinneren med poeng-total og navn på 1.-plassen', () => {
    render(<SoloStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.textContent).toContain('38');
    expect(winner.textContent).toContain('Alice Andersen');
  });

  it('viser «X hull spilt»-chip per trinn på podiet', () => {
    render(<SoloStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.textContent).toMatch(/18 hull/);
  });

  it('rendrer ConfettiBurst på 1.-plass etter useEffect har mountet', async () => {
    // Sørg for at sessionStorage er tom slik at useEffect ikke skipper.
    window.sessionStorage.clear();
    render(<SoloStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-podium');
    // useEffect setter replayKey > 0 etter mount → ConfettiBurst rendres
    // med `confetti-piece`-elementer. waitFor håndterer effect-flushing.
    await waitFor(() => {
      const pieces = podium.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBeGreaterThan(0);
    });
  });

  it('vinneren får champagne accent (border-accent), 2.-plass får sølv-disclousure', () => {
    render(<SoloStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.className).toMatch(/border-accent/);
  });

  it('collapsed <details> for rank 4+ er rendret og lukket by default', () => {
    render(<SoloStablefordPodium {...defaultProps()} />);
    const details = screen.getByTestId('stableford-rest');
    expect(details.tagName).toBe('DETAILS');
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(details.textContent).toMatch(/Se hele rangeringen/i);
    expect(details.textContent).toContain('5 spillere');
  });

  it('rest-listen inneholder rank 4+ med navn og poeng', () => {
    render(<SoloStablefordPodium {...defaultProps()} />);
    const details = screen.getByTestId('stableford-rest');
    expect(details.textContent).toContain('David Dahl');
    expect(details.textContent).toContain('Eva Eide');
    expect(details.textContent).toContain('24');
    expect(details.textContent).toContain('20');
  });

  it('rest-listen rendres IKKE når det er ≤3 spillere', () => {
    render(
      <SoloStablefordPodium
        {...defaultProps({
          result: makeResult([
            { userId: 'u1', totalPoints: 30, rank: 1, holesPlayed: 18 },
            { userId: 'u2', totalPoints: 25, rank: 2, holesPlayed: 18 },
            { userId: 'u3', totalPoints: 20, rank: 3, holesPlayed: 18 },
          ]),
        })}
      />,
    );
    expect(screen.queryByTestId('stableford-rest')).toBeNull();
  });

  it('podium med 2 spillere viser kun 1. og 2.-plass (ingen 3.-trinn)', () => {
    render(
      <SoloStablefordPodium
        {...defaultProps({
          result: makeResult([
            { userId: 'u1', totalPoints: 30, rank: 1, holesPlayed: 18 },
            { userId: 'u2', totalPoints: 25, rank: 2, holesPlayed: 18 },
          ]),
        })}
      />,
    );
    const podium = screen.getByTestId('stableford-podium');
    expect(within(podium).getByTestId('podium-rank-1')).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-2')).toBeInTheDocument();
    expect(within(podium).queryByTestId('podium-rank-3')).toBeNull();
  });

  it('podium med 1 spiller viser kun 1.-plass', () => {
    render(
      <SoloStablefordPodium
        {...defaultProps({
          result: makeResult([
            { userId: 'u1', totalPoints: 30, rank: 1, holesPlayed: 18 },
          ]),
        })}
      />,
    );
    const podium = screen.getByTestId('stableford-podium');
    expect(within(podium).getByTestId('podium-rank-1')).toBeInTheDocument();
    expect(within(podium).queryByTestId('podium-rank-2')).toBeNull();
    expect(within(podium).queryByTestId('podium-rank-3')).toBeNull();
  });

  it('viser «Ingen spillere å vise»-tekst når result.players er tomt', () => {
    render(
      <SoloStablefordPodium
        {...defaultProps({ result: makeResult([]) })}
      />,
    );
    expect(screen.getByText(/Ingen spillere å vise/i)).toBeInTheDocument();
  });

  it('formatRevealName brukes — Bjørn Berg vises som «Bjørnen» (kallenavn)', () => {
    render(<SoloStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-podium');
    const second = within(podium).getByTestId('podium-rank-2');
    expect(second.textContent).toMatch(/Bjørnen/);
  });

  it('faller tilbake til «(ukjent spiller)» hvis info mangler', () => {
    render(
      <SoloStablefordPodium
        {...defaultProps({
          result: makeResult([
            { userId: 'unknown', totalPoints: 10, rank: 1, holesPlayed: 5 },
          ]),
          playersById: new Map(),
        })}
      />,
    );
    expect(screen.getByText('(ukjent spiller)')).toBeInTheDocument();
  });
});
