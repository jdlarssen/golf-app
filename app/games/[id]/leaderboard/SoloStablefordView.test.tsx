import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  SoloStablefordView,
  type SoloStablefordPlayerInfo,
  type SoloStablefordViewProps,
} from './SoloStablefordView';
import type { StablefordResult } from '@/lib/scoring/modes/types';

// SmartLink calls useRouter — stub the navigation context for jsdom.
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
): StablefordResult {
  return {
    kind: 'stableford',
    players: players.map((p) => ({ ...p, tiedWith: [] })),
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
  overrides: Partial<SoloStablefordViewProps> = {},
): SoloStablefordViewProps {
  return {
    gameId: 'g1',
    gameName: 'Sommerturnering',
    result: makeResult([
      { userId: 'u1', totalPoints: 38, rank: 1, holesPlayed: 18 },
      { userId: 'u2', totalPoints: 32, rank: 2, holesPlayed: 18 },
      { userId: 'u3', totalPoints: 28, rank: 3, holesPlayed: 18 },
      { userId: 'u4', totalPoints: 24, rank: 4, holesPlayed: 17 },
    ]),
    playersById: makePlayers([
      ['u1', 'Alice Andersen', null],
      ['u2', 'Bjørn Berg', 'Bjørnen'],
      ['u3', 'Camilla Carlsen', null],
      ['u4', 'David Dahl', null],
    ]),
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('SoloStablefordView', () => {
  it('rendrer riktig antall rader', () => {
    render(<SoloStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
  });

  it('sorterer på poeng (høyest øverst), respekterer rank-rekkefølgen fra compute', () => {
    render(<SoloStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('38');
    expect(rows[0].textContent).toContain('Alice Andersen');
    expect(rows[1].textContent).toContain('32');
    expect(rows[2].textContent).toContain('28');
    expect(rows[3].textContent).toContain('24');
  });

  it('viser «N hull spilt»-chip per rad', () => {
    render(<SoloStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('18 hull spilt');
    expect(rows[3].textContent).toContain('17 hull spilt');
  });

  it('viser «poeng»-label per rad', () => {
    render(<SoloStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-leaderboard');
    expect(within(list).getAllByText('poeng').length).toBeGreaterThanOrEqual(1);
  });

  it('rendrer Medallion for topp 3, rank-disc for 4+', () => {
    render(<SoloStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    // Top 3 → svg Medallion (har SVG-element inni)
    expect(rows[0].querySelector('svg')).not.toBeNull();
    expect(rows[1].querySelector('svg')).not.toBeNull();
    expect(rows[2].querySelector('svg')).not.toBeNull();
    // Rad 4+ → tekst-rank uten SVG
    expect(rows[3].querySelector('svg')).toBeNull();
    expect(rows[3].textContent).toMatch(/^4/);
  });

  it('formatRevealName brukes på navn med kallenavn (u2 har «Bjørnen»)', () => {
    render(<SoloStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-leaderboard');
    // formatRevealName-formatet legger kallenavn i guillemeter mellom for- og etternavn.
    expect(list.textContent).toContain('Bjørnen');
  });

  it('viser «Ingen spillere å vise»-tekst når result.players er tomt', () => {
    render(
      <SoloStablefordView
        {...defaultProps({ result: makeResult([]) })}
      />,
    );
    expect(screen.getByText(/Ingen spillere å vise/i)).toBeInTheDocument();
  });

  it('faller tilbake til «(ukjent spiller)» hvis playerInfo mangler', () => {
    render(
      <SoloStablefordView
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
