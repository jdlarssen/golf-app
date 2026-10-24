// native/app/src/lib/friendLinkUrl.test.ts
// #2627: venne-koden i lenka som åpnet appen. Type A.
//
// Lenka kommer fra kameraet (QR-koden på bag-taggen), fra «Del lenken din» i
// en melding, eller fra appens eget skjema i dev-bygget. Alt som ikke er en
// venne-lenke til vår web-adresse, skal gi `null`, så appen åpner som vanlig.
import { STORE_FRIEND_LINK_PATH_PREFIXES } from '../../app.config';
import { friendCodeFromUrl } from './friendLinkUrl';

const BASE = 'https://tornygolf.no';

describe('friendCodeFromUrl', () => {
  it.each([
    ['QR-koden', 'https://tornygolf.no/venner/legg-til/abcd1234', 'abcd1234'],
    ['den engelske siden', 'https://tornygolf.no/en/venner/legg-til/abcd1234', 'abcd1234'],
    ['skråstrek til slutt', 'https://tornygolf.no/venner/legg-til/abcd1234/', 'abcd1234'],
    ['spørring og anker', 'https://tornygolf.no/venner/legg-til/abcd1234?utm=x#top', 'abcd1234'],
    ['store bokstaver i koden', 'https://tornygolf.no/venner/legg-til/ABCD1234', 'abcd1234'],
    ['store bokstaver i verten', 'https://TornyGolf.no/venner/legg-til/abcd1234', 'abcd1234'],
    ['dev-byggets skjema', 'no.tornygolf.dev://venner/legg-til/abcd1234', 'abcd1234'],
    ['butikkbyggets skjema', 'no.tornygolf.app://venner/legg-til/abcd1234', 'abcd1234'],
    ['skjema med tom vert', 'no.tornygolf.dev:///venner/legg-til/abcd1234', 'abcd1234'],
    ['skjema, engelsk', 'no.tornygolf.dev://en/venner/legg-til/abcd1234', 'abcd1234'],
  ])('leser koden fra %s', (_label, url, code) => {
    expect(friendCodeFromUrl(url, BASE)).toBe(code);
  });

  it.each([
    ['ingenting', null],
    ['tom', ''],
    ['en annen vert', 'https://example.com/venner/legg-til/abcd1234'],
    ['en vert som bare ligner', 'https://tornygolf.no.example.com/venner/legg-til/abcd1234'],
    ['en annen side', 'https://tornygolf.no/login?next=/venner/legg-til/abcd1234'],
    ['vennesiden', 'https://tornygolf.no/profile/venner'],
    ['stien uten kode', 'https://tornygolf.no/venner/legg-til/'],
    ['en kode med tegn som ikke hører hjemme', 'https://tornygolf.no/venner/legg-til/abc%2F123'],
    ['en dypere sti', 'https://tornygolf.no/venner/legg-til/abcd1234/mer'],
    ['en annen locale enn en', 'https://tornygolf.no/de/venner/legg-til/abcd1234'],
    ['skjemaet til en annen side', 'no.tornygolf.dev://games/123'],
    ['ikke en adresse', 'venner/legg-til/abcd1234'],
  ])('gir null for %s', (_label, url) => {
    expect(friendCodeFromUrl(url, BASE)).toBeNull();
  });

  // Stiene butikkbygget claimer (app.config.ts, i takt med AASA-fila og
  // Android-beviset) må alle bli en kode her, ellers åpner lenka appen på Hjem.
  it.each(STORE_FRIEND_LINK_PATH_PREFIXES)('leser koden fra hver sti butikkbygget claimer: %s', (prefix) => {
    expect(friendCodeFromUrl(`https://tornygolf.no${prefix}abcd1234`, BASE)).toBe('abcd1234');
  });

  it('godtar web-adressen bygget peker på, også med port (dev mot staging)', () => {
    expect(friendCodeFromUrl('http://192.168.1.20:3111/venner/legg-til/abcd1234', 'http://192.168.1.20:3111')).toBe(
      'abcd1234',
    );
    expect(friendCodeFromUrl('http://192.168.1.20:4000/venner/legg-til/abcd1234', 'http://192.168.1.20:3111')).toBeNull();
  });

  it('godtar ingen https-lenke når bygget mangler web-adressen, men skjemaet virker', () => {
    expect(friendCodeFromUrl('https://tornygolf.no/venner/legg-til/abcd1234', null)).toBeNull();
    expect(friendCodeFromUrl('no.tornygolf.dev://venner/legg-til/abcd1234', null)).toBe('abcd1234');
  });
});
