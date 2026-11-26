import type { ScoringHole } from '../modes/types';

// #2941 (F17) — shared fixture for a tee with a different par for men and
// ladies. The engines' tests, the rule-book test and the views' parity tests
// build their matches on the same course, so «two strokes for her» means the
// same everywhere: 18 holes, SI = hole number, par 4 for men and juniors, and
// par 5 for ladies on SI 1 and 2 (holes 1 and 2). Men 72, ladies 74.

export const MIXED_PAR_18: ScoringHole[] = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  strokeIndex: i + 1,
  parByGender: { mens: 4, ladies: i < 2 ? 5 : 4, juniors: 4 },
}));
