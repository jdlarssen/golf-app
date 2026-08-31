// native/app/src/data/formatCatalog.test.ts
// Format-gaten: nøyaktig de åtte modiene når DB-lesingen lykkes, og en ÆRLIG
// feil når den ikke gjør det.
//
// Den siste raden er den viktige. En tom formatliste og en feilet henting ser
// like ut på skjermen hvis koden ikke skiller dem — og arrangøren ville trodd
// appen ikke kan opprette spill i det hele tatt (#1832-guardrailen).
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { APP_SUPPORTED_MODES } from '../lib/appFormats';
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

type Mocks = typeof import('../test/supabaseMock');
type Catalog = typeof import('./formatCatalog');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function catalog(): Catalog {
  return require('./formatCatalog') as Catalog;
}

/** Alle åtte som aktive `formats`-rader, i vilkårlig DB-rekkefølge. */
const FORMAT_ROWS = APP_SUPPORTED_MODES.map((slug, i) => ({
  slug,
  icon_key: `icon-${i}`,
}));

/** Alle åtte som synlige mappinger, med sort_order = omvendt av lista. */
const MAPPING_ROWS = APP_SUPPORTED_MODES.map((slug, i) => ({
  format_slug: slug,
  is_primary: i < 2,
  sort_order: APP_SUPPORTED_MODES.length - i,
}));

describe('fetchFormatCatalog', () => {
  useFreshModules();

  it('gir nøyaktig de åtte støttede modiene når lesingen lykkes', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      formats: [queryStub({ data: FORMAT_ROWS, error: null })],
      format_intent_mapping: [queryStub({ data: MAPPING_ROWS, error: null })],
    });

    const entries = await catalog().fetchFormatCatalog();
    expect(entries.map((e) => e.slug).sort()).toEqual([...APP_SUPPORTED_MODES].sort());
  });

  it('sorterer på sort_order og bærer etikett + ikon', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      formats: [
        queryStub({
          data: [
            { slug: 'wolf', icon_key: 'wolf-icon' },
            { slug: 'stableford', icon_key: 'stableford-icon' },
          ],
          error: null,
        }),
      ],
      format_intent_mapping: [
        queryStub({
          data: [
            { format_slug: 'wolf', is_primary: false, sort_order: 9 },
            { format_slug: 'stableford', is_primary: true, sort_order: 1 },
          ],
          error: null,
        }),
      ],
    });

    expect(await catalog().fetchFormatCatalog()).toEqual([
      {
        slug: 'stableford',
        label: 'Stableford',
        iconKey: 'stableford-icon',
        isPrimary: true,
        sortOrder: 1,
      },
      {
        slug: 'wolf',
        label: 'Wolf',
        iconKey: 'wolf-icon',
        isPrimary: false,
        sortOrder: 9,
      },
    ]);
  });

  it('slår sammen flere intent-mappinger til laveste sort_order', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      formats: [queryStub({ data: [{ slug: 'skins', icon_key: 'i' }], error: null })],
      format_intent_mapping: [
        queryStub({
          data: [
            { format_slug: 'skins', is_primary: false, sort_order: 7 },
            { format_slug: 'skins', is_primary: true, sort_order: 3 },
          ],
          error: null,
        }),
      ],
    });

    expect(await catalog().fetchFormatCatalog()).toEqual([
      { slug: 'skins', label: 'Skins', iconKey: 'i', isPrimary: true, sortOrder: 3 },
    ]);
  });

  it('dropper et aktivt format uten synlig mapping', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      formats: [queryStub({ data: FORMAT_ROWS, error: null })],
      format_intent_mapping: [
        queryStub({
          data: MAPPING_ROWS.filter((m) => m.format_slug !== 'wolf'),
          error: null,
        }),
      ],
    });

    const slugs = (await catalog().fetchFormatCatalog()).map((e) => e.slug);
    expect(slugs).not.toContain('wolf');
    expect(slugs).toHaveLength(APP_SUPPORTED_MODES.length - 1);
  });

  it('dropper et synlig format som ikke er aktivt', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      // `is_active`-filteret ligger i spørringen, så et deaktivert format
      // kommer rett og slett ikke tilbake.
      formats: [
        queryStub({ data: FORMAT_ROWS.filter((f) => f.slug !== 'skins'), error: null }),
      ],
      format_intent_mapping: [queryStub({ data: MAPPING_ROWS, error: null })],
    });

    const slugs = (await catalog().fetchFormatCatalog()).map((e) => e.slug);
    expect(slugs).not.toContain('skins');
  });

  it('gir tom liste når DB-en svarer at ingenting er synlig', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      formats: [queryStub({ data: [], error: null })],
      format_intent_mapping: [queryStub({ data: [], error: null })],
    });

    // Tom liste ER et svar: admin har slått av alt. Det skal IKKE kaste.
    await expect(catalog().fetchFormatCatalog()).resolves.toEqual([]);
  });

  // #1832-guardrailen: en feilet henting må kunne skilles fra en tom liste,
  // ellers ser «vi vet ikke» ut som «det finnes ingenting».
  it.each([
    ['formats', { formats: true }],
    ['format_intent_mapping', { formats: false }],
  ])('kaster når spørringen mot %s feiler', async (_name, { formats }) => {
    const { queryStub, routeFrom } = mocks();
    const boom = { data: null, error: { message: 'nettverket falt' } };
    const fine = { data: [], error: null };
    routeFrom({
      formats: [queryStub(formats ? boom : fine)],
      format_intent_mapping: [queryStub(formats ? fine : boom)],
    });

    await expect(catalog().fetchFormatCatalog()).rejects.toThrow('nettverket falt');
  });

  it('har en egen note for den feilede hentingen', () => {
    expect(catalog().FORMAT_CATALOG_FETCH_NOTE).toBe(
      'Fikk ikke hentet formatene. Sjekk nettet og prøv igjen.',
    );
  });
});
