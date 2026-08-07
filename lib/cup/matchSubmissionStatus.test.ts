import { describe, it, expect } from 'vitest';
import {
  computeSubmissionStatusByGame,
  matchBlocksOneTapFinish,
  type MatchPlayerRow,
} from './matchSubmissionStatus';

const TS = '2026-01-01T12:00:00Z';

/** Build a player row: submitted? withdrawn? */
function player(submitted: boolean, withdrawn = false): MatchPlayerRow {
  return {
    submitted_at: submitted ? TS : null,
    withdrawn_at: withdrawn ? TS : null,
  };
}

describe('computeSubmissionStatusByGame — own allScorecardsSubmitted', () => {
  it.each<[string, MatchPlayerRow[], boolean]>([
    ['no players at all', [], false],
    ['one non-withdrawn, not submitted', [player(false)], false],
    ['all players submitted', [player(true), player(true)], true],
    [
      'all but one withdrawn, the remaining one submitted',
      [player(true), player(false, true)],
      true,
    ],
    ['one submitted, one still out', [player(true), player(false)], false],
  ])('%s → %s', (_desc, players, expected) => {
    const map = computeSubmissionStatusByGame([
      { gameId: 'host', sourceGameId: null, players },
    ]);
    expect(map.get('host')!.allScorecardsSubmitted).toBe(expected);
  });
});

describe('derived-match inheritance (#1488 K4)', () => {
  it('a derived match inherits its host’s submitted=true', () => {
    const map = computeSubmissionStatusByGame([
      { gameId: 'host', sourceGameId: null, players: [player(true)] },
      // Derived owns no submissions of its own — empty player list would score
      // false without inheritance.
      { gameId: 'derived', sourceGameId: 'host', players: [] },
    ]);
    expect(map.get('host')!.allScorecardsSubmitted).toBe(true);
    expect(map.get('derived')!.allScorecardsSubmitted).toBe(true);
  });

  it('a derived match inherits its host’s submitted=false', () => {
    const map = computeSubmissionStatusByGame([
      { gameId: 'host', sourceGameId: null, players: [player(false)] },
      { gameId: 'derived', sourceGameId: 'host', players: [] },
    ]);
    expect(map.get('derived')!.allScorecardsSubmitted).toBe(false);
  });

  it('a derived match with no host in the set falls back to its own rows', () => {
    const map = computeSubmissionStatusByGame([
      { gameId: 'orphan', sourceGameId: 'missing-host', players: [player(true)] },
    ]);
    expect(map.get('orphan')!.allScorecardsSubmitted).toBe(true);
  });
});

describe('computeSubmissionStatusByGame — allPlayersWithdrawn (#1488 K5)', () => {
  it.each<[string, MatchPlayerRow[], boolean]>([
    ['no players at all', [], false],
    ['every player withdrawn', [player(false, true), player(false, true)], true],
    ['some withdrawn, one still in', [player(false, true), player(false)], false],
    ['nobody withdrawn', [player(true), player(true)], false],
  ])('%s → %s', (_desc, players, expected) => {
    const map = computeSubmissionStatusByGame([
      { gameId: 'host', sourceGameId: null, players },
    ]);
    expect(map.get('host')!.allPlayersWithdrawn).toBe(expected);
  });
});

describe('matchBlocksOneTapFinish (#1488 K5)', () => {
  it.each<[string, { allScorecardsSubmitted?: boolean; allPlayersWithdrawn?: boolean }, boolean]>([
    ['in progress / no players', { allScorecardsSubmitted: false, allPlayersWithdrawn: false }, true],
    ['all scorecards submitted', { allScorecardsSubmitted: true, allPlayersWithdrawn: false }, false],
    ['all players withdrawn', { allScorecardsSubmitted: false, allPlayersWithdrawn: true }, false],
    ['undefined fields default to blocking', {}, true],
  ])('%s → blocks=%s', (_desc, match, expected) => {
    expect(matchBlocksOneTapFinish(match)).toBe(expected);
  });
});
