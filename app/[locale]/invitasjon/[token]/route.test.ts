// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

/** Type A (#2748): the invitation link goes on to the login, in the link's locale. */

const TOKEN = '44444444-4444-4444-8444-444444444444';

async function open(locale: string, token: string, query = '') {
  const prefix = locale === 'no' ? '' : `/${locale}`;
  const res = await GET(new NextRequest(`https://tornygolf.no${prefix}/invitasjon/${token}${query}`), {
    params: Promise.resolve({ locale, token }),
  });
  return { status: res.status, location: res.headers.get('location') };
}

describe('GET /invitasjon/[token]', () => {
  it('goes on to the login with the address and the invitation', async () => {
    expect(await open('no', TOKEN, '?email=kari%2Bx%40example.test')).toEqual({
      status: 307,
      location: `https://tornygolf.no/login?email=kari%2Bx%40example.test&invite=${TOKEN}`,
    });
  });

  it('keeps the locale', async () => {
    expect(await open('en', TOKEN, '?email=a%40b.no')).toEqual({
      status: 307,
      location: `https://tornygolf.no/en/login?email=a%40b.no&invite=${TOKEN}`,
    });
  });

  it('needs no address', async () => {
    expect((await open('no', TOKEN)).location).toBe(`https://tornygolf.no/login?invite=${TOKEN}`);
  });

  it('a token of the wrong shape is just the login, and drops the rest', async () => {
    expect(await open('no', 'not-a-token', '?email=a%40b.no')).toEqual({
      status: 307,
      location: 'https://tornygolf.no/login',
    });
  });
});
