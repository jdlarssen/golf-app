import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import {
  ownedScoreRows,
  scoreOwnerForHole,
  scoreOwnerUserIds,
  scoredHoleNumbers,
} from './scoreOwner';
import { teamScoreOwnerId } from './teamCaptain';

// Lex-min decides the captain (pickTeamCaptain), so 'a-…' sorts ahead of
// 'u-…' — the viewer is deliberately NOT the row owner in these cases.
const VIEWER = 'u-viewer';
const CAPTAIN = 'a-captain';

const PER_PLAYER_MODES: GameMode[] = [
  'solo_strokeplay',
  'stableford',
  'modified_stableford',
  'best_ball',
  'shamble',
  'singles_matchplay',
  'fourball_matchplay',
  'wolf',
  'skins',
];

const COLLAPSED_MODES: GameMode[] = [
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
];

describe('scoreOwnerForHole', () => {
  it.each(
    PER_PLAYER_MODES.flatMap((mode) =>
      [1, 7, 18].map((holeNumber) => ({ mode, holeNumber })),
    ),
  )(
    '$mode hole $holeNumber → the viewer owns their own row',
    ({ mode, holeNumber }) => {
      expect(scoreOwnerForHole(mode, holeNumber, VIEWER, CAPTAIN)).toBe(VIEWER);
    },
  );

  it.each(
    COLLAPSED_MODES.flatMap((mode) =>
      [1, 6, 7, 18].map((holeNumber) => ({ mode, holeNumber })),
    ),
  )(
    '$mode hole $holeNumber → the captain owns the shared row',
    ({ mode, holeNumber }) => {
      expect(scoreOwnerForHole(mode, holeNumber, VIEWER, CAPTAIN)).toBe(CAPTAIN);
    },
  );

  it.each([1, 2, 3, 4, 5, 6])(
    'patsome hole %i is 4BBB → the viewer owns their own row',
    (holeNumber) => {
      expect(scoreOwnerForHole('patsome', holeNumber, VIEWER, CAPTAIN)).toBe(
        VIEWER,
      );
    },
  );

  it.each([7, 8, 12, 13, 18])(
    'patsome hole %i is foursomes → the captain owns the shared row',
    (holeNumber) => {
      expect(scoreOwnerForHole('patsome', holeNumber, VIEWER, CAPTAIN)).toBe(
        CAPTAIN,
      );
    },
  );

  it('falls back to the viewer when the team has no owner (empty / all withdrawn)', () => {
    expect(scoreOwnerForHole('texas_scramble', 4, VIEWER, null)).toBe(VIEWER);
    expect(scoreOwnerForHole('patsome', 18, VIEWER, null)).toBe(VIEWER);
  });

  it('is the identity for the captain themselves — their seat is unchanged', () => {
    expect(scoreOwnerForHole('texas_scramble', 4, CAPTAIN, CAPTAIN)).toBe(
      CAPTAIN,
    );
    expect(scoreOwnerForHole('ambrose', 18, CAPTAIN, CAPTAIN)).toBe(CAPTAIN);
  });

  it('follows teamScoreOwnerId to the lex-min ACTIVE member when the captain withdrew', () => {
    const team = [
      { user_id: 'a-captain', withdrawn_at: '2026-08-14T10:00:00Z' },
      { user_id: 'b-mate', withdrawn_at: null },
      { user_id: VIEWER, withdrawn_at: null },
    ];
    expect(
      scoreOwnerForHole('texas_scramble', 4, VIEWER, teamScoreOwnerId(team)),
    ).toBe('b-mate');
  });

  it('falls back to the viewer when every team member withdrew', () => {
    const team = [
      { user_id: 'a-captain', withdrawn_at: '2026-08-14T10:00:00Z' },
      { user_id: VIEWER, withdrawn_at: '2026-08-14T10:00:00Z' },
    ];
    expect(
      scoreOwnerForHole('texas_scramble', 4, VIEWER, teamScoreOwnerId(team)),
    ).toBe(VIEWER);
  });
});

