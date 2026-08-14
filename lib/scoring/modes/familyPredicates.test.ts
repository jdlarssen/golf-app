import { describe, it, expect } from 'vitest';
import {
  isStablefordFamily,
  isScrambleFamily,
  isAlternateShotMatchplay,
  isMatchplayFamily,
  supportsHoleSegment,
  modeCollapsesToTeamCard,
} from './types';
import type { GameMode } from './types';

/**
 * Type-A: familiepredikat-dekning. Disse fire funksjonene er single source of
 * truth for «er dette format X» på `game_mode`-baserte routing-/display-sjekker.
 * `isSoloFormat` og `formatPlayStyle` har egne testfiler; disse fire manglet.
 *
 * Eksplisitt ALL_MODES-liste: en ny GameMode MÅ legges til her (og i predikatet
 * der relevant) — ellers vil exhaustiveness-testen og de per-predikat-casene
 * feile og tvinge en oppdatering.
 */

const ALL_MODES: GameMode[] = [
  'best_ball',
  'stableford',
  'modified_stableford',
  'singles_matchplay',
  'solo_strokeplay',
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'wolf',
  'nassau',
  'skins',
  'bingo_bango_bongo',
  'nines',
  'round_robin',
  'acey_deucey',
  'shamble',
  'patsome',
  'gruesome_matchplay',
];

// ---------------------------------------------------------------------------
// isStablefordFamily
// ---------------------------------------------------------------------------

const STABLEFORD_TRUE: GameMode[] = ['stableford', 'modified_stableford'];
const STABLEFORD_FALSE: GameMode[] = ALL_MODES.filter(
  (m) => !STABLEFORD_TRUE.includes(m),
);

