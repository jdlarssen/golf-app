import { describe, it, expect } from 'vitest';
import { ACHIEVEMENT_MARKS, WALL_BADGE_ORDER } from './achievementMarks';

describe('ACHIEVEMENT_MARKS', () => {
  it('has the golf numeral for each wall badge, with a real minus sign', () => {
    expect(ACHIEVEMENT_MARKS).toEqual({
      holeInOne: '1',
      eagle: '\u22122',
      birdie: '\u22121',
      turkey: '3\u00d7',
    });
  });

  it('names a mark for every badge on the wall, in wall order', () => {
    expect(WALL_BADGE_ORDER).toEqual(['holeInOne', 'eagle', 'birdie', 'turkey']);
    for (const key of WALL_BADGE_ORDER) expect(ACHIEVEMENT_MARKS[key]).toBeTruthy();
  });
});
