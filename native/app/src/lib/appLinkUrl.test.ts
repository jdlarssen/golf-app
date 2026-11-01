// native/app/src/lib/appLinkUrl.test.ts
// #2627, #2748: hva lenka som åpnet appen, peker på. Type A.
//
// Lenka kommer fra kameraet (QR-koden på bag-taggen), fra en melding, eller fra
// appens eget skjema i dev-bygget. Alt som ikke er en av våre lenker til vår
// web-adresse, skal gi `null`, så appen åpner som vanlig.
import { STORE_APP_LINK_PATH_PREFIXES, STORE_LINK_DOMAINS, STORE_WEB_BASE_URL } from '../../app.config';
import { appLinkFromUrl } from './appLinkUrl';

const BASE = 'https://tornygolf.no';
const FRIEND = { kind: 'friend', code: 'abcd1234' };
const LEAGUE = { kind: 'league', code: 'abcd2345' };

describe('appLinkFromUrl', () => {
  it.each([
    ['QR-koden', 'https://tornygolf.no/venner/legg-til/abcd1234', FRIEND],
    ['den engelske siden', 'https://tornygolf.no/en/venner/legg-til/abcd1234', FRIEND],
    ['skråstrek til slutt', 'https://tornygolf.no/venner/legg-til/abcd1234/', FRIEND],
    ['spørring og anker', 'https://tornygolf.no/venner/legg-til/abcd1234?utm=x#top', FRIEND],
    ['store bokstaver i koden', 'https://tornygolf.no/venner/legg-til/ABCD1234', FRIEND],
    ['store bokstaver i verten', 'https://TornyGolf.no/venner/legg-til/abcd1234', FRIEND],
    ['dev-byggets skjema', 'no.tornygolf.dev://venner/legg-til/abcd1234', FRIEND],
    ['butikkbyggets skjema', 'no.tornygolf.app://venner/legg-til/abcd1234', FRIEND],
    ['skjema med tom vert', 'no.tornygolf.dev:///venner/legg-til/abcd1234', FRIEND],
    ['skjema, engelsk', 'no.tornygolf.dev://en/venner/legg-til/abcd1234', FRIEND],
  ])('leser venne-lenka fra %s', (_label, url, link) => {
    expect(appLinkFromUrl(url, BASE)).toEqual(link);
  });

  it.each([
    ['delelenka', 'https://tornygolf.no/liga/bli-med/abcd2345', LEAGUE],
    ['den engelske siden', 'https://tornygolf.no/en/liga/bli-med/abcd2345', LEAGUE],
    ['skråstrek til slutt', 'https://tornygolf.no/liga/bli-med/abcd2345/', LEAGUE],
    ['spørring og anker', 'https://tornygolf.no/liga/bli-med/abcd2345?src=x#top', LEAGUE],
    ['store bokstaver i verten', 'https://TornyGolf.no/liga/bli-med/abcd2345', LEAGUE],
    ['dev-byggets skjema', 'no.tornygolf.dev://liga/bli-med/abcd2345', LEAGUE],
    ['butikkbyggets skjema', 'no.tornygolf.app://liga/bli-med/abcd2345', LEAGUE],
    ['skjema, engelsk', 'no.tornygolf.dev://en/liga/bli-med/abcd2345', LEAGUE],
  ])('leser ligalenka fra %s', (_label, url, link) => {
    expect(appLinkFromUrl(url, BASE)).toEqual(link);
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
    expect(appLinkFromUrl(url, BASE)).toBeNull();
  });

  // Ligakoden har én form (`isJoinCode`). Nettsiden svarer 404 på alt annet, så
  // appen skal ikke late som om det er en liga.
  it.each([
    ['en annen vert', 'https://example.com/liga/bli-med/abcd2345'],
    ['en vert som bare ligner', 'https://tornygolf.no.example.com/liga/bli-med/abcd2345'],
    ['stien uten kode', 'https://tornygolf.no/liga/bli-med/'],
    ['sju tegn', 'https://tornygolf.no/liga/bli-med/abcd234'],
    ['ni tegn', 'https://tornygolf.no/liga/bli-med/abcd23456'],
    ['store bokstaver i koden', 'https://tornygolf.no/liga/bli-med/ABCD2345'],
    ['en kode med tegn som ikke hører hjemme', 'https://tornygolf.no/liga/bli-med/abcd%2F34'],
    ['en dypere sti', 'https://tornygolf.no/liga/bli-med/abcd2345/mer'],
    ['en annen locale enn en', 'https://tornygolf.no/de/liga/bli-med/abcd2345'],
    ['ligasiden', 'https://tornygolf.no/liga/44444444-4444-4444-8444-444444444444'],
    ['skjemaet til ligasiden', 'no.tornygolf.dev://liga/44444444-4444-4444-8444-444444444444'],
    ['spillet', 'https://tornygolf.no/games/44444444-4444-4444-8444-444444444444'],
    ['påmeldingen', 'https://tornygolf.no/signup/abcd2345'],
    ['innloggingen', 'https://tornygolf.no/login'],
    ['innloggingen med en ligalenke i next', 'https://tornygolf.no/login?next=/liga/bli-med/abcd2345'],
  ])('gir null for ligalenka med %s', (_label, url) => {
    expect(appLinkFromUrl(url, BASE)).toBeNull();
  });

  // Stiene butikkbygget gjør krav på (app.config.ts, i takt med Android-beviset)
  // må alle bli en lenke her, ellers åpner lenka appen på Hjem og ingenting mer.
  it.each(STORE_APP_LINK_PATH_PREFIXES)('forstår hver sti butikkbygget gjør krav på: %s', (prefix) => {
    const code = prefix.includes('liga') ? 'abcd2345' : 'abcd1234';
    expect(appLinkFromUrl(`${STORE_WEB_BASE_URL}${prefix}${code}`, STORE_WEB_BASE_URL)).not.toBeNull();
  });

  it.each(STORE_LINK_DOMAINS)('forstår hver vert butikkbygget gjør krav på: %s', (domain) => {
    expect(appLinkFromUrl(`https://${domain}/liga/bli-med/abcd2345`, STORE_WEB_BASE_URL)).toEqual(LEAGUE);
  });

  // #2748: «Åpne i appen» på nettsiden peker på www, fordi Safari holder lenker
  // til samme domene inne. Bare i bygget som peker på prod.
  it('godtar www bare i bygget der web-adressen er prod', () => {
    const www = 'https://www.tornygolf.no/liga/bli-med/abcd2345';
    expect(appLinkFromUrl(www, BASE)).toEqual(LEAGUE);
    expect(appLinkFromUrl('https://WWW.tornygolf.no/venner/legg-til/abcd1234', BASE)).toEqual(FRIEND);
    expect(appLinkFromUrl(www, 'https://staging.example')).toBeNull();
    expect(appLinkFromUrl(www, 'http://192.168.1.20:3111')).toBeNull();
    expect(appLinkFromUrl(www, null)).toBeNull();
  });

  it('godtar ingen andre underdomener', () => {
    expect(appLinkFromUrl('https://app.tornygolf.no/liga/bli-med/abcd2345', BASE)).toBeNull();
    expect(appLinkFromUrl('https://www.www.tornygolf.no/liga/bli-med/abcd2345', BASE)).toBeNull();
  });

  it('godtar web-adressen bygget peker på, også med port (dev mot staging)', () => {
    expect(appLinkFromUrl('http://192.168.1.20:3111/venner/legg-til/abcd1234', 'http://192.168.1.20:3111')).toEqual(
      FRIEND,
    );
    expect(appLinkFromUrl('http://192.168.1.20:3111/liga/bli-med/abcd2345', 'http://192.168.1.20:3111')).toEqual(LEAGUE);
    expect(appLinkFromUrl('http://192.168.1.20:4000/venner/legg-til/abcd1234', 'http://192.168.1.20:3111')).toBeNull();
  });

  it('godtar ingen https-lenke når bygget mangler web-adressen, men skjemaet virker', () => {
    expect(appLinkFromUrl('https://tornygolf.no/venner/legg-til/abcd1234', null)).toBeNull();
    expect(appLinkFromUrl('no.tornygolf.dev://venner/legg-til/abcd1234', null)).toEqual(FRIEND);
    expect(appLinkFromUrl('no.tornygolf.dev://liga/bli-med/abcd2345', null)).toEqual(LEAGUE);
  });
});