describe('scoreOwnerUserIds', () => {
  it.each(PER_PLAYER_MODES)(
    '%s asks only for the viewer, even with a captain in the team',
    (mode) => {
      expect(scoreOwnerUserIds(mode, VIEWER, CAPTAIN)).toEqual([VIEWER]);
    },
  );

  it.each(COLLAPSED_MODES)('%s asks for viewer + captain', (mode) => {
    expect(scoreOwnerUserIds(mode, VIEWER, CAPTAIN)).toEqual([VIEWER, CAPTAIN]);
  });

  it('patsome asks for both — it owns holes 1–6 itself and the captain owns 7–18', () => {
    expect(scoreOwnerUserIds('patsome', VIEWER, CAPTAIN)).toEqual([
      VIEWER,
      CAPTAIN,
    ]);
  });

  it('asks only for the viewer when they ARE the captain (no duplicate id)', () => {
    expect(scoreOwnerUserIds('texas_scramble', CAPTAIN, CAPTAIN)).toEqual([
      CAPTAIN,
    ]);
  });

  it('asks only for the viewer when the team has no owner', () => {
    expect(scoreOwnerUserIds('texas_scramble', VIEWER, null)).toEqual([VIEWER]);
  });
});

describe('scoredHoleNumbers', () => {
  const row = (userId: string, holeNumber: number) => ({ userId, holeNumber });

  it('returns nothing for an empty, null or undefined row list', () => {
    expect(scoredHoleNumbers([], 'best_ball', VIEWER, null)).toEqual([]);
    expect(scoredHoleNumbers(null, 'best_ball', VIEWER, null)).toEqual([]);
    expect(scoredHoleNumbers(undefined, 'best_ball', VIEWER, null)).toEqual([]);
  });

  it('keeps the viewer’s own holes in a per-player mode', () => {
    expect(
      scoredHoleNumbers(
        [row(VIEWER, 3), row(VIEWER, 4)],
        'best_ball',
        VIEWER,
        null,
      ),
    ).toEqual([3, 4]);
  });

  it('drops rows owned by someone else — a stranger’s row never counts as mine', () => {
    expect(
      scoredHoleNumbers(
        [row(VIEWER, 3), row(CAPTAIN, 4)],
        'best_ball',
        VIEWER,
        null,
      ),
    ).toEqual([3]);
  });

  it('counts the captain’s shared rows in a team-collapsed mode, not the viewer’s stale ones', () => {
    expect(
      scoredHoleNumbers(
        [row(CAPTAIN, 1), row(VIEWER, 2), row(CAPTAIN, 5)],
        'texas_scramble',
        VIEWER,
        CAPTAIN,
      ),
    ).toEqual([1, 5]);
  });

  it('patsome splits per hole: the viewer owns 1–6, the captain owns 7–18', () => {
    expect(
      scoredHoleNumbers(
        [
          row(VIEWER, 6),
          row(CAPTAIN, 6),
          row(VIEWER, 7),
          row(CAPTAIN, 7),
          row(CAPTAIN, 18),
        ],
        'patsome',
        VIEWER,
        CAPTAIN,
      ),
    ).toEqual([6, 7, 18]);
  });

  it('falls back to the viewer’s rows when the team has no owner', () => {
    expect(
      scoredHoleNumbers(
        [row(VIEWER, 2), row(CAPTAIN, 3)],
        'texas_scramble',
        VIEWER,
        null,
      ),
    ).toEqual([2]);
  });
});

describe('ownedScoreRows', () => {
  it('keeps the surviving rows themselves, extra fields intact (#1715)', () => {
    const mine = { userId: VIEWER, holeNumber: 4, strokes: 5 };
    const theirs = { userId: 'u-stranger', holeNumber: 6, strokes: 7 };
    const kept = ownedScoreRows([mine, null, theirs], 'best_ball', VIEWER, null);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toBe(mine);
  });
});