describe('isStablefordFamily', () => {
  it.each(STABLEFORD_TRUE)('returns true for stableford-family mode: %s', (mode) => {
    expect(isStablefordFamily(mode)).toBe(true);
  });

  it.each(STABLEFORD_FALSE)('returns false for non-stableford mode: %s', (mode) => {
    expect(isStablefordFamily(mode)).toBe(false);
  });

  it('classifies every GameMode (exhaustive coverage)', () => {
    for (const mode of ALL_MODES) {
      expect(typeof isStablefordFamily(mode)).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// isScrambleFamily
// ---------------------------------------------------------------------------

const SCRAMBLE_TRUE: GameMode[] = ['texas_scramble', 'ambrose', 'florida_scramble'];
const SCRAMBLE_FALSE: GameMode[] = ALL_MODES.filter((m) => !SCRAMBLE_TRUE.includes(m));

describe('isScrambleFamily', () => {
  it.each(SCRAMBLE_TRUE)('returns true for scramble-family mode: %s', (mode) => {
    expect(isScrambleFamily(mode)).toBe(true);
  });

  it.each(SCRAMBLE_FALSE)('returns false for non-scramble mode: %s', (mode) => {
    expect(isScrambleFamily(mode)).toBe(false);
  });

  it('classifies every GameMode (exhaustive coverage)', () => {
    for (const mode of ALL_MODES) {
      expect(typeof isScrambleFamily(mode)).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// isAlternateShotMatchplay
// ---------------------------------------------------------------------------

const ALT_SHOT_TRUE: GameMode[] = [
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
];
const ALT_SHOT_FALSE: GameMode[] = ALL_MODES.filter((m) => !ALT_SHOT_TRUE.includes(m));

describe('isAlternateShotMatchplay', () => {
  it.each(ALT_SHOT_TRUE)(
    'returns true for alternate-shot matchplay mode: %s',
    (mode) => {
      expect(isAlternateShotMatchplay(mode)).toBe(true);
    },
  );

  it.each(ALT_SHOT_FALSE)(
    'returns false for non-alternate-shot mode: %s',
    (mode) => {
      expect(isAlternateShotMatchplay(mode)).toBe(false);
    },
  );

  it('classifies every GameMode (exhaustive coverage)', () => {
    for (const mode of ALL_MODES) {
      expect(typeof isAlternateShotMatchplay(mode)).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// isMatchplayFamily
// ---------------------------------------------------------------------------

// singles + fourball + all alternate-shot variants
const MATCHPLAY_TRUE: GameMode[] = [
  'singles_matchplay',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
];
const MATCHPLAY_FALSE: GameMode[] = ALL_MODES.filter(
  (m) => !MATCHPLAY_TRUE.includes(m),
);

describe('isMatchplayFamily', () => {
  it.each(MATCHPLAY_TRUE)('returns true for matchplay-family mode: %s', (mode) => {
    expect(isMatchplayFamily(mode)).toBe(true);
  });

  it.each(MATCHPLAY_FALSE)('returns false for non-matchplay mode: %s', (mode) => {
    expect(isMatchplayFamily(mode)).toBe(false);
  });

  it('classifies every GameMode (exhaustive coverage)', () => {
    for (const mode of ALL_MODES) {
      expect(typeof isMatchplayFamily(mode)).toBe('boolean');
    }
  });

  it('includes all alternate-shot variants (isMatchplayFamily ⊇ isAlternateShotMatchplay)', () => {
    for (const mode of ALT_SHOT_TRUE) {
      expect(isMatchplayFamily(mode)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// supportsHoleSegment (#1441, D11)
// ---------------------------------------------------------------------------

// Matchplay family + best_ball (back9-host for the derived singles matches).
const SEGMENT_TRUE: GameMode[] = [...MATCHPLAY_TRUE, 'best_ball'];
const SEGMENT_FALSE: GameMode[] = ALL_MODES.filter((m) => !SEGMENT_TRUE.includes(m));

describe('supportsHoleSegment', () => {
  it.each(SEGMENT_TRUE)('returns true for segment-eligible mode: %s', (mode) => {
    expect(supportsHoleSegment(mode)).toBe(true);
  });

  it.each(SEGMENT_FALSE)('returns false for non-segment-eligible mode: %s', (mode) => {
    expect(supportsHoleSegment(mode)).toBe(false);
  });

  it('classifies every GameMode (exhaustive coverage)', () => {
    for (const mode of ALL_MODES) {
      expect(typeof supportsHoleSegment(mode)).toBe('boolean');
    }
  });

  it('includes all of isMatchplayFamily (supportsHoleSegment ⊇ isMatchplayFamily)', () => {
    for (const mode of MATCHPLAY_TRUE) {
      expect(supportsHoleSegment(mode)).toBe(true);
    }
  });

  it('additionally includes best_ball (the D11 revision over isMatchplayFamily)', () => {
    expect(supportsHoleSegment('best_ball')).toBe(true);
    expect(isMatchplayFamily('best_ball')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// modeCollapsesToTeamCard (#1538)
// ---------------------------------------------------------------------------

// The set the hole page collapses into ONE card per team: scramble family +
// alternate-shot matchplay, unconditionally, plus patsome from hole 7.
const COLLAPSE_ALWAYS: GameMode[] = [...SCRAMBLE_TRUE, ...ALT_SHOT_TRUE];
const COLLAPSE_NEVER: GameMode[] = ALL_MODES.filter(
  (m) => !COLLAPSE_ALWAYS.includes(m) && m !== 'patsome',
);

describe('modeCollapsesToTeamCard', () => {
  it.each(COLLAPSE_ALWAYS)('returns true for team-card mode: %s', (mode) => {
    expect(modeCollapsesToTeamCard(mode)).toBe(true);
  });

  it.each(COLLAPSE_ALWAYS)(
    'stays true on every hole for hole-independent mode: %s',
    (mode) => {
      for (const hole of [1, 6, 7, 18]) {
        expect(modeCollapsesToTeamCard(mode, hole)).toBe(true);
      }
    },
  );

  it.each(COLLAPSE_NEVER)('returns false for per-player mode: %s', (mode) => {
    expect(modeCollapsesToTeamCard(mode)).toBe(false);
    for (const hole of [1, 6, 7, 18]) {
      expect(modeCollapsesToTeamCard(mode, hole)).toBe(false);
    }
  });

  it.each([1, 2, 3, 4, 5, 6])(
    'patsome hole %i is still 4BBB — every player owns their own rows',
    (hole) => {
      expect(modeCollapsesToTeamCard('patsome', hole)).toBe(false);
    },
  );

  it.each([7, 8, 12, 18])(
    'patsome hole %i is the foursomes segment — the team shares one card',
    (hole) => {
      expect(modeCollapsesToTeamCard('patsome', hole)).toBe(true);
    },
  );

  it('patsome without a hole number is NOT collapsed (the 4BBB half is the safe default)', () => {
    expect(modeCollapsesToTeamCard('patsome')).toBe(false);
  });

  it('includes ambrose and florida_scramble, not just texas (they share the captain row)', () => {
    expect(modeCollapsesToTeamCard('ambrose')).toBe(true);
    expect(modeCollapsesToTeamCard('florida_scramble')).toBe(true);
  });

  it('excludes the per-player team formats best_ball / fourball / shamble', () => {
    expect(modeCollapsesToTeamCard('best_ball')).toBe(false);
    expect(modeCollapsesToTeamCard('fourball_matchplay')).toBe(false);
    expect(modeCollapsesToTeamCard('shamble')).toBe(false);
  });

  it('classifies every GameMode (exhaustive coverage)', () => {
    for (const mode of ALL_MODES) {
      expect(typeof modeCollapsesToTeamCard(mode, 18)).toBe('boolean');
    }
  });
});
