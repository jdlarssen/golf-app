import { describe, expect, it, vi } from 'vitest';
import { IN_CHUNK, chunkIds, readInChunks } from './inboxReads';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe('chunkIds', () => {
  it.each([
    [0, []],
    [1, [1]],
    [100, [100]],
    [101, [100, 1]],
    [250, [100, 100, 50]],
  ] as const)('%i ids → slices of %j', (n, sizes) => {
    expect(chunkIds(ids(n)).map((c) => c.length)).toEqual(sizes);
  });

  it('drops duplicates before slicing', () => {
    expect(chunkIds(['a', 'b', 'a', 'c', 'b'])).toEqual([['a', 'b', 'c']]);
  });

  it('never more than IN_CHUNK per slice (PostgREST puts .in() in the URL)', () => {
    expect(IN_CHUNK).toBeLessThanOrEqual(100);
  });
});

describe('readInChunks', () => {
  it('no ids → no request', async () => {
    const read = vi.fn();
    expect(await readInChunks([], read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('480 ids → five reads of at most 100, rows joined', async () => {
    const read = vi.fn(async (slice: string[]) => ({ data: slice.map((id) => ({ id })), error: null }));
    const rows = await readInChunks(ids(480), read);
    expect(read).toHaveBeenCalledTimes(5);
    expect(read.mock.calls.every(([slice]) => slice.length <= 100)).toBe(true);
    expect(rows).toHaveLength(480);
  });

  it('a failed slice throws, so the page goes to its error boundary instead of guessing', async () => {
    const boom = { message: 'fetch failed' };
    const read = vi.fn(async (slice: string[]) =>
      slice[0] === 'id-100' ? { data: null, error: boom } : { data: [], error: null },
    );
    await expect(readInChunks(ids(250), read)).rejects.toBe(boom);
  });
});
