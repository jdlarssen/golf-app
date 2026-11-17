import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { REPEAT_FIXED, REPEAT_NEXT_CASES } from '@/lib/games/weeklyRepeatCopyCases';
import { RepeatWeeklyCard, useRepeatWeeklyNextText } from './RepeatWeeklyCard';

// #2460 — Type B: the web's «Gjenta hver uke» wording is the app's, character for
// character. The approved text lives in `lib/games/weeklyRepeatCopyCases.ts`; the app
// asserts its own copy against the same file (`native/app/src/lib/repeatWeeklyCopy.parity.test.ts`).
describe('the «Gjenta hver uke» wording is the fixture’s', () => {
  it.each(REPEAT_NEXT_CASES)('next round for $scheduledTeeOff', ({ scheduledTeeOff, text }) => {
    const nextText = renderHook(() => useRepeatWeeklyNextText()).result.current;
    expect(nextText(scheduledTeeOff)).toBe(text);
  });
});

// Type C: the switch names itself, says when the next round is only while it is on, and
// posts itself where GameForm gives it a name.
describe('RepeatWeeklyCard', () => {
  it('is a named switch that shows the next round only when on, and posts with a name', () => {
    const onChange = vi.fn();
    const { rerender, container } = render(
      <form>
        <RepeatWeeklyCard checked={false} onChange={onChange} scheduledTeeOffAt="2026-10-03T09:00" name="repeat_weekly" />
      </form>,
    );
    expect(screen.getByText(REPEAT_FIXED.kicker)).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: REPEAT_FIXED.title });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText(REPEAT_NEXT_CASES[0].text)).toBeNull();
    expect(new FormData(container.querySelector('form')!).get('repeat_weekly')).toBeNull();

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(
      <form>
        <RepeatWeeklyCard checked onChange={onChange} scheduledTeeOffAt="2026-10-03T09:00" name="repeat_weekly" />
      </form>,
    );
    expect(screen.getByText(REPEAT_NEXT_CASES[0].text)).toBeInTheDocument();
    expect(new FormData(container.querySelector('form')!).get('repeat_weekly')).toBe('1');
  });
});
