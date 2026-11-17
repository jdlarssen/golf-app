// #2460 — Type B: the app's «Gjenta hver uke» wording is the web's, character for character.
// The approved text lives in `lib/games/weeklyRepeatCopyCases.ts`; the web asserts its message
// catalog against the same file (`app/[locale]/admin/games/new/sections/RepeatWeeklyCard.test.tsx`).
// Neither side imports the other.
//
// The case's tee-off is a wall clock. The app reads the draft's instant on the DEVICE's clock
// (no Oslo `Intl` under Hermes), so the instant is built from the same wall clock in the
// device's zone. jest pins TZ=UTC: an Oslo conversion slipping back in would move the hour
// and turn this red.
import { REPEAT_FIXED, REPEAT_NEXT_CASES } from '../../../../lib/games/weeklyRepeatCopyCases';
import { REPEAT_WEEKLY_KICKER, REPEAT_WEEKLY_TITLE, repeatWeeklyNextText } from './repeatWeeklyCopy';

function deviceInstant(wallClock: string): string {
  const [date, time] = wallClock.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}

describe('the app’s «Gjenta hver uke» wording is the fixture’s', () => {
  it('the heading and the title', () => {
    expect(REPEAT_WEEKLY_KICKER).toBe(REPEAT_FIXED.kicker);
    expect(REPEAT_WEEKLY_TITLE).toBe(REPEAT_FIXED.title);
  });

  it.each(REPEAT_NEXT_CASES)('next round for $scheduledTeeOff', ({ scheduledTeeOff, text }) => {
    const teeOffAt = scheduledTeeOff ? deviceInstant(scheduledTeeOff) : null;
    expect(repeatWeeklyNextText(teeOffAt)).toBe(text);
  });
});
