import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  finishedResultBadge,
  isUnplacedLeagueCard,
  isUnplacedLeagueRound,
  leagueFlightHasNoPlace,
  leagueFlightPlayers,
} from './finishedResultBadge';

describe('finishedResultBadge', () => {
  it('placement rank 1 (individ) → youWon, isWin', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 1, fieldSize: 4, isTeam: false }),
    ).toEqual({ key: 'result.youWon', isWin: true });
  });

  it('placement rank 1 (lag) → teamWon, isWin', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 1, fieldSize: 3, isTeam: true }),
    ).toEqual({ key: 'result.teamWon', isWin: true });
  });

  it('placement rank > 1 (individ) → placement, ikke win', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 2, fieldSize: 4, isTeam: false }),
    ).toEqual({
      key: 'result.placement',
      values: { rank: 2, fieldSize: 4 },
      isWin: false,
    });
  });

  it('placement rank > 1 (lag) → teamPlacement', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 2, fieldSize: 4, isTeam: true }),
    ).toMatchObject({ key: 'result.teamPlacement', isWin: false });
  });

  it('matchplay win → matchWon med margin, isWin', () => {
    expect(
      finishedResultBadge({ kind: 'matchplay', outcome: 'win', margin: '3&2' }),
    ).toEqual({ key: 'result.matchWon', values: { margin: '3&2' }, isWin: true });
  });

  it('matchplay loss → matchLost, ikke win', () => {
    expect(
      finishedResultBadge({ kind: 'matchplay', outcome: 'loss', margin: '2 up' }),
    ).toEqual({ key: 'result.matchLost', values: { margin: '2 up' }, isWin: false });
  });

  it('matchplay tie → matchTied, ingen margin', () => {
    expect(
      finishedResultBadge({ kind: 'matchplay', outcome: 'tie', margin: null }),
    ).toEqual({ key: 'result.matchTied', isWin: false });
  });

  it('skins rank 1 med skins > 0 → skinsWon, isWin', () => {
    expect(
      finishedResultBadge({ kind: 'skins', skins: 4, rank: 1, fieldSize: 4 }),
    ).toEqual({ key: 'result.skinsWon', values: { count: 4 }, isWin: true });
  });

  it('skins rank 1 men 0 skins → skins, IKKE win (ingen gull for «0 skins»)', () => {
    expect(
      finishedResultBadge({ kind: 'skins', skins: 0, rank: 1, fieldSize: 4 }),
    ).toEqual({ key: 'result.skins', values: { count: 0 }, isWin: false });
  });

  it('skins rank > 1 → skins, ikke win', () => {
    expect(
      finishedResultBadge({ kind: 'skins', skins: 1, rank: 3, fieldSize: 4 }),
    ).toEqual({ key: 'result.skins', values: { count: 1 }, isWin: false });
  });
});

// #2712, #2850 (owner 12.11): a league flight has no placement, alone or with
// others; the league round is decided when the round closes, across every
// flight. The card says it was approved instead of «Du vant» or «2. plass av 2».
describe('finishedResultBadge — ligaflight (#2712, #2850)', () => {
  const solo = { kind: 'placement', rank: 1, fieldSize: 1, isTeam: false } as const;
  it('ligaflight med én spiller → approved, ingen gull', () => {
    expect(finishedResultBadge(solo, { leagueFlight: true })).toEqual({ key: 'result.approved', isWin: false });
  });
  it('ligaflight med flere spillere → approved, ingen plass og ingen gull', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 1, fieldSize: 2, isTeam: false }, { leagueFlight: true }),
    ).toEqual({ key: 'result.approved', isWin: false });
  });
  it('ligaflight: 2. plass av 2 → approved (issuet)', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 2, fieldSize: 2, isTeam: false }, { leagueFlight: true }),
    ).toEqual({ key: 'result.approved', isWin: false });
  });
  it('vanlig spill på to → plassen som før', () => {
    expect(finishedResultBadge({ kind: 'placement', rank: 2, fieldSize: 2, isTeam: false })).toEqual({
      key: 'result.placement',
      values: { rank: 2, fieldSize: 2 },
      isWin: false,
    });
    expect(finishedResultBadge({ kind: 'placement', rank: 1, fieldSize: 2, isTeam: false })).toEqual({
      key: 'result.youWon',
      isWin: true,
    });
  });
  it('vanlig spill alene → som før', () => {
    expect(finishedResultBadge(solo)).toEqual({ key: 'result.youWon', isWin: true });
  });
});

