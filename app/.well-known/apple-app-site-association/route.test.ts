// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * Type A (#2627): AASA-fila lar BARE venne-lenka åpne appen.
 *
 * Butikkappen claimer `applinks:tornygolf.no`, og iOS åpner da appen for hver
 * sti denne fila slipper gjennom. Appen kan ikke bære en nett-sesjon fra en
 * lenke, så innlogging, invitasjoner, påmelding og alt annet skal fortsatt
 * åpnes i Safari. Testen leser fila slik Apple gjør, og matcher stier med
 * AASA-mønstrenes regler (`*` er hva som helst, `?` er ett tegn).
 */

type Component = { '/': string };

async function aasa() {
  const res = GET();
  return { res, body: await res.json() };
}

/** AASA-mønster → RegExp. `*` = null eller flere tegn, `?` = ett tegn. */
function matches(pattern: string, path: string): boolean {
  const re = pattern
    .split('')
    .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${re}$`).test(path);
}

async function components(): Promise<Component[]> {
  const { body } = await aasa();
  return body.applinks.details.flatMap((d: { components: Component[] }) => d.components);
}

describe('apple-app-site-association', () => {
  it('svarer 200 med JSON og butikkappens appID', async () => {
    const { res, body } = await aasa();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(body.applinks.details.map((d: { appIDs: string[] }) => d.appIDs)).toEqual([
      ['8C8WCW67J9.no.tornygolf.app'],
    ]);
  });

  it('har bare venne-lenka, på norsk og under /en', async () => {
    expect(await components()).toEqual([
      { '/': '/venner/legg-til/*' },
      { '/': '/en/venner/legg-til/*' },
    ]);
  });

  it.each(['/venner/legg-til/abcd1234', '/en/venner/legg-til/abcd1234'])(
    'slipper %s gjennom til appen',
    async (path) => {
      expect((await components()).some((c) => matches(c['/'], path))).toBe(true);
    },
  );

  it.each([
    '/',
    '/login',
    '/en/login',
    '/signup/abc123',
    '/games/1d2c',
    '/spectate/tok3n',
    '/profile/venner',
    '/venner',
    '/venner/legg-til',
    '/admin',
    '/invite/xyz',
    '/legal/privacy',
  ])('sender %s til Safari, ikke til appen', async (path) => {
    expect((await components()).some((c) => matches(c['/'], path))).toBe(false);
  });

  it('peker på en side som finnes: nettsidens «legg til meg»-rute', () => {
    const page = join(__dirname, '..', '..', '[locale]', 'venner', 'legg-til', '[code]', 'page.tsx');
    expect(existsSync(page)).toBe(true);
  });
});
