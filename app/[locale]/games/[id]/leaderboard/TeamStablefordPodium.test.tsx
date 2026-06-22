import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import {
  TeamStablefordPodium,
  type TeamStablefordPodiumProps,
} from './TeamStablefordPodium';
import type { SoloStablefordPlayerInfo } from './SoloStablefordView';
import type {
  StablefordTeamResult,
  StablefordTeamLine,
} from '@/lib/scoring/modes/types';

// SmartLink kaller useRouter — stub navigasjons-konteksten for jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

function makeTeamLine(args: {
  teamNumber: number;
  playerIds: string[];
  totalPoints: number;
  rank: number;
  tiedWith?: number[];
}): StablefordTeamLine {
  return {
    teamNumber: args.teamNumber,
    playerIds: args.playerIds,
    holes: [],
    totalPoints: args.totalPoints,
    rank: args.rank,
    tiedWith: args.tiedWith ?? [],
  };
}

function makeResult(teams: StablefordTeamLine[]): StablefordTeamResult {
  return { kind: 'stableford', variant: 'team', teams };
}

function makePlayers(
  rows: Array<[string, string, string | null]>,
): Map<string, SoloStablefordPlayerInfo> {
  return new Map(
    rows.map(([userId, name, nickname]) => [userId, { name, nickname }]),
  );
}

