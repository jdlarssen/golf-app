// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (audit 2026-11-20): a course edit expires the cached game of every
 * round on that course. The cached game carries the tee's ratings and par
 * (getGameWithPlayers), so without this the game pages showed the old tee for
 * up to 15 minutes.
 */

let respond: (op: QueryOp) => QueryResponse = () => ({ data: [] });
const fake = createAdminClientMock({ respond: (op) => respond(op) });
const expireGameCacheMock = vi.fn();
vi.mock('./expireGameCache', () => ({ expireGameCache: (id: string) => expireGameCacheMock(id) }));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expireCourseGameCaches } from './expireCourseGameCaches';

const client = fake.client as unknown as SupabaseClient<Database>;

beforeEach(() => {
  fake.reset();
  expireGameCacheMock.mockReset();
});

describe('expireCourseGameCaches', () => {
  it('expires every game on the course, and reads only that course', async () => {
    respond = () => ({ data: [{ id: 'game-a' }, { id: 'game-b' }] });

    await expireCourseGameCaches(client, 'course-1');

    expect(expireGameCacheMock.mock.calls).toEqual([['game-a'], ['game-b']]);
    const read = fake.ops.find((op) => op.table === 'games');
    expect(read?.filters).toContainEqual(expect.objectContaining({ column: 'course_id', value: 'course-1' }));
    // Finished rounds are frozen; leaving them out keeps the read small.
    expect(read?.filters).toContainEqual(
      expect.objectContaining({ op: 'in', column: 'status', value: ['draft', 'scheduled', 'active'] }),
    );
  });

  it('a failed read is logged and never stops the save that already landed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    respond = () => ({ data: null, error: { message: 'read failed' } });

    await expect(expireCourseGameCaches(client, 'course-1')).resolves.toBeUndefined();
    expect(expireGameCacheMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
