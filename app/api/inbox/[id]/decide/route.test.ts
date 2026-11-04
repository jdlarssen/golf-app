// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2759, AK9 og AK10): fiendtlige kall mot «Godta» og «Avslå» gjør
 * ingenting. Kjernen er bevist i `app/[locale]/innboks/actions.test.ts`. Det som
 * må bevises her, er at `request_id` kommer fra kallerens eget varsel, aldri fra
 * kroppen.
 */

const authMock = vi.fn<() => Promise<string | null>>();
let caller: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/api/appAuth', () => ({
  authenticatedUserId: () => authMock(),
  callerScopedClient: () => caller,
}));
const decideMock = vi.fn();
vi.mock('@/lib/notifications/decideFromInbox', () => ({ decideFromInbox: (...args: unknown[]) => decideMock(...args) }));

import { POST } from './route';

const NOTE = '00000000-0000-4000-8000-000000000001';
const REQ = '00000000-0000-4000-8000-000000000002';
const SOMEONE_ELSES = '00000000-0000-4000-8000-000000000003';
const ROW = {
  kind: 'registration_request',
  payload: { game_id: 'g', game_name: 'Onsdagsgolfen', requester_name: 'Kristian Holm', request_id: REQ },
};

function post(body: unknown, id = NOTE) {
  return POST(
    new NextRequest(`http://local/api/inbox/${id}/decide`, {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue('user-1');
  caller = buildSupabaseMock([{ data: ROW, error: null }]);
  decideMock.mockResolvedValue({ ok: true, outcome: 'approved', gameName: 'Onsdagsgolfen', teamName: null });
});

describe('POST /api/inbox/[id]/decide', () => {
  it('without a token: 401, nothing is read or decided', async () => {
    authMock.mockResolvedValue(null);
    const res = await post({ decision: 'approve' });
    expect(res.status).toBe(401);
    expect(caller.__fromCalls).toEqual([]);
    expect(decideMock).not.toHaveBeenCalled();
  });

  it('someone else’s varsel: RLS gives no row, and the answer is 404', async () => {
    caller = buildSupabaseMock([{ data: null, error: null }]);
    const res = await post({ decision: 'approve' });
    expect(res.status).toBe(404);
    expect(decideMock).not.toHaveBeenCalled();
    expect(caller.__fromCalls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['user_id', 'user-1'] }));
  });

  it('request_id in the body is never read: the varsel’s own goes to the core', async () => {
    const res = await post({ decision: 'reject', request_id: SOMEONE_ELSES, requestId: SOMEONE_ELSES });
    expect(res.status).toBe(200);
    expect(decideMock).toHaveBeenCalledWith({
      client: caller,
      userId: 'user-1',
      notificationId: NOTE,
      requestId: REQ,
      decision: 'reject',
    });
  });

  it.each([
    ['another kind', { kind: 'invite', payload: { game_id: 'g', request_id: REQ } }],
    ['a heads-up without request_id', { kind: 'registration_request', payload: { game_id: 'g', game_name: 'X' } }],
  ])('%s cannot be decided: 400', async (_label, row) => {
    caller = buildSupabaseMock([{ data: row, error: null }]);
    const res = await post({ decision: 'approve' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'not_decidable' });
    expect(decideMock).not.toHaveBeenCalled();
  });

  it.each([{ decision: 'maybe' }, {}, 'ikke json'])('a body without a decision: 400 (%j)', async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(caller.__fromCalls).toEqual([]);
  });

  it('an id that is no uuid: 404 without a read', async () => {
    const res = await post({ decision: 'approve' }, 'nope');
    expect(res.status).toBe(404);
    expect(caller.__fromCalls).toEqual([]);
  });

  it('200 says how it went, with the first name for the status line', async () => {
    const res = await post({ decision: 'approve' });
    expect(await res.json()).toEqual({ outcome: 'approved', gameName: 'Onsdagsgolfen', teamName: null, name: 'Kristian' });
  });

  it.each([
    ['forbidden', 403],
    ['not_pending', 409],
    ['request_not_found', 409],
    ['game_not_found', 409],
    ['game_locked', 409],
    ['no_team_slot', 409],
    ['error', 500],
  ])('core says %s → %i', async (reason, status) => {
    decideMock.mockResolvedValue({ ok: false, reason });
    const res = await post({ decision: 'approve' });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: reason === 'error' ? 'failed' : reason });
  });

  it('a failed read of the varsel is 500, not «not found»', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    caller = buildSupabaseMock([{ data: null, error: { message: 'nede' } }]);
    const res = await post({ decision: 'approve' });
    expect(res.status).toBe(500);
    expect(decideMock).not.toHaveBeenCalled();
  });
});
