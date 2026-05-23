import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  TeamStablefordView,
  type TeamStablefordViewProps,
} from './TeamStablefordView';
import type { SoloStablefordPlayerInfo } from './SoloStablefordView';
import type {
  StablefordTeamResult,
  StablefordTeamLine,
} from '@/lib/scoring/modes/types';

// SmartLink calls useRouter — stub the navigation context for jsdom.
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
  overrides: Partial<TeamStablefordViewProps> = {},
): TeamStablefordViewProps {
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
    backHref: '/games/g1',
    ...overrides,
  };
}

describe('TeamStablefordView', () => {
  it('rendrer ett rad-element per lag', () => {
    render(<TeamStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-team-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
  });

  it('viser «Lag N»-label per rad i compute-rekkefølge', () => {
    render(<TeamStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-team-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Lag 1');
    expect(rows[0].textContent).toContain('42');
    expect(rows[1].textContent).toContain('Lag 2');
    expect(rows[1].textContent).toContain('36');
    expect(rows[2].textContent).toContain('Lag 3');
    expect(rows[2].textContent).toContain('28');
    expect(rows[3].textContent).toContain('Lag 4');
    expect(rows[3].textContent).toContain('24');
  });

  it('viser begge partnernes fornavn på lag-raden', () => {
    render(<TeamStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-team-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    // Fornavn-only — kompakt for mobile-rader.
    expect(rows[0].textContent).toContain('Alice');
    expect(rows[0].textContent).toContain('Bjørn');
    expect(rows[3].textContent).toContain('Gunnar');
    expect(rows[3].textContent).toContain('Hilde');
  });

  it('rendrer Medallion (svg) for topp 3, ren rank-disc for 4+', () => {
    render(<TeamStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-team-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].querySelector('svg')).not.toBeNull();
    expect(rows[1].querySelector('svg')).not.toBeNull();
    expect(rows[2].querySelector('svg')).not.toBeNull();
    expect(rows[3].querySelector('svg')).toBeNull();
    expect(rows[3].textContent).toMatch(/^\s*4/);
  });

  it('vinner-cardet har champagne accent (border-accent)', () => {
    render(<TeamStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-team-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    // Card-class ligger på et child element av <li>. Test mot innholdet.
    expect(rows[0].innerHTML).toMatch(/border-accent/);
  });

  it('viser tied-with-melding når tiedWith har innhold', () => {
    render(
      <TeamStablefordView
        {...defaultProps({
          result: makeResult([
            makeTeamLine({
              teamNumber: 1,
              playerIds: ['u1', 'u2'],
              totalPoints: 40,
              rank: 1,
              tiedWith: [3],
            }),
            makeTeamLine({
              teamNumber: 2,
              playerIds: ['u3', 'u4'],
              totalPoints: 30,
              rank: 2,
            }),
            makeTeamLine({
              teamNumber: 3,
              playerIds: ['u5', 'u6'],
              totalPoints: 40,
              rank: 1,
              tiedWith: [1],
            }),
          ]),
        })}
      />,
    );
    const list = screen.getByTestId('stableford-team-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Delt 1. plass med Lag 3');
    expect(rows[2].textContent).toContain('Delt 1. plass med Lag 1');
  });

  it('total-poenget bruker tabular-nums for tabell-justering', () => {
    render(<TeamStablefordView {...defaultProps()} />);
    const list = screen.getByTestId('stableford-team-leaderboard');
    const rows = within(list).getAllByRole('listitem');
    // Total-poenget har klassen `tabular-nums` på selve span'en.
    const totalSpan = rows[0].querySelector('.score-num');
    expect(totalSpan).not.toBeNull();
    expect(totalSpan!.className).toMatch(/tabular-nums/);
  });

  it('viser «Ingen lag å vise»-fallback når result.teams er tomt', () => {
    render(
      <TeamStablefordView {...defaultProps({ result: makeResult([]) })} />,
    );
    expect(screen.getByText(/Ingen lag å vise/i)).toBeInTheDocument();
  });

  it('faller tilbake til «(ukjent)» når playerInfo mangler', () => {
    render(
      <TeamStablefordView
        {...defaultProps({
          result: makeResult([
            makeTeamLine({
              teamNumber: 1,
              playerIds: ['ghost1', 'ghost2'],
              totalPoints: 10,
              rank: 1,
            }),
          ]),
          playersById: new Map(),
        })}
      />,
    );
    const list = screen.getByTestId('stableford-team-leaderboard');
    expect(list.textContent).toContain('(ukjent)');
  });

  it('faller tilbake til «(uten spillere)» for tomt lag', () => {
    render(
      <TeamStablefordView
        {...defaultProps({
          result: makeResult([
            makeTeamLine({
              teamNumber: 1,
              playerIds: [],
              totalPoints: 0,
              rank: 1,
            }),
          ]),
        })}
      />,
    );
    const list = screen.getByTestId('stableford-team-leaderboard');
    expect(list.textContent).toContain('(uten spillere)');
  });

  it('bruker formatRevealName-fallback når spilleren ikke har et fornavn (kun kallenavn)', () => {
    render(
      <TeamStablefordView
        {...defaultProps({
          result: makeResult([
            makeTeamLine({
              teamNumber: 1,
              playerIds: ['u1', 'u2'],
              totalPoints: 20,
              rank: 1,
            }),
          ]),
          playersById: makePlayers([
            // Empty name with nickname → firstName() returnerer null,
            // så vi faller tilbake til formatRevealName-utgaven.
            ['u1', '', 'Tigeren'],
            ['u2', 'Bjørn Berg', 'Bjørnen'],
          ]),
        })}
      />,
    );
    const list = screen.getByTestId('stableford-team-leaderboard');
    // formatRevealName legger kallenavn i guillemeter.
    expect(list.textContent).toContain('Tigeren');
    expect(list.textContent).toContain('Bjørn');
  });
});
