import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import {
  ownedScoreRows,
  scoreOwnerForHole,
  scoreOwnerUserIds,
  scoredHoleNumbers,
  sharedCardUserIds,
  type SharedCardRosterRow,
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

// #2067: the captain deleted their account mid-round, so their row is
// withdrawn and ownership moved to the next member. The holes entered before
// that still sit on the former captain; the helpers fetch and fold them in.
describe('former row owners (#2067)', () => {
  const FORMER = 'a-former';
  const OWNER = 'b-owner';
  const row = (userId: string, holeNumber: number, strokes: number | null = 4) => ({
    userId,
    holeNumber,
    strokes,
  });

  it.each(COLLAPSED_MODES)('%s asks for the former owners too', (mode) => {
    expect(scoreOwnerUserIds(mode, VIEWER, OWNER, [FORMER])).toEqual([
      VIEWER,
      OWNER,
      FORMER,
    ]);
  });

  it('asks for the former owners when the viewer is the new owner', () => {
    expect(scoreOwnerUserIds('texas_scramble', OWNER, OWNER, [FORMER])).toEqual([
      OWNER,
      FORMER,
    ]);
  });

  it.each(PER_PLAYER_MODES)('%s ignores former owners', (mode) => {
    expect(scoreOwnerUserIds(mode, VIEWER, OWNER, [FORMER])).toEqual([VIEWER]);
  });

  it('asks only for the viewer when the team has no owner, former owners or not', () => {
    expect(scoreOwnerUserIds('texas_scramble', VIEWER, null, [FORMER])).toEqual([
      VIEWER,
    ]);
  });

  it('counts the holes entered on the former owner together with the new ones', () => {
    const rows = [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => row(FORMER, h)),
      ...[10, 11, 12].map((h) => row(OWNER, h)),
    ];

    expect(
      scoredHoleNumbers(rows, 'texas_scramble', VIEWER, OWNER, [FORMER]).sort(
        (a, b) => a - b,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('keeps counting holes without a strokes field as entered (pre-filtered rows)', () => {
    expect(
      scoredHoleNumbers(
        [{ userId: FORMER, holeNumber: 3 }],
        'texas_scramble',
        OWNER,
        OWNER,
        [FORMER],
      ),
    ).toEqual([3]);
  });

  it('lets the new owner’s correction win and returns it on the owner', () => {
    const kept = ownedScoreRows(
      [row(FORMER, 5, 4), row(OWNER, 5, 7)],
      'texas_scramble',
      VIEWER,
      OWNER,
      [FORMER],
    );

    expect(kept).toEqual([row(OWNER, 5, 7)]);
  });

  it('shows the former value when the new owner’s row is empty', () => {
    const kept = ownedScoreRows(
      [row(FORMER, 5, 4), row(OWNER, 5, null)],
      'texas_scramble',
      VIEWER,
      OWNER,
      [FORMER],
    );

    expect(kept).toEqual([row(OWNER, 5, 4)]);
  });

  it('patsome keeps the viewer’s own ball on 1–6 and folds 7–18', () => {
    expect(
      scoredHoleNumbers(
        [row(FORMER, 6), row(OWNER, 6), row(FORMER, 7), row(FORMER, 8)],
        'patsome',
        OWNER,
        OWNER,
        [FORMER],
      ),
    ).toEqual([6, 7, 8]);
  });

  it('leaves untouched rows as the same objects', () => {
    const mine = { userId: VIEWER, holeNumber: 4, strokes: 5 };
    const kept = ownedScoreRows([mine], 'best_ball', VIEWER, null, [FORMER]);
    expect(kept[0]).toBe(mine);
  });
});

describe('sharedCardUserIds (#2213)', () => {
  // Team 1 is the card being reopened: the captain (lex-min) owns the shared
  // rows, the viewer holds a card that reads them. Team 2 must never be touched.
  const TEAMS: SharedCardRosterRow[] = [
    { user_id: CAPTAIN, team_number: 1, withdrawn_at: null },
    { user_id: VIEWER, team_number: 1, withdrawn_at: null },
    { user_id: 'c-other', team_number: 2, withdrawn_at: null },
    { user_id: 'd-other', team_number: 2, withdrawn_at: null },
  ];
  const WITH_WITHDRAWN: SharedCardRosterRow[] = [
    ...TEAMS,
    { user_id: 'b-gone', team_number: 1, withdrawn_at: '2026-09-20T10:00:00Z' },
  ];
  const NO_TEAM: SharedCardRosterRow[] = [
    { user_id: VIEWER, team_number: null, withdrawn_at: null },
    { user_id: CAPTAIN, team_number: 1, withdrawn_at: null },
  ];

  it.each<[string, GameMode, SharedCardRosterRow[], string, string[]]>([
    ['best_ball: own ball, only the card itself', 'best_ball', TEAMS, VIEWER, [VIEWER]],
    ['texas_scramble: the whole active team', 'texas_scramble', TEAMS, VIEWER, [CAPTAIN, VIEWER]],
    ['foursomes_matchplay: the whole active team', 'foursomes_matchplay', TEAMS, VIEWER, [CAPTAIN, VIEWER]],
    ['a withdrawn teammate is left out', 'texas_scramble', WITH_WITHDRAWN, CAPTAIN, [CAPTAIN, VIEWER]],
    ['patsome: the team, since 7–18 sit on the captain’s row', 'patsome', TEAMS, VIEWER, [CAPTAIN, VIEWER]],
    ['team_number null: only the card itself', 'texas_scramble', NO_TEAM, VIEWER, [VIEWER]],
  ])('%s', (_label, mode, roster, userId, expected) => {
    expect(sharedCardUserIds(mode, roster, userId)).toEqual(expected);
  });
});
