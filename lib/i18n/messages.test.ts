import { afterEach, describe, expect, it, vi } from 'vitest';
import { routing, type AppLocale } from '@/i18n/routing';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the default catalog as-is for the default locale', async () => {
    const defaultCatalog = (
      await import(`../../messages/${routing.defaultLocale}.json`)
    ).default;
    expect(await loadMessages(routing.defaultLocale)).toEqual(defaultCatalog);
  });

  it('falls back to the default catalog, and says so, when a catalog file is missing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const defaultCatalog = await loadMessages(routing.defaultLocale);
    expect(await loadMessages('xx' as AppLocale)).toBe(defaultCatalog);
    expect(consoleError).toHaveBeenCalledWith(
      '[loadMessages]',
      'xx',
      expect.anything(),
    );
  });
});

describe('loadMessages with stand-in catalogs', () => {
  afterEach(() => {
    vi.doUnmock('../../messages/no.json');
    vi.doUnmock('../../messages/en.json');
    vi.resetModules();
  });

  it('lays the locale catalog over the default one, key by key', async () => {
    vi.resetModules();
    vi.doMock('../../messages/no.json', () => ({
      default: { ns: { shared: 'no', onlyDefault: 'no' } },
    }));
    vi.doMock('../../messages/en.json', () => ({
      default: { ns: { shared: 'en', onlyEn: 'en' } },
    }));
    const { loadMessages: load } = await import('./messages');
    expect(await load('en')).toEqual({
      ns: { shared: 'en', onlyDefault: 'no', onlyEn: 'en' },
    });
  });
});
