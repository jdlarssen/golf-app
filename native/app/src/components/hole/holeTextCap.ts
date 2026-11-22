// Caps on text scaling (iOS Dynamic Type, Android font scale) on the hole
// screen. Its rows, rail buttons and pills have fixed sizes from the design;
// at the largest accessibility sizes the text overflowed them, and a rail
// that grew without bound covered the flight it scores for.
//
// `HOLE_TEXT_CAP` is for words and rows, which wrap and grow (their boxes use
// `minHeight`). `HOLE_BOX_TEXT_CAP` is for digits inside a fixed shape: the
// hole strip's pills, the row's initials and score shape, the big hole number.

/** Words and row text: up to 1.5×, like the result board (#2756). */
export const HOLE_TEXT_CAP = 1.5;

/** Digits inside a fixed shape (as `HoleGrid` on the course screen). */
export const HOLE_BOX_TEXT_CAP = 1.2;
