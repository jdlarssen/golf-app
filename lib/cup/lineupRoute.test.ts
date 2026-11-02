// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

/** Type A (#2752): en feilet lesing er ikke «ingen tilgang», og hver kode får sin status. */

const access = vi.hoisted(() => ({ loadCupLineupAccessForUser: vi.fn() }));
vi.mock('./lineupAccess', () => ({ loadCupLineupAccessForUser: access.loadCupLineupAccessForUser }));

import { lineupAccessFor, lineupAnswer } from './lineupRoute';

describe('lineupAccessFor', () => {
  it('leser tilgangen for brukeren i tokenet', async () => {
    const answer = { role: { kind: 'organizer' }, participants: [] };
    access.loadCupLineupAccessForUser.mockResolvedValueOnce(answer);
    await expect(lineupAccessFor('meg')('cup')).resolves.toBe(answer);
    expect(access.loadCupLineupAccessForUser).toHaveBeenCalledWith('meg', 'cup');
  });

  it('en lesing som feilet, kaster, så ruta ikke svarer «ingen tilgang»', async () => {
    access.loadCupLineupAccessForUser.mockResolvedValueOnce({ role: { kind: 'none' }, participants: [], readFailed: true });
    await expect(lineupAccessFor('meg')('cup')).rejects.toThrow('lineup access read failed');
  });
});

describe('lineupAnswer', () => {
  it('ingen feil er 200', async () => {
    const res = lineupAnswer({ error: '' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it.each([
    ['not_allowed', 403],
    ['not_found', 404],
    ['lineup_revealed', 409],
    ['lineup_already_submitted', 409],
    ['lineup_squad_changed', 409],
    ['team_taken', 409],
    ['too_many_matches', 409],
    ['planned_saved_target_failed', 409],
    ['save_failed', 500],
    ['insert_failed', 500],
    ['profile_read_failed', 500],
    ['rollback_failed', 500],
    ['reveal_undo_failed', 500],
  ] as const)('%s blir %s, og koden reiser som den er', async (code, status) => {
    const res = lineupAnswer({ error: code });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: code });
  });
});
