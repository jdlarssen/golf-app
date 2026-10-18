import { describe, expect, it } from 'vitest';

import type { ShareCardModel, ShareCardRow } from '@/lib/games/buildShareCardData';

import { headlineSpec } from './shareCardHeadline';

function row(rank: number, members: string[], score: ShareCardRow['score']): ShareCardRow {
  return { rank, name: members.join(' / '), memberNames: members, score, isSharer: false };
}

function placement(winners: ShareCardRow[], extra: ShareCardRow[] = []): ShareCardModel {
  return {
    band: 'placement',
    podium: [...winners, ...extra],
    winners,
    sharerStrip: null,
    match: null,
    sideTournaments: [],
  };
}

const POINTS_38 = { kind: 'points', value: 38 } as const;

describe('headlineSpec — placement', () => {
  it('one winner: first name and the points', () => {
    expect(headlineSpec(placement([row(1, ['Marte L.'], POINTS_38)]))).toEqual({
      kind: 'won',
      names: ['Marte'],
      result: { kind: 'points', value: 38 },
    });
  });

  it('a tie for first names everyone', () => {
    const spec = headlineSpec(
      placement([row(1, ['Marte L.'], POINTS_38), row(1, ['Jonas B.'], POINTS_38)]),
    );
    expect(spec).toEqual({
      kind: 'shared',
      names: ['Marte', 'Jonas'],
      result: { kind: 'points', value: 38 },
    });
  });

  it('a team of four that wins alone gets all four names', () => {
    const spec = headlineSpec(
      placement([row(1, ['Marte L.', 'Jonas B.', 'Ola N.', 'Kari H.'], POINTS_38)]),
    );
    expect(spec).toMatchObject({ kind: 'won', names: ['Marte', 'Jonas', 'Ola', 'Kari'] });
  });

  it('two teams of two tied: four names still fit', () => {
    const spec = headlineSpec(
      placement([
        row(1, ['Marte L.', 'Jonas B.'], POINTS_38),
        row(1, ['Ola N.', 'Kari H.'], POINTS_38),
      ]),
    );
    expect(spec).toMatchObject({ kind: 'shared', names: ['Marte', 'Jonas', 'Ola', 'Kari'] });
  });

  it('two teams of four tied: no names, «Delt seier»', () => {
    const spec = headlineSpec(
      placement([
        row(1, ['A', 'B', 'C', 'D'], POINTS_38),
        row(1, ['E', 'F', 'G', 'H'], POINTS_38),
      ]),
    );
    expect(spec).toEqual({
      kind: 'sharedMany',
      result: { kind: 'points', value: 38 },
    });
  });

  it.each([
    ['skins', { kind: 'skins', value: 6 }],
    ['vs par', { kind: 'vsPar', label: '−4' }],
    ['even par', { kind: 'vsPar', label: 'E' }],
  ] as const)('carries the %s result as scored', (_label, score) => {
    const spec = headlineSpec(placement([row(1, ['Marte L.'], score)]));
    expect(spec).toMatchObject({ kind: 'won', result: score });
  });

  it('four tied singles are all named', () => {
    const rows = ['Marte L.', 'Jonas B.', 'Ola N.', 'Kari H.'].map((n) => row(1, [n], POINTS_38));
    expect(headlineSpec(placement(rows))).toMatchObject({
      kind: 'shared',
      names: ['Marte', 'Jonas', 'Ola', 'Kari'],
    });
  });

  it('five tied singles read «Delt seier»', () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].map((n) => row(1, [n], POINTS_38));
    expect(headlineSpec(placement(rows))).toMatchObject({ kind: 'sharedMany' });
  });

  it('skins nobody won (no winners) is just «finished»', () => {
    expect(headlineSpec(placement([], [row(1, ['A'], { kind: 'skins', value: 0 })]))).toEqual({
      kind: 'finished',
    });
  });

  it('a card without a model is «finished»', () => {
    expect(headlineSpec(null)).toEqual({ kind: 'finished' });
  });
});

describe('headlineSpec — matchplay', () => {
  function match(
    headline: NonNullable<ShareCardModel['match']>['headline'],
    won: [boolean, boolean],
  ): ShareCardModel {
    return {
      band: 'matchplay',
      podium: [],
      winners: [],
      sharerStrip: null,
      sideTournaments: [],
      match: {
        sharerOutcome: null,
        headline,
        sides: [
          { name: 'Marte L. / Jonas B.', memberNames: ['Marte L.', 'Jonas B.'], won: won[0] },
          { name: 'Ola N.', memberNames: ['Ola N.'], won: won[1] },
        ],
      },
    };
  }

  it('names the winning side by first names', () => {
    expect(
      headlineSpec(match({ kind: 'winner', winnerName: 'x', margin: '3&2' }, [true, false])),
    ).toEqual({ kind: 'matchWon', names: ['Marte', 'Jonas'], margin: '3&2' });
  });

  it('side 2 can win', () => {
    expect(
      headlineSpec(match({ kind: 'winner', winnerName: 'x', margin: '2up' }, [false, true])),
    ).toEqual({ kind: 'matchWon', names: ['Ola'], margin: '2up' });
  });

  it('halved', () => {
    expect(headlineSpec(match({ kind: 'tied' }, [false, false]))).toEqual({ kind: 'tied' });
  });

  it('no result yet is «finished»', () => {
    expect(headlineSpec(match({ kind: 'undecided' }, [false, false]))).toEqual({
      kind: 'finished',
    });
  });
});