describe('leagueFlightHasNoPlace (#2850)', () => {
  it('is the flag, whatever the field size', () => {
    expect(leagueFlightHasNoPlace(true)).toBe(true);
    expect(leagueFlightHasNoPlace(false)).toBe(false);
  });
});

describe('isUnplacedLeagueRound (#2850)', () => {
  const two = { kind: 'placement', rank: 2, fieldSize: 2, isTeam: false } as const;
  it('a placement in a league flight, of any size, is unplaced', () => {
    expect(isUnplacedLeagueRound(two, true)).toBe(true);
    expect(isUnplacedLeagueRound({ ...two, rank: 1, fieldSize: 1 }, true)).toBe(true);
    expect(isUnplacedLeagueRound({ ...two, rank: 3, fieldSize: 4 }, true)).toBe(true);
  });
  it('the same outside a league is placed', () => {
    expect(isUnplacedLeagueRound(two, false)).toBe(false);
  });
  it('no summary, matchplay and skins are never unplaced here', () => {
    expect(isUnplacedLeagueRound(null, true)).toBe(false);
    expect(isUnplacedLeagueRound({ kind: 'matchplay', outcome: 'win', margin: '2&1' }, true)).toBe(false);
  });
});

// The same rule read from a share card's model, for the round report, the
// share image and the web podium.
describe('isUnplacedLeagueCard (#2712, #2850)', () => {
  const one = { band: 'placement', podium: [{}] };
  it('a placement card in a league flight is unplaced, with one row or several', () => {
    expect(isUnplacedLeagueCard(one, true)).toBe(true);
    expect(isUnplacedLeagueCard({ band: 'placement', podium: [{}, {}] }, true)).toBe(true);
    expect(isUnplacedLeagueCard({ band: 'placement', podium: [{}, {}, {}] }, true)).toBe(true);
  });
  it('rows outside a league are a normal placement', () => {
    expect(isUnplacedLeagueCard(one, false)).toBe(false);
    expect(isUnplacedLeagueCard({ band: 'placement', podium: [{}, {}] }, false)).toBe(false);
  });
  it('a matchplay card is never unplaced', () => {
    expect(isUnplacedLeagueCard({ band: 'matchplay', podium: [{}] }, true)).toBe(false);
  });
  it('an empty card keeps its neutral headline', () => {
    expect(isUnplacedLeagueCard({ band: 'placement', podium: [] }, true)).toBe(false);
  });
});

// #2850: the players a view draws without a place. A flight with no active
// player (the only one withdrew, then the game was ended) is not drawn here:
// the view keeps its own empty state instead of crashing.
describe('leagueFlightPlayers (#2850)', () => {
  const siri = { userId: 'siri' };
  const ola = { userId: 'ola' };
  it('one player in a league flight is drawn', () => {
    expect(leagueFlightPlayers([siri], true)).toEqual([siri]);
  });
  it('a league flight of two or more is drawn in the given order', () => {
    expect(leagueFlightPlayers([ola, siri], true)).toEqual([ola, siri]);
  });
  it('an empty league flight has nobody', () => {
    expect(leagueFlightPlayers([], true)).toBeNull();
  });
  it('players outside a league are not drawn this way', () => {
    expect(leagueFlightPlayers([siri], false)).toBeNull();
    expect(leagueFlightPlayers([siri, ola], false)).toBeNull();
  });

  // The solo formats' finished board picks LeagueFlightResult through it, and
  // BEFORE the duel branch: with exactly two players the duel would crown a
  // winner (#2850).
  it('the solo stableford and stroke play boards read it before the duel', () => {
    const root = path.resolve(__dirname, '../..');
    for (const site of [
      'app/[locale]/games/[id]/leaderboard/formats/stableford.tsx',
      'app/[locale]/games/[id]/leaderboard/formats/soloStrokeplay.tsx',
    ]) {
      const src = fs.readFileSync(path.join(root, site), 'utf8');
      expect(src, site).toContain('leagueFlightPlayers(');
      expect(src, site).toContain('<LeagueFlightResult');
      expect(src.indexOf('if (leaguePlayers)'), site).toBeGreaterThan(-1);
      expect(src.indexOf('if (leaguePlayers)'), site).toBeLessThan(
        src.indexOf('result.players.length === 2'),
      );
    }
  });
});
