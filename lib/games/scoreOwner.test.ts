import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import { scoreOwnerForHole, scoreOwnerUserIds } from './scoreOwner';
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
