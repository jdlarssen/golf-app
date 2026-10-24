import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import {
  FRIEND_LINK_LOCALE_PREFIXES,
  FRIEND_LINK_PATH_PREFIXES,
  FRIEND_LINK_PREFIX,
  friendLinkPath,
} from './friendLinkPath';

/**
 * Type A (#2627): venne-lenkas sti har ett hjem. Lista over locale-prefikser
 * står i fila (den er uten importer, så appen kan lese den), og må dekke hver
 * locale nettsiden har. Kommer det en ny locale, blir denne testen rød, og
 * AASA-fila, appens parser og butikkbyggets intent-filter (testet mot lista)
 * følger etter.
 */
describe('friendLinkPath', () => {
  it('bygger stien til «legg til meg»-siden', () => {
    expect(friendLinkPath('abcd1234')).toBe('/venner/legg-til/abcd1234');
    expect(friendLinkPath('abcd1234').startsWith(FRIEND_LINK_PREFIX)).toBe(true);
  });

  it('har ett prefiks per locale i routingen, uten prefiks for standardspråket', () => {
    expect([...FRIEND_LINK_LOCALE_PREFIXES]).toEqual(
      routing.locales.map((locale) => (locale === routing.defaultLocale ? '' : `/${locale}`)),
    );
  });

  it('gir én sti per locale', () => {
    expect(FRIEND_LINK_PATH_PREFIXES).toEqual(['/venner/legg-til/', '/en/venner/legg-til/']);
  });
});
