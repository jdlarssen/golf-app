// #3019: blokkere og oppheve er appens egne skrivinger i `user_blocks`; lista
// med navn kommer fra `GET /api/blocks`.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { getNetworkStateAsync } from 'expo-network';
import { blockUser, listBlocks, unblockUser } from './blocks';
import { callWebRoute } from './webApi';
import { currentDeviceUserId, queryStub, routeFrom, stepArgs } from '../test/supabaseMock';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock('./webApi', () => ({ callWebRoute: jest.fn() }));

const networkMock = getNetworkStateAsync as jest.Mock;
const webMock = callWebRoute as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  networkMock.mockResolvedValue({ isConnected: true });
  currentDeviceUserId.mockResolvedValue('me');
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('blockUser', () => {
  it('skriver raden som meg og leser den tilbake', async () => {
    const insert = queryStub({ data: [{ blocked_id: 'kari' }], error: null });
    routeFrom({ user_blocks: [insert] });
    expect(await blockUser('kari')).toEqual({ ok: true });
    expect(stepArgs(insert, 'insert')).toEqual([[{ blocker_id: 'me', blocked_id: 'kari' }]]);
  });

  it('en blokkering som alt står (23505), er en blokkering', async () => {
    routeFrom({ user_blocks: [queryStub({ data: null, error: { message: 'dup', code: '23505' } })] });
    expect(await blockUser('kari')).toEqual({ ok: true });
  });

  it('0 rader tilbake er en feil, ikke en blokkering (felle 2)', async () => {
    routeFrom({ user_blocks: [queryStub({ data: [], error: null })] });
    expect(await blockUser('kari')).toEqual({ ok: false, reason: 'failed' });
  });

  it('uten nett skriver den ingenting', async () => {
    networkMock.mockResolvedValue({ isConnected: false });
    routeFrom({});
    expect(await blockUser('kari')).toEqual({ ok: false, reason: 'offline' });
  });
});

describe('unblockUser', () => {
  it('sletter bare min egen rad for den personen', async () => {
    const del = queryStub({ data: [{ blocked_id: 'kari' }], error: null });
    routeFrom({ user_blocks: [del] });
    expect(await unblockUser('kari')).toEqual({ ok: true });
    expect(stepArgs(del, 'eq')).toEqual([
      ['blocker_id', 'me'],
      ['blocked_id', 'kari'],
    ]);
  });

  it('0 rader slettet er en feil, ikke en oppheving (felle 2)', async () => {
    routeFrom({ user_blocks: [queryStub({ data: [], error: null })] });
    expect(await unblockUser('kari')).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('listBlocks', () => {
  it('leser lista fra ruta og hopper over rader uten id', async () => {
    webMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        blocks: [
          { userId: 'kari', name: 'Kari Nordmann', blockedAt: '2026-11-28T10:00:00Z' },
          { name: 'uten id' },
        ],
      },
    });
    expect(await listBlocks()).toEqual({
      ok: true,
      blocks: [{ userId: 'kari', name: 'Kari Nordmann', blockedAt: '2026-11-28T10:00:00Z' }],
    });
  });

  it('en feil er en feil, ikke en tom liste', async () => {
    webMock.mockResolvedValue({ ok: true, status: 500, body: { error: 'load_failed' } });
    expect(await listBlocks()).toEqual({ ok: false, reason: 'failed' });
  });
});
