import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { FilledRosterRow } from './filledHoles';
import { reviewScoreUserIds, reviewScoresByHolder } from './scorecardReviewData';

/**
 * Type A (#2213): the approval surfaces (/approve, the organiser's /spillere,
 * the Sekretariatet) show a card as it actually stands — the row owner's rows
 * per hole, the same rule the submit page has used since #1577.
 *
 * The ownership rules themselves (`teamScoreOwnerId`, `scoreOwnerForHole`,
 * `foldTeamScoreRows`) have their own suites and are not re-asserted here.
 * This file proves the review adapters ask them for the right ids and hand
 * back one card per holder.
 *
 * Captain = the lex-smallest ACTIVE user_id on the team (`teamScoreOwnerId`).
 */

const FORMER = '0f1e2d3c-0000-4000-8000-000000000000';
const CAPTAIN = '1a2b3c4d-0000-4000-8000-000000000001';
const MATE = '5e6f7a8b-0000-4000-8000-000000000002';
const OTHER_CAPTAIN = '9c0d1e2f-0000-4000-8000-000000000003';
const OTHER_MATE = 'c3d4e5f6-0000-4000-8000-000000000004';

const WITHDRAWN_AT = '2026-09-17T10:00:00+00:00';

function member(
  user_id: string,
  team_number: number | null,
  withdrawn_at: string | null = null,
): FilledRosterRow {
  return { user_id, team_number, withdrawn_at };
}

type Row = { user_id: string; hole_number: number; strokes: number | null };

/** Rows for holes `from..to` (inclusive), all owned by `user_id`. */
function rows(user_id: string, from: number, to: number, strokes: number): Row[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    user_id,
    hole_number: from + i,
    strokes,
  }));
}

/** The card as `[hole, strokes]` pairs for holes `from..to`. */
function holes(from: number, to: number, strokes: number): [number, number][] {
  return Array.from({ length: to - from + 1 }, (_, i) => [from + i, strokes]);
}

/** One holder's card as sorted `[hole, strokes]` pairs. */
function cardOf(
  result: Map<string, Map<number, number | null>>,
  holderId: string,
): [number, number | null][] {
  return [...(result.get(holderId) ?? new Map<number, number | null>()).entries()].sort(
    (a, b) => a[0] - b[0],
  );
}

const TWO_TEAMS = [
  member(MATE, 1),
  member(CAPTAIN, 1),
  member(OTHER_CAPTAIN, 2),
  member(OTHER_MATE, 2),
];

describe('reviewScoreUserIds', () => {
  it('best_ball: only the holders — every card owns its own rows', () => {
    expect(reviewScoreUserIds('best_ball', TWO_TEAMS, [MATE])).toEqual([MATE]);
  });

  it('texas_scramble: the holder plus the whole team, withdrawn members included (#2067)', () => {
    const roster = [
      member(FORMER, 1, WITHDRAWN_AT),
      member(CAPTAIN, 1),
      member(MATE, 1),
      member(OTHER_CAPTAIN, 2),
    ];

    expect(reviewScoreUserIds('texas_scramble', roster, [MATE]).sort()).toEqual(
      [FORMER, CAPTAIN, MATE].sort(),
    );
  });

  it('texas_scramble: two holders on one team fetch each id once', () => {
    expect(
      reviewScoreUserIds('texas_scramble', TWO_TEAMS, [MATE, CAPTAIN]).sort(),
    ).toEqual([CAPTAIN, MATE].sort());
  });

  it('a holder without a team gets only themselves, even in a collapsing mode', () => {
    const roster = [member(MATE, null), member(CAPTAIN, null)];

    expect(reviewScoreUserIds('texas_scramble', roster, [MATE])).toEqual([MATE]);
  });
});

describe('reviewScoresByHolder', () => {
  it.each<{
    name: string;
    mode: GameMode;
    roster: FilledRosterRow[];
    scores: Row[];
    expected: [number, number][];
  }>([
    {
      name: 'best_ball: the holder reads their own rows',
      mode: 'best_ball',
      roster: TWO_TEAMS,
      scores: [...rows(CAPTAIN, 1, 18, 4), ...rows(MATE, 1, 18, 5)],
      expected: holes(1, 18, 5),
    },
    {
      name: "texas_scramble: the teammate gets the captain's 18",
      mode: 'texas_scramble',
      roster: TWO_TEAMS,
      scores: rows(CAPTAIN, 1, 18, 4),
      expected: holes(1, 18, 4),
    },
    {
      name: "patsome: the non-captain gets own 1-6 and the captain's 7-18",
      mode: 'patsome',
      roster: TWO_TEAMS,
      scores: [...rows(CAPTAIN, 1, 18, 4), ...rows(MATE, 1, 18, 5)],
      expected: [...holes(1, 6, 5), ...holes(7, 18, 4)],
    },
    {
      name: "greensome_matchplay: the side's card is the captain's rows",
      mode: 'greensome_matchplay',
      roster: TWO_TEAMS,
      scores: [...rows(CAPTAIN, 1, 18, 4), ...rows(OTHER_CAPTAIN, 1, 18, 6)],
      expected: holes(1, 18, 4),
    },
    {
      name: "texas_scramble, withdrawn former captain (#2067): their rows fold into the team's card",
      mode: 'texas_scramble',
      roster: [member(FORMER, 1, WITHDRAWN_AT), member(CAPTAIN, 1), member(MATE, 1)],
      scores: [...rows(FORMER, 1, 9, 4), ...rows(CAPTAIN, 10, 18, 5)],
      expected: [...holes(1, 9, 4), ...holes(10, 18, 5)],
    },
  ])('$name', ({ mode, roster, scores, expected }) => {
    const result = reviewScoresByHolder({ rows: scores, mode, roster, holderIds: [MATE] });

    expect([...result.keys()]).toEqual([MATE]);
    expect(cardOf(result, MATE)).toEqual(expected);
  });

  it("keeps a cleared hole as null, and a former owner's entered row beats the owner's cleared one (#2067)", () => {
    // Unfiltered rows, as the review read returns them: `strokes: null` is a
    // hole somebody cleared. The fold reads `strokes`, so it must see them.
    const result = reviewScoresByHolder({
      mode: 'texas_scramble',
      roster: [member(FORMER, 1, WITHDRAWN_AT), member(CAPTAIN, 1), member(MATE, 1)],
      rows: [
        { user_id: FORMER, hole_number: 1, strokes: 4 },
        { user_id: CAPTAIN, hole_number: 1, strokes: null },
        { user_id: CAPTAIN, hole_number: 2, strokes: null },
      ],
      holderIds: [MATE],
    });

    expect(cardOf(result, MATE)).toEqual([
      [1, 4],
      [2, null],
    ]);
  });
});
