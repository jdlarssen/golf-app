// #3019: «Send rapport» går til `POST /api/reports`. Kroppen bærer målet, aldri
// spillerens egen id, og svaret blir én av fire grunner.
import { submitReport } from './reports';
import { callWebRoute } from './webApi';

jest.mock('./webApi', () => ({ callWebRoute: jest.fn() }));
const webMock = callWebRoute as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('submitReport', () => {
  it.each([
    [{ kind: 'user', userId: 'kari' }, { targetUserId: 'kari' }],
    [{ kind: 'game', gameId: 'g1' }, { targetGameId: 'g1' }],
    [{ kind: 'gameShortId', shortId: 'k7m3p9qx' }, { targetGameShortId: 'k7m3p9qx' }],
  ] as const)('sender målet %j', async (target, field) => {
    webMock.mockResolvedValue({ ok: true, status: 200, body: { ok: true } });
    expect(await submitReport(target, 'other', '  stygt  ')).toEqual({ ok: true });
    expect(webMock).toHaveBeenCalledWith('/api/reports', 'POST', { reason: 'other', note: 'stygt', ...field });
  });

  it('tom tekst sendes ikke', async () => {
    webMock.mockResolvedValue({ ok: true, status: 200, body: { ok: true } });
    await submitReport({ kind: 'user', userId: 'kari' }, 'harassment', '   ');
    expect(webMock.mock.calls[0][2]).toEqual({ reason: 'harassment', targetUserId: 'kari' });
  });

  it.each([
    [{ ok: true, status: 400, body: { error: 'invalid' } }, 'invalid'],
    [{ ok: true, status: 429, body: { error: 'rate_limited' } }, 'rate_limited'],
    [{ ok: true, status: 500, body: { error: 'db_error' } }, 'failed'],
    [{ ok: false, reason: 'offline' }, 'offline'],
    [{ ok: false, reason: 'network' }, 'failed'],
  ])('%j → %s', async (call, reason) => {
    webMock.mockResolvedValue(call);
    expect(await submitReport({ kind: 'user', userId: 'kari' }, 'other', '')).toEqual({ ok: false, reason });
  });
});
