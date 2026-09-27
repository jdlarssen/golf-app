import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/sync/writeScore', () => ({
  writeScore: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/sync/syncWorker', () => ({
  drainQueue: vi.fn().mockResolvedValue(undefined),
}));

import { writeScore } from '@/lib/sync/writeScore';
import { drainQueue } from '@/lib/sync/syncWorker';
import { PuttsSubmitPrompt } from './PuttsSubmitPrompt';

describe('PuttsSubmitPrompt', () => {
  // #2211: the chip wrote the page snapshot's strokes back with a fresh
  // stamp, overwriting a mate's later correction, and waited up to 30 s for
  // the next drain while «Lever ✓» stayed disabled.
  it('a chip writes only putts (snapshot strokes as fallback) and drains at once', async () => {
    render(
      <PuttsSubmitPrompt
        gameId="g1"
        userId="u1"
        puttedCount={1}
        playedCount={18}
        holes={[{ holeNumber: 16, par: 4, strokes: 5 }]}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '2 putter på Hull 16' }));
    });

    expect(writeScore).toHaveBeenCalledWith({
      gameId: 'g1',
      userId: 'u1',
      holeNumber: 16,
      putts: 2,
      fallbackStrokes: 5,
      enteredBy: 'u1',
    });
    expect(vi.mocked(writeScore).mock.calls[0]?.[0]).not.toHaveProperty('strokes');
    // The drain runs after the write has queued the item, not before it.
    expect(vi.mocked(drainQueue).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(writeScore).mock.invocationCallOrder[0]!,
    );
  });
});
