import { describe, expect, it } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { getMyClubs } from './getMyClubs';

type Client = Parameters<typeof getMyClubs>[0];

// #2490: a failed read must not look like «not in a club yet».
describe('getMyClubs', () => {
  it('maps membership rows to clubs', async () => {
    const supabase = buildSupabaseMock([
      {
        data: [{ role: 'admin', groups: { id: 'club-1', name: 'Oslo GK', short_id: 'OGK' } }],
        error: null,
      },
    ]);
    await expect(getMyClubs(supabase as unknown as Client, 'me')).resolves.toEqual({
      ok: true,
      clubs: [{ id: 'club-1', name: 'Oslo GK', short_id: 'OGK', role: 'admin' }],
    });
  });

  it('reports a failure instead of an empty list when the read errors', async () => {
    const supabase = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);
    await expect(getMyClubs(supabase as unknown as Client, 'me')).resolves.toEqual({
      ok: false,
    });
  });
});
