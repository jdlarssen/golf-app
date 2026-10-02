import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRAMES, FRAME_DELAYS_MS, playFrames } from './landingLiveBoardFrames';

/**
 * Type A (#2261): the front page's board card plays holes 12 and 13 once and
 * stops. Fake timers are the system boundary; the sample data must read like
 * a real board (sorted by points, arrows that match the move).
 */
describe('playFrames', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows frame 2 at 2.5 s and frame 3 at 5 s, then leaves no timers', () => {
    const onFrame = vi.fn();
    playFrames({ delaysMs: FRAME_DELAYS_MS, reducedMotion: false, onFrame });

    vi.advanceTimersByTime(2499);
    expect(onFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFrame.mock.calls).toEqual([[1]]);
    vi.advanceTimersByTime(2500);
    expect(onFrame.mock.calls).toEqual([[1], [2]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts no timers with reduced motion', () => {
    const onFrame = vi.fn();
    playFrames({ delaysMs: FRAME_DELAYS_MS, reducedMotion: true, onFrame });

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(6000);
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('stop() freezes the card on the frame it shows and clears the rest', () => {
    const onFrame = vi.fn();
    const stop = playFrames({
      delaysMs: FRAME_DELAYS_MS,
      reducedMotion: false,
      onFrame,
    });

    vi.advanceTimersByTime(3000);
    stop();
    stop(); // safe to call twice (unmount after a freeze)
    vi.advanceTimersByTime(3000);
    expect(onFrame.mock.calls).toEqual([[1]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resumes from the frame it shows: only the rest, on the same clock', () => {
    // Next keeps a route hidden and re-runs its effects when Back shows it
    // again; the card must go on from where it stood, never back to 11.
    const onFrame = vi.fn();
    playFrames({
      delaysMs: FRAME_DELAYS_MS,
      reducedMotion: false,
      from: 1,
      onFrame,
    });

    vi.advanceTimersByTime(2499);
    expect(onFrame).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFrame.mock.calls).toEqual([[2]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts nothing from the last frame', () => {
    const onFrame = vi.fn();
    playFrames({
      delaysMs: FRAME_DELAYS_MS,
      reducedMotion: false,
      from: FRAMES.length - 1,
      onFrame,
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('plays one step per frame after the first', () => {
    expect(FRAME_DELAYS_MS).toHaveLength(FRAMES.length - 1);
  });
});

describe('FRAMES', () => {
  it.each(FRAMES.map((frame, index) => [frame.hole, index] as const))(
    'hole %i is sorted by points, highest first',
    (_hole, index) => {
      const points = FRAMES[index].rows.map((row) => row.points);
      expect(points).toEqual([...points].sort((a, b) => b - a));
    },
  );

  it.each(FRAMES.slice(1).map((frame, i) => [frame.hole, i + 1] as const))(
    'on hole %i every arrow matches the move since the frame before',
    (_hole, index) => {
      const before = FRAMES[index - 1].rows.map((row) => row.name);
      for (const [place, row] of FRAMES[index].rows.entries()) {
        const moved = before.indexOf(row.name) - place;
        if (moved === 0) {
          expect(row.move, row.name).toBeUndefined();
        } else {
          expect(row.move, row.name).toEqual({
            dir: moved > 0 ? 'up' : 'down',
            by: Math.abs(moved),
          });
        }
      }
    },
  );
});
