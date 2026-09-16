import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PAGES,
  PAGE_SIZE,
  selectAllRows,
  selectAllRowsResult,
} from './selectAllRows';

/** A fake PostgREST table: serves `.range(from, to)` slices, capped like the server. */
function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const page = vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, Math.min(to + 1, from + PAGE_SIZE)),
    error: null,
  }));
  return { rows, page };
}

describe('selectAllRows', () => {
  it.each([
    // [rows in table, expected page requests]
    [0, 1],
    [999, 1],
    [1000, 2], // a full page is not proof of the end: ask once more
    [1001, 2],
    [2700, 3],
  ])('reads all %i rows in %i page request(s)', async (total, requests) => {
    const { rows, page } = fakeTable(total);

    const result = await selectAllRows(page, 'test');

    expect(result).toEqual(rows);
    expect(page).toHaveBeenCalledTimes(requests);
  });

  it('asks for contiguous, inclusive ranges', async () => {
    const { page } = fakeTable(2001);

    await selectAllRows(page, 'test');

    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('treats null data on a page as an empty page', async () => {
    const page = vi.fn(async () => ({ data: null, error: null }));

    expect(await selectAllRows(page, 'test')).toEqual([]);
  });

  it('throws when a later page fails instead of returning the first page', async () => {
    const page = vi.fn(async (from: number) =>
      from === 0
        ? { data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })), error: null }
        : { data: null, error: { message: 'boom' } },
    );

    await expect(selectAllRows(page, 'loadScores')).rejects.toThrow(
      'loadScores: page 2 failed: boom',
    );
  });

  it('throws instead of looping forever past the page guard', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i }));
    const page = vi.fn(async () => ({ data: full, error: null }));

    await expect(selectAllRows(page, 'loadScores')).rejects.toThrow(
      `loadScores: more than ${MAX_PAGES} pages`,
    );
    expect(page).toHaveBeenCalledTimes(MAX_PAGES);
  });
});

describe('selectAllRowsResult', () => {
  it('returns all rows in a { data, error: null } result', async () => {
    const { rows, page } = fakeTable(1500);

    expect(await selectAllRowsResult(page, 'test')).toEqual({ data: rows, error: null });
  });

  it('returns the failure as { data: null, error } instead of throwing', async () => {
    const page = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));

    const result = await selectAllRowsResult(page, 'loadScores');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('loadScores: page 1 failed: boom');
  });
});
