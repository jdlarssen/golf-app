// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

/** Type A (#2748): a round link goes on to the page under `/games`, and nowhere else. */

const ID = '44444444-4444-4444-8444-444444444444';

async function open(locale: string, id: string, rest?: string[], query = '') {
  const prefix = locale === 'no' ? '' : `/${locale}`;
  const tail = rest ? `/${rest.join('/')}` : '';
  const res = await GET(new NextRequest(`https://tornygolf.no${prefix}/runde/${id}${tail}${query}`), {
    params: Promise.resolve({ locale, id, rest }),
  });
  return { status: res.status, location: res.headers.get('location') };
}

describe('GET /runde/[id]/[[...rest]]', () => {
  it.each<[string[] | undefined, string]>([
    [undefined, ''],
    [['holes', '7'], '/holes/7'],
    [['submit'], '/submit'],
    [['avslutt'], '/avslutt'],
    [['leaderboard'], '/leaderboard'],
  ])('%j goes on to the same page under /games', async (rest, tail) => {
    expect(await open('no', ID, rest)).toEqual({
      status: 307,
      location: `https://tornygolf.no/games/${ID}${tail}`,
    });
  });

  it('keeps the locale and the query', async () => {
    expect((await open('en', ID, ['leaderboard'], '?varsel=abc')).location).toBe(
      `https://tornygolf.no/en/games/${ID}/leaderboard?varsel=abc`,
    );
  });

  it.each<[string, string[] | undefined]>([
    ['an id of the wrong shape', undefined],
    [ID, ['slett']],
    [ID, ['holes', '19']],
    [ID, ['holes', '7', 'mer']],
    [ID, ['spillere']],
  ])('%s with %j is a 404, and goes nowhere', async (id, rest) => {
    expect(await open('no', id, rest)).toEqual({ status: 404, location: null });
  });
});
