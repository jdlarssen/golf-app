// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * Type A (#2627, #2748): AASA-fila lar BARE lenkene appen har en skjerm for
 * åpne appen.
 *
 * Butikkappen claimer `applinks:tornygolf.no` og `www`, og iOS åpner da appen
 * for hver sti denne fila slipper gjennom. Appen kan ikke bære en nett-sesjon
 * fra en lenke, så innlogging, påmeldingssidene og alt annet skal fortsatt
 * åpnes i Safari. Testen leser fila slik Apple gjør: bare stien matches, og
 * mønstrene følger AASA-reglene (`*` er hva som helst, `?` er ett tegn).
 */

type Component = { '/': string };

const UUID = '44444444-4444-4444-8444-444444444444';

const APP_LINKS = [
  '/venner/legg-til/abcd1234',
  '/liga/bli-med/abcd2345',
  `/invitasjon/${UUID}`,
  `/runde/${UUID}`,
  `/runde/${UUID}/holes/5`,
  '/pamelding/abcd2345',
  '/cup/bli-med/abcd2345',
];

async function aasa() {
  const res = GET();
  return { res, body: await res.json() };
}

/** AASA-mønster mot stien i en adresse. `*` = null eller flere tegn, `?` = ett tegn. */
function matches(pattern: string, url: string): boolean {
  const re = pattern
    .split('')
    .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${re}$`).test(url.split('?')[0]);
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

  it('har nøyaktig lenkene appen har en skjerm for, på norsk og under /en', async () => {
    expect(await components()).toEqual(
      ['', '/en'].flatMap((locale) => [
        { '/': `${locale}/venner/legg-til/*` },
        { '/': `${locale}/liga/bli-med/*` },
        { '/': `${locale}/invitasjon/*` },
        { '/': `${locale}/runde/*` },
        { '/': `${locale}/pamelding/*` },
        { '/': `${locale}/cup/bli-med/*` },
      ]),
    );
  });

  it.each([...APP_LINKS, ...APP_LINKS.map((path) => `/en${path}`), `/invitasjon/${UUID}?email=a%40b.no`])(
    'slipper %s gjennom til appen',
    async (path) => {
      expect((await components()).some((c) => matches(c['/'], path))).toBe(true);
    },
  );

  it.each([
    '/',
    '/login',
    '/en/login',
    '/login?invite=x',
    '/signup/abc123',
    '/signup/abc123/plakat',
    '/games/x',
    '/games/1d2c',
    '/games/x/submit',
    '/spectate/x',
    '/profile/venner',
    '/venner',
    '/venner/legg-til',
    `/liga/${UUID}`,
    '/klubber/bli-med/x',
    '/cup/x',
    '/admin',
    '/invite/xyz',
    '/legal/privacy',
  ])('sender %s til Safari, ikke til appen', async (path) => {
    expect((await components()).some((c) => matches(c['/'], path))).toBe(false);
  });

  // Uten appen lander lenka på nettsiden, så hver sti må ha noe å lande på.
  it.each([
    'venner/legg-til/[code]/page.tsx',
    'liga/bli-med/[code]/page.tsx',
    'invitasjon/[token]/route.ts',
    'runde/[id]/[[...rest]]/route.ts',
    'pamelding/[shortId]/route.ts',
    'cup/bli-med/[shortId]/page.tsx',
  ])('peker på en side som finnes: %s', (route) => {
    expect(existsSync(join(__dirname, '..', '..', '[locale]', route))).toBe(true);
  });
});
