import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ReactionSummary } from '@/lib/games/reactions/aggregate';

type Opts = { onResubscribed?: () => void };
const subscribeRealtimeChannel = vi.fn<
  (topic: string, configure: unknown, opts?: Opts) => () => void
>(() => () => {});

vi.mock('@/lib/sync/realtimeChannel', () => ({
  subscribeRealtimeChannel: (topic: string, configure: unknown, opts?: Opts) =>
    subscribeRealtimeChannel(topic, configure, opts),
}));

const getReactionsSummary = vi.fn<(gameId: string) => Promise<ReactionSummary>>();
const toggleReaction = vi.fn(async () => undefined);

vi.mock('./actions', () => ({
  getReactionsSummary: (gameId: string) => getReactionsSummary(gameId),
  toggleReaction: () => toggleReaction(),
}));

import { ReactionsProvider, useReactionsContext } from './ReactionsProvider';

function Probe() {
  const ctx = useReactionsContext()!;
  return (
    <>
      <span data-testid="fire">{ctx.getRow('u1').counts['🔥'] ?? 0}</span>
      <button type="button" onClick={() => ctx.toggle('u1', '🔥')}>
        toggle
      </button>
    </>
  );
}

function fire(count: number): ReactionSummary {
  return { u1: { counts: { '🔥': count }, mine: [] } };
}

/** A summary request the test answers when it chooses. */
function deferred() {
  let resolve!: (value: ReactionSummary) => void;
  const promise = new Promise<ReactionSummary>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function issueRefetch() {
  const opts = subscribeRealtimeChannel.mock.calls[0]![2]!;
  await act(async () => {
    opts.onResubscribed!();
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe('ReactionsProvider refetch order (#2094)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribeRealtimeChannel.mockClear();
    getReactionsSummary.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the newer summary when an older refetch answers last', async () => {
    const older = deferred();
    const newer = deferred();
    getReactionsSummary
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    render(
      <ReactionsProvider gameId="g1" initial={fire(0)}>
        <Probe />
      </ReactionsProvider>,
    );

    await issueRefetch();
    await issueRefetch();
    await act(async () => {
      newer.resolve(fire(2));
    });
    await act(async () => {
      older.resolve(fire(1));
    });

    expect(screen.getByTestId('fire').textContent).toBe('2');
  });

  it('does not let a refetch issued before a toggle wipe the toggle', async () => {
    const beforeToggle = deferred();
    getReactionsSummary.mockReturnValueOnce(beforeToggle.promise);
    render(
      <ReactionsProvider gameId="g1" initial={fire(0)}>
        <Probe />
      </ReactionsProvider>,
    );

    await issueRefetch();
    await act(async () => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });
    expect(screen.getByTestId('fire').textContent).toBe('1');

    // Answered with the row as it stood before the toggle committed.
    await act(async () => {
      beforeToggle.resolve(fire(0));
    });

    expect(screen.getByTestId('fire').textContent).toBe('1');
  });
});
