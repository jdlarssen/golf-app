// #2460 — Type B: the app's «Gjenta hver uke» wording is the web's, character for character.
// The approved text lives in `lib/games/weeklyRepeatCopyCases.ts`; the web asserts its message
// catalog against the same file (`app/[locale]/admin/games/new/sections/RepeatWeeklyCard.test.tsx`).
// Neither side imports the other.
import { REPEAT_FIXED, REPEAT_NEXT_CASES } from '../../../../lib/games/weeklyRepeatCopyCases';
import { parseOsloDateTimeLocal } from '../../../../lib/games/gamePayload';
import { REPEAT_WEEKLY_KICKER, REPEAT_WEEKLY_TITLE, repeatWeeklyNextText } from './repeatWeeklyCopy';

describe('the app’s «Gjenta hver uke» wording is the fixture’s', () => {
  it('the heading and the title', () => {
    expect(REPEAT_WEEKLY_KICKER).toBe(REPEAT_FIXED.kicker);
    expect(REPEAT_WEEKLY_TITLE).toBe(REPEAT_FIXED.title);
  });

  it.each(REPEAT_NEXT_CASES)('next round for $scheduledTeeOff', ({ scheduledTeeOff, text }) => {
    const teeOffAt = scheduledTeeOff ? parseOsloDateTimeLocal(scheduledTeeOff) : null;
    expect(repeatWeeklyNextText(teeOffAt)).toBe(text);
  });
});