function defaultProps(
  overrides: Partial<TeamStablefordPodiumProps> = {},
): TeamStablefordPodiumProps {
  return {
    gameId: 'g1',
    gameName: 'Sommerturnering',
    result: makeResult([
      makeTeamLine({
        teamNumber: 1,
        playerIds: ['u1', 'u2'],
        totalPoints: 42,
        rank: 1,
      }),
      makeTeamLine({
        teamNumber: 2,
        playerIds: ['u3', 'u4'],
        totalPoints: 36,
        rank: 2,
      }),
      makeTeamLine({
        teamNumber: 3,
        playerIds: ['u5', 'u6'],
        totalPoints: 28,
        rank: 3,
      }),
      makeTeamLine({
        teamNumber: 4,
        playerIds: ['u7', 'u8'],
        totalPoints: 24,
        rank: 4,
      }),
    ]),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
      ['u5', 'Erik Eriksen', null],
      ['u6', 'Frida Frost', null],
      ['u7', 'Gunnar Gran', null],
      ['u8', 'Hilde Hansen', null],
    ]),
    holesPlayed: 18,
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('TeamStablefordPodium', () => {
  it('rendrer 3-trinns podium når vi har 3+ lag', () => {
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    expect(podium).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-1')).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-2')).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-3')).toBeInTheDocument();
  });

  it('1.-plassen viser Lag N + begge partnernes fornavn', () => {
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.textContent).toContain('Lag 1');
    expect(winner.textContent).toContain('Alice');
    expect(winner.textContent).toContain('Bjørn');
  });

  it('2.-plassen viser Lag N + partnernavn', () => {
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    const second = within(podium).getByTestId('podium-rank-2');
    expect(second.textContent).toContain('Lag 2');
    expect(second.textContent).toContain('Camilla');
    expect(second.textContent).toContain('David');
  });

  it('3.-plassen viser Lag N + partnernavn', () => {
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    const third = within(podium).getByTestId('podium-rank-3');
    expect(third.textContent).toContain('Lag 3');
    expect(third.textContent).toContain('Erik');
    expect(third.textContent).toContain('Frida');
  });

  it('fyrer ConfettiBurst på 1.-plass etter useEffect har mountet', async () => {
    window.sessionStorage.clear();
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    await waitFor(() => {
      const pieces = podium.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBeGreaterThan(0);
    });
  });

  it('bruker distinkt sessionStorage-key fra solo-podium (par-stableford-prefiks)', async () => {
    // Pre-set solo-key — bekrefter at team-podium ikke leser den.
    window.sessionStorage.clear();
    window.sessionStorage.setItem(
      'torny-stableford-podium-confetti-seen-g1',
      '1',
    );
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    // Team-podium skal fortsatt fyre konfetti — solo-key skal ikke blokkere.
    await waitFor(() => {
      const pieces = podium.querySelectorAll('.confetti-piece');
      expect(pieces.length).toBeGreaterThan(0);
    });
    // Bekreft at team-key nå er satt etter fyringen.
    expect(
      window.sessionStorage.getItem('torny-par-stableford-podium-confetti-seen-g1'),
    ).toBe('1');
  });

  it('hopper over konfetti hvis team-key allerede er satt for samme gameId', async () => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(
      'torny-par-stableford-podium-confetti-seen-g1',
      '1',
    );
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    // Lite tidsvindu for at en eventuell ConfettiBurst skulle ha mounted —
    // sjekk at det ikke er noen pieces. (Vi bruker en kort waitFor for å
    // gi React tid til å committe useEffect, men feiler hvis pieces dukker opp.)
    await new Promise((r) => setTimeout(r, 50));
    const pieces = podium.querySelectorAll('.confetti-piece');
    expect(pieces.length).toBe(0);
  });

  it('vinnerlagets card har champagne accent (border-accent)', () => {
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.className).toMatch(/border-accent/);
  });

  it('rest-listen rendres som collapsed <details> med rank 4+', () => {
    render(<TeamStablefordPodium {...defaultProps()} />);
    const details = screen.getByTestId('stableford-team-rest');
    expect(details.tagName).toBe('DETAILS');
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(details.textContent).toMatch(/Se hele rangeringen/i);
    expect(details.textContent).toContain('4 lag');
    expect(details.textContent).toContain('Lag 4');
    expect(details.textContent).toContain('24');
    expect(details.textContent).toContain('Gunnar');
    expect(details.textContent).toContain('Hilde');
  });

  it('rest-listen rendres IKKE når det er ≤3 lag', () => {
    render(
      <TeamStablefordPodium
        {...defaultProps({
          result: makeResult([
            makeTeamLine({
              teamNumber: 1,
              playerIds: ['u1', 'u2'],
              totalPoints: 30,
              rank: 1,
            }),
            makeTeamLine({
              teamNumber: 2,
              playerIds: ['u3', 'u4'],
              totalPoints: 25,
              rank: 2,
            }),
            makeTeamLine({
              teamNumber: 3,
              playerIds: ['u5', 'u6'],
              totalPoints: 20,
              rank: 3,
            }),
          ]),
        })}
      />,
    );
    expect(screen.queryByTestId('stableford-team-rest')).toBeNull();
  });

  it('podium med 2 lag viser kun 1. og 2.-plass', () => {
    render(
      <TeamStablefordPodium
        {...defaultProps({
          result: makeResult([
            makeTeamLine({
              teamNumber: 1,
              playerIds: ['u1', 'u2'],
              totalPoints: 30,
              rank: 1,
            }),
            makeTeamLine({
              teamNumber: 2,
              playerIds: ['u3', 'u4'],
              totalPoints: 25,
              rank: 2,
            }),
          ]),
        })}
      />,
    );
    const podium = screen.getByTestId('stableford-team-podium');
    expect(within(podium).getByTestId('podium-rank-1')).toBeInTheDocument();
    expect(within(podium).getByTestId('podium-rank-2')).toBeInTheDocument();
    expect(within(podium).queryByTestId('podium-rank-3')).toBeNull();
  });

  it('podium med 1 lag viser kun 1.-plass', () => {
    render(
      <TeamStablefordPodium
        {...defaultProps({
          result: makeResult([
            makeTeamLine({
              teamNumber: 1,
              playerIds: ['u1', 'u2'],
              totalPoints: 30,
              rank: 1,
            }),
          ]),
        })}
      />,
    );
    const podium = screen.getByTestId('stableford-team-podium');
    expect(within(podium).getByTestId('podium-rank-1')).toBeInTheDocument();
    expect(within(podium).queryByTestId('podium-rank-2')).toBeNull();
    expect(within(podium).queryByTestId('podium-rank-3')).toBeNull();
  });

  it('viser «Ingen lag å vise» når result.teams er tomt', () => {
    render(
      <TeamStablefordPodium
        {...defaultProps({ result: makeResult([]) })}
      />,
    );
    expect(screen.getByText(/Ingen lag å vise/i)).toBeInTheDocument();
  });

  it('faller tilbake til «(ukjent)» når en av partnerne mangler i map-en', () => {
    render(
      <TeamStablefordPodium
        {...defaultProps({
          result: makeResult([
            makeTeamLine({
              teamNumber: 1,
              playerIds: ['real', 'ghost'],
              totalPoints: 30,
              rank: 1,
            }),
          ]),
          playersById: makePlayers([
            ['real', 'Alice Andersen', null],
          ]),
        })}
      />,
    );
    const podium = screen.getByTestId('stableford-team-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    expect(winner.textContent).toContain('Alice');
    expect(winner.textContent).toContain('(ukjent)');
  });

  it('total-poenget på podium-trinnet bruker tabular-nums', () => {
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    const winner = within(podium).getByTestId('podium-rank-1');
    const totalSpan = winner.querySelector('.score-num');
    expect(totalSpan).not.toBeNull();
    expect(totalSpan!.className).toMatch(/tabular-nums/);
  });

  it('rendrer Medallion (svg) på alle 3 podium-trinn', () => {
    render(<TeamStablefordPodium {...defaultProps()} />);
    const podium = screen.getByTestId('stableford-team-podium');
    expect(within(podium).getByTestId('podium-rank-1').querySelector('svg')).not.toBeNull();
    expect(within(podium).getByTestId('podium-rank-2').querySelector('svg')).not.toBeNull();
    expect(within(podium).getByTestId('podium-rank-3').querySelector('svg')).not.toBeNull();
  });
});
