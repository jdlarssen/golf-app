import { describe, it, expect } from 'vitest';
import {
  parseLeaderboardNavContext,
  validateFromParam,
  leaderboardHref,
  drilldownHref,
  EMPTY_NAV_CONTEXT,
  type LeaderboardNavContext,
} from './navContext';

const FROM_CUP = '/cup/abc-123/resultater';

const cupContext: LeaderboardNavContext = {
  from: FROM_CUP,
  returnTo: null,
  holeNumber: null,
};

const holeContext: LeaderboardNavContext = {
  from: null,
  returnTo: 'hole',
  holeNumber: 7,
};

const bothContext: LeaderboardNavContext = {
  from: FROM_CUP,
  returnTo: 'hole',
  holeNumber: 7,
};

describe('validateFromParam', () => {
  it.each([
    ['/cup/abc/resultater', '/cup/abc/resultater'],
    ['/profile/historikk', '/profile/historikk'],
    ['/admin/cup/1', '/admin/cup/1'],
    ['/games/g1', '/games/g1'],
    ['/klubber/k1/cup/c1', '/klubber/k1/cup/c1'],
    ['/', '/'],
  ])('accepts allowlisted path %s', (raw, expected) => {
    expect(validateFromParam(raw)).toBe(expected);
  });

  it.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['relative path', 'cup/abc'],
    ['protocol-relative', '//evil.com'],
    ['absolute url', 'https://evil.com/cup/abc'],
    ['unknown prefix', '/evil/abc'],
    ['overlong', `/cup/${'x'.repeat(250)}`],
  ])('rejects %s', (_label, raw) => {
    expect(validateFromParam(raw)).toBeNull();
  });

  it('reads the first value when the param repeats', () => {
    expect(validateFromParam(['/cup/abc', '/games/g1'])).toBe('/cup/abc');
  });
});

describe('parseLeaderboardNavContext', () => {
  it('returns an empty context for no params', () => {
    expect(parseLeaderboardNavContext({})).toEqual(EMPTY_NAV_CONTEXT);
  });

  it('reads a valid from-param', () => {
    expect(parseLeaderboardNavContext({ from: FROM_CUP })).toEqual(cupContext);
  });

  it('reads a valid return-to-hole pair', () => {
    expect(parseLeaderboardNavContext({ return: 'hole', n: '7' })).toEqual(
      holeContext,
    );
  });

  it('reads from and return-to-hole together', () => {
    expect(
      parseLeaderboardNavContext({ from: FROM_CUP, return: 'hole', n: '7' }),
    ).toEqual(bothContext);
  });

  it.each([
    ['out-of-range hole', { return: 'hole', n: '19' }],
    ['zero hole', { return: 'hole', n: '0' }],
    ['non-integer hole', { return: 'hole', n: '7.5' }],
    ['non-numeric hole', { return: 'hole', n: 'sju' }],
    ['missing hole number', { return: 'hole' }],
    ['unknown return target', { return: 'scorecard', n: '7' }],
  ])('drops the return context for %s', (_label, sp) => {
    expect(parseLeaderboardNavContext(sp)).toMatchObject({
      returnTo: null,
      holeNumber: null,
    });
  });

  it('drops an invalid from but keeps a valid return', () => {
    expect(
      parseLeaderboardNavContext({
        from: 'https://evil.com',
        return: 'hole',
        n: '3',
      }),
    ).toEqual({ from: null, returnTo: 'hole', holeNumber: 3 });
  });
});

describe('leaderboardHref', () => {
  it('carries mode alone', () => {
    expect(leaderboardHref({ gameId: 'g1', mode: 'netto' })).toBe(
      '/games/g1/leaderboard?mode=netto',
    );
  });

  it('carries mode plus from', () => {
    expect(
      leaderboardHref({ gameId: 'g1', mode: 'brutto', context: cupContext }),
    ).toBe(
      `/games/g1/leaderboard?mode=brutto&from=${encodeURIComponent(FROM_CUP)}`,
    );
  });

  it('carries mode plus return-to-hole', () => {
    expect(
      leaderboardHref({ gameId: 'g1', mode: 'netto', context: holeContext }),
    ).toBe('/games/g1/leaderboard?mode=netto&return=hole&n=7');
  });

  it('carries every context param at once', () => {
    expect(
      leaderboardHref({ gameId: 'g1', mode: 'netto', context: bothContext }),
    ).toBe(
      `/games/g1/leaderboard?mode=netto&from=${encodeURIComponent(FROM_CUP)}&return=hole&n=7`,
    );
  });

  it.each([
    ['empty context', EMPTY_NAV_CONTEXT],
    ['null context', null],
    ['undefined context', undefined],
  ])('emits no query at all for %s and no mode', (_label, context) => {
    expect(leaderboardHref({ gameId: 'g1', context })).toBe(
      '/games/g1/leaderboard',
    );
  });

  it('never emits an empty from=', () => {
    const href = leaderboardHref({
      gameId: 'g1',
      mode: 'netto',
      context: EMPTY_NAV_CONTEXT,
    });
    expect(href).toBe('/games/g1/leaderboard?mode=netto');
    expect(href).not.toContain('from=');
  });

  it('encodes a from value that would otherwise inject params', () => {
    const href = leaderboardHref({
      gameId: 'g1',
      mode: 'netto',
      context: { from: '/cup/x&mode=brutto', returnTo: null, holeNumber: null },
    });
    expect(href).toBe(
      '/games/g1/leaderboard?mode=netto&from=%2Fcup%2Fx%26mode%3Dbrutto',
    );
  });
});

describe('drilldownHref', () => {
  it('carries team and mode', () => {
    expect(drilldownHref({ gameId: 'g1', team: 2, mode: 'netto' })).toBe(
      '/games/g1/leaderboard/holes?team=2&mode=netto',
    );
  });

  it('carries team, mode and the full context', () => {
    expect(
      drilldownHref({
        gameId: 'g1',
        team: 2,
        mode: 'netto',
        context: bothContext,
      }),
    ).toBe(
      `/games/g1/leaderboard/holes?team=2&mode=netto&from=${encodeURIComponent(FROM_CUP)}&return=hole&n=7`,
    );
  });

  it('omits team when none is given', () => {
    expect(
      drilldownHref({ gameId: 'g1', mode: 'brutto', context: cupContext }),
    ).toBe(
      `/games/g1/leaderboard/holes?mode=brutto&from=${encodeURIComponent(FROM_CUP)}`,
    );
  });

  it('round-trips through parseLeaderboardNavContext', () => {
    const href = drilldownHref({
      gameId: 'g1',
      team: 3,
      mode: 'brutto',
      context: bothContext,
    });
    const query = new URLSearchParams(href.split('?')[1]);
    expect(
      parseLeaderboardNavContext({
        from: query.get('from') ?? undefined,
        return: query.get('return') ?? undefined,
        n: query.get('n') ?? undefined,
      }),
    ).toEqual(bothContext);
  });
});
