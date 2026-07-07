// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

// Route-nivå-kontrakt (#1124): PING→PONG, signaturport og eier-allowlist.
// Handlings-logikken er dekket i lib/loops/discordActions.test.ts (Type A);
// her testes kun HTTP-skallet — én integrasjonsflate, ingen tall-reassertering.

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const spki = publicKey.export({ format: 'der', type: 'spki' });
const PUBLIC_KEY_HEX = spki.subarray(spki.length - 32).toString('hex');
const OWNER = '111111111111111111';

function signedRequest(payload: unknown, opts: { tamper?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
  return new Request('https://tornygolf.no/api/discord/interactions', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
      'content-type': 'application/json',
    },
    body: opts.tamper ? body.replace('1', '2') : body,
  });
}

// next/server sin after() finnes ikke utenfor Next-runtime — samle callbackens
// promise så testen kan avvente hele follow-up-løpet før assertions.
const afterState = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (fn: () => unknown) => {
      afterState.pending.push(Promise.resolve(fn()));
    },
  };
});

import { POST } from './route';

beforeEach(() => {
  process.env.DISCORD_PUBLIC_KEY = PUBLIC_KEY_HEX;
  process.env.DISCORD_OWNER_ID = OWNER;
  process.env.GITHUB_LOOP_PAT = 'test-pat';
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DISCORD_PUBLIC_KEY;
  delete process.env.DISCORD_OWNER_ID;
  delete process.env.GITHUB_LOOP_PAT;
});

describe('POST /api/discord/interactions', () => {
  it('PING med gyldig signatur → PONG', async () => {
    const res = await POST(signedRequest({ type: 1 }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: 1 });
  });

  it('manipulert body → 401, ingen GitHub-trafikk', async () => {
    const res = await POST(signedRequest({ type: 1 }, { tamper: true }) as never);
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('manglende signatur-headere → 401', async () => {
    const res = await POST(
      new Request('https://tornygolf.no/api/discord/interactions', {
        method: 'POST',
        body: JSON.stringify({ type: 1 }),
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('knappetrykk fra ikke-eier → ephemeral avvisning, ingen GitHub-trafikk', async () => {
    const res = await POST(
      signedRequest({
        type: 3,
        application_id: 'app',
        token: 'tok',
        data: { custom_id: 'ready_issue:1122' },
        member: { user: { id: '999' } },
      }) as never,
    );
    const json = await res.json();
    expect(json.data.content).toContain('Kun eieren');
    expect(json.data.flags).toBe(64);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('eierens knappetrykk → deferred svar + handling + follow-up til Discord', async () => {
    const res = await POST(
      signedRequest({
        type: 3,
        application_id: 'app123',
        token: 'tok456',
        data: { custom_id: 'ready_issue:1122' },
        member: { user: { id: OWNER } },
      }) as never,
    );
    expect((await res.json()).type).toBe(5);
    await Promise.all(afterState.pending);
    const urls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/issues/1122/labels'))).toBe(true);
    expect(urls.some((u) => u.includes('webhooks/app123/tok456'))).toBe(true);
  });
});
