import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { finishedResultBadge, isLeagueCardAlone, leagueAlonePlayer } from './finishedResultBadge';

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

// #2712 (owner 31.10): a league flight played alone has no placement, so the
// card says it was approved instead of «Du vant».
describe('finishedResultBadge — ligaflight alene (#2712)', () => {
  const solo = { kind: 'placement', rank: 1, fieldSize: 1, isTeam: false } as const;
  it('ligaflight med én spiller → approved, ingen gull', () => {
    expect(finishedResultBadge(solo, { leagueFlight: true })).toEqual({ key: 'result.approved', isWin: false });
  });
  it('ligaflight med flere spillere → plassen som før', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 1, fieldSize: 2, isTeam: false }, { leagueFlight: true }),
    ).toEqual({ key: 'result.youWon', isWin: true });
  });
  it('vanlig spill alene → som før', () => {
    expect(finishedResultBadge(solo)).toEqual({ key: 'result.youWon', isWin: true });
  });
});


// #2712 (orchestrator 31.10, after the owner's rule): the same rule read from a
// share card's model, for the round report, the share image and the web podium.
describe('isLeagueCardAlone (#2712)', () => {
  const one = { band: 'placement', podium: [{}] };
  it('a placement card with one row in a league flight is alone', () => {
    expect(isLeagueCardAlone(one, true)).toBe(true);
  });
  it('two rows in a league flight keep their places', () => {
    expect(isLeagueCardAlone({ band: 'placement', podium: [{}, {}] }, true)).toBe(false);
  });
  it('one row outside a league is a normal win', () => {
    expect(isLeagueCardAlone(one, false)).toBe(false);
  });
  it('a matchplay card is never alone', () => {
    expect(isLeagueCardAlone({ band: 'matchplay', podium: [{}] }, true)).toBe(false);
  });
  it('an empty card keeps its neutral headline', () => {
    expect(isLeagueCardAlone({ band: 'placement', podium: [] }, true)).toBe(false);
  });
});

// #2712: the one player a view draws for a league round played alone. A field
// with no active player (the only one withdrew, then the game was ended) is
// not alone here: the view keeps its own empty state instead of crashing.
describe('leagueAlonePlayer (#2712)', () => {
  const siri = { userId: 'siri' };
  it('one player in a league flight is the one', () => {
    expect(leagueAlonePlayer([siri], true)).toBe(siri);
  });
  it('an empty league flight has nobody', () => {
    expect(leagueAlonePlayer([], true)).toBeNull();
  });
  it('a league flight of two has nobody alone', () => {
    expect(leagueAlonePlayer([siri, { userId: 'ola' }], true)).toBeNull();
  });
  it('one player outside a league is not alone in a league', () => {
    expect(leagueAlonePlayer([siri], false)).toBeNull();
  });

  // The solo formats' finished board picks LeagueAloneResult through it.
  it('the solo stableford and stroke play boards read it', () => {
    const root = path.resolve(__dirname, '../..');
    for (const site of [
      'app/[locale]/games/[id]/leaderboard/formats/stableford.tsx',
      'app/[locale]/games/[id]/leaderboard/formats/soloStrokeplay.tsx',
    ]) {
      const src = fs.readFileSync(path.join(root, site), 'utf8');
      expect(src, site).toContain('leagueAlonePlayer(');
      expect(src, site).toContain('<LeagueAloneResult');
    }
  });
});
