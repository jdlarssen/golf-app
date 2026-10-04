import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { loadMessages, mergeMessages } from './messages';

describe('mergeMessages', () => {
  it('keeps a base key the overlay lacks', () => {
    expect(mergeMessages({ a: 'base', b: 'base' }, { a: 'over' })).toEqual({
      a: 'over',
      b: 'base',
    });
  });

  it('merges nested namespaces key by key', () => {
    expect(
      mergeMessages(
        { ns: { kept: 'base', replaced: 'base' } },
        { ns: { replaced: 'over' } },
      ),
    ).toEqual({ ns: { kept: 'base', replaced: 'over' } });
  });

  it('lets the overlay win, also when the shapes differ', () => {
    expect(mergeMessages({ a: { deep: 'base' } }, { a: 'flat' })).toEqual({
      a: 'flat',
    });
  });

  it('leaves the base object untouched', () => {
    const base = { ns: { kept: 'base' } };
    mergeMessages(base, { ns: { added: 'over' } });
    expect(base).toEqual({ ns: { kept: 'base' } });
  });
});

describe('loadMessages', () => {
  it('returns the default catalog as-is for the default locale', async () => {
    const defaultCatalog = (
      await import(`../../messages/${routing.defaultLocale}.json`)
    ).default;
    expect(await loadMessages(routing.defaultLocale)).toEqual(defaultCatalog);
  });

  it.each(routing.locales)(
    'gives %s every top-level namespace of the default catalog',
    async (locale) => {
      const defaultCatalog = await loadMessages(routing.defaultLocale);
      const catalog = await loadMessages(locale);
      for (const namespace of Object.keys(defaultCatalog)) {
        expect(catalog).toHaveProperty([namespace]);
      }
    },
  );
});
