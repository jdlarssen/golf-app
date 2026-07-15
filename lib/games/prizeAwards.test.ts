/**
 * #1051 premiebord — vinner-kobling (Type A).
 *
 * Dekker kontraktens edge-cases: delt plass, manglende vinner, lag-modi,
 * matchplay (ingen rank), fieldSize < 3, skins, og LD/CTP-oppslag.
 */

import { describe, it, expect } from 'vitest';

import {
  linkPrizesToWinners,
  type PrizeWinnerPlayer,
  type PrizeSideWinner,
} from './prizeAwards';
import type { GamePrize } from './prizes';

function placementPrize(position: number, over: Partial<GamePrize> = {}): GamePrize {
  return {
    category: 'placement',
    position,
    description: `${position}. plass-premie`,
    sponsor: null,
    sponsorLogoPath: null,
    ...over,
  };
}

function ldPrize(position: number): GamePrize {
  return {
    category: 'longest_drive',
    position,
    description: 'Lengste drive-premie',
    sponsor: null,
    sponsorLogoPath: null,
  };
}

function ctpPrize(position: number): GamePrize {
  return {
    category: 'closest_to_pin',
    position,
    description: 'Nærmest flagget-premie',
    sponsor: null,
    sponsorLogoPath: null,
  };
}

function player(
  userId: string,
  name: string,
  rank: number | null,
  opts: { kind?: 'placement' | 'skins'; isTeam?: boolean; fieldSize?: number } = {},
): PrizeWinnerPlayer {
  if (rank == null) {
    return { userId, name, resultSummary: null };
  }
  const kind = opts.kind ?? 'placement';
  const fieldSize = opts.fieldSize ?? 4;
  const resultSummary =
    kind === 'skins'
      ? { kind: 'skins' as const, skins: 2, rank, fieldSize }
      : { kind: 'placement' as const, rank, fieldSize, isTeam: opts.isTeam ?? false };
  return { userId, name, resultSummary };
}

describe('linkPrizesToWinners — placement prizes', () => {
  it('links a placement prize to the player with matching rank', () => {
    const awards = linkPrizesToWinners(
      [placementPrize(1)],
      [player('a', 'Anna', 1), player('b', 'Bjørn', 2)],
      [],
    );
    expect(awards).toHaveLength(1);
    expect(awards[0].winners).toEqual(['Anna']);
  });

  it('lists all names on a shared place (tie)', () => {
    const awards = linkPrizesToWinners(
      [placementPrize(1)],
      [player('a', 'Anna', 1), player('b', 'Bjørn', 1), player('c', 'Cato', 3)],
      [],
    );
    expect(awards[0].winners).toEqual(['Anna', 'Bjørn']);
  });

  it('lists all team members sharing the winning rank (team format)', () => {
    const awards = linkPrizesToWinners(
      [placementPrize(1)],
      [
        player('a', 'Anna', 1, { isTeam: true }),
        player('b', 'Bjørn', 1, { isTeam: true }),
        player('c', 'Cato', 2, { isTeam: true }),
        player('d', 'Dina', 2, { isTeam: true }),
      ],
      [],
    );
    expect(awards[0].winners).toEqual(['Anna', 'Bjørn']);
  });

  it('resolves skins-kind rank the same as placement', () => {
    const awards = linkPrizesToWinners(
      [placementPrize(1)],
      [player('a', 'Anna', 1, { kind: 'skins' })],
      [],
    );
    expect(awards[0].winners).toEqual(['Anna']);
  });

  it('omits a placement prize when no player has that rank (fieldSize < 3)', () => {
    // Only 2 players → nobody has rank 3, so the 3rd-place prize is omitted.
    const awards = linkPrizesToWinners(
      [placementPrize(1), placementPrize(2), placementPrize(3)],
      [
        player('a', 'Anna', 1, { fieldSize: 2 }),
        player('b', 'Bjørn', 2, { fieldSize: 2 }),
      ],
      [],
    );
    expect(awards.map((a) => a.prize.position)).toEqual([1, 2]);
  });

  it('gives no placement winners for a matchplay field (no rank)', () => {
    const players: PrizeWinnerPlayer[] = [
      { userId: 'a', name: 'Anna', resultSummary: { kind: 'matchplay', outcome: 'win', margin: '3&2' } },
      { userId: 'b', name: 'Bjørn', resultSummary: { kind: 'matchplay', outcome: 'loss', margin: null } },
    ];
    const awards = linkPrizesToWinners([placementPrize(1)], players, []);
    expect(awards).toEqual([]);
  });

  it('ignores players with no result_summary', () => {
    const awards = linkPrizesToWinners(
      [placementPrize(1)],
      [player('a', 'Anna', null), player('b', 'Bjørn', 1)],
      [],
    );
    expect(awards[0].winners).toEqual(['Bjørn']);
  });
});

describe('linkPrizesToWinners — side-tournament prizes', () => {
  const sideWinners: PrizeSideWinner[] = [
    { category: 'longest_drive', position: 1, winnerUserId: 'a' },
    { category: 'longest_drive', position: 2, winnerUserId: null }, // ingen vinner
    { category: 'closest_to_pin', position: 1, winnerUserId: 'b' },
  ];
  const players = [player('a', 'Anna', 1), player('b', 'Bjørn', 2)];

  it('links LD/CTP prizes to the winning player name', () => {
    const awards = linkPrizesToWinners([ldPrize(1), ctpPrize(1)], players, sideWinners);
    expect(awards).toHaveLength(2);
    expect(awards[0]).toMatchObject({ winners: ['Anna'] });
    expect(awards[1]).toMatchObject({ winners: ['Bjørn'] });
  });

  it('omits a side prize whose slot was decided with no winner', () => {
    const awards = linkPrizesToWinners([ldPrize(2)], players, sideWinners);
    expect(awards).toEqual([]);
  });

  it('omits a side prize with no matching side-winner row at all', () => {
    const awards = linkPrizesToWinners([ctpPrize(2)], players, sideWinners);
    expect(awards).toEqual([]);
  });
});

describe('linkPrizesToWinners — general', () => {
  it('returns [] for an empty prize board', () => {
    expect(linkPrizesToWinners([], [player('a', 'Anna', 1)], [])).toEqual([]);
  });

  it('preserves prize input order in the output', () => {
    const awards = linkPrizesToWinners(
      [placementPrize(2), placementPrize(1)],
      [player('a', 'Anna', 1), player('b', 'Bjørn', 2)],
      [],
    );
    expect(awards.map((a) => a.prize.position)).toEqual([2, 1]);
  });
});
