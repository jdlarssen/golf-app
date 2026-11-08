// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

/** Type A (#2748): the shared signup link goes on to the signup page, in the link's locale. */

const SHORT_ID = 'abcd2345';

async function open(locale: string, shortId: string, query = '') {
  const prefix = locale === 'no' ? '' : `/${locale}`;
  const res = await GET(new NextRequest(`https://tornygolf.no${prefix}/pamelding/${shortId}${query}`), {
    params: Promise.resolve({ locale, shortId }),
  });
  return { status: res.status, location: res.headers.get('location') };
}

describe('GET /pamelding/[shortId]', () => {
  it('goes on to the signup page with a real redirect', async () => {
    expect(await open('no', SHORT_ID)).toEqual({
      status: 307,
      location: `https://tornygolf.no/signup/${SHORT_ID}?fra=lenke`,
    });
  });

  it('keeps the locale', async () => {
    expect((await open('en', SHORT_ID)).location).toBe(`https://tornygolf.no/en/signup/${SHORT_ID}?fra=lenke`);
  });

  it('keeps the source, so the poster is still counted', async () => {
    expect((await open('no', SHORT_ID, '?src=plakat')).location).toBe(
      `https://tornygolf.no/signup/${SHORT_ID}?src=plakat&fra=lenke`,
    );
  });

  it('says so when the button came back without the app', async () => {
    expect((await open('no', SHORT_ID, '?src=plakat&uten-app=1')).location).toBe(
      `https://tornygolf.no/signup/${SHORT_ID}?src=plakat&uten-app=1&fra=lenke`,
    );
  });

  it('drops anything else in the query', async () => {
    expect((await open('no', SHORT_ID, '?next=/admin&x=1')).location).toBe(
      `https://tornygolf.no/signup/${SHORT_ID}?fra=lenke`,
    );
  });

  it.each(['abcd234', 'abcd23456', 'ABCD2345', 'abcd-345'])('%s answers 404', async (shortId) => {
    expect(await open('no', shortId)).toEqual({ status: 404, location: null });
  });
});
