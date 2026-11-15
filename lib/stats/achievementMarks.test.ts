import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENT_MARKS,
  RARE_MOMENT_MARK_KEY,
  RARE_MOMENT_ORDER,
  WALL_BADGE_ORDER,
} from './achievementMarks';

describe('ACHIEVEMENT_MARKS', () => {
  it('has the golf numeral for each wall badge, with a real minus sign', () => {
    expect(ACHIEVEMENT_MARKS).toEqual({
      holeInOne: '1',
      albatross: '\u22123',
      eagle: '\u22122',
      birdie: '\u22121',
      turkey: '3\u00d7',
    });
  });

  it('names a mark for every badge on the wall, in wall order', () => {
    expect(WALL_BADGE_ORDER).toEqual(['holeInOne', 'eagle', 'birdie', 'turkey']);
    for (const key of WALL_BADGE_ORDER) expect(ACHIEVEMENT_MARKS[key]).toBeTruthy();
  });

  it('keeps albatross off the wall: it only has a mark for «Sjeldne slag»', () => {
    expect(WALL_BADGE_ORDER).not.toContain('albatross');
  });
});

describe('RARE_MOMENT_ORDER', () => {
  it('is best first: hole-in-one, albatross, eagle', () => {
    expect(RARE_MOMENT_ORDER).toEqual(['hole_in_one', 'albatross', 'eagle']);
  });

  it('gives each rare shot the mark golf uses for it', () => {
    expect(RARE_MOMENT_ORDER.map((kind) => ACHIEVEMENT_MARKS[RARE_MOMENT_MARK_KEY[kind]])).toEqual(['1', '\u22123', '\u22122']);
  });
});
