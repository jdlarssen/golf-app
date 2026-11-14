// native/app/src/lib/handicapCopy.test.ts
// #2297: tekstene i handicapkortet og arket. Type A, samme mønster som friendsCopy.test.
//
//  1. Kortets ord er `messages/no.json → game.home.handicapCard` tegn for tegn.
//  2. Den relative tiden er lik webbens `formatRelativeNb` på ti tidspunkter
//     (Hermes mangler ICU, så appen bygger den selv).
//  3. Arkets linjer: «fra sist», «Lagre X», skjermlesertekstene og feilene.
import source from '../../../../messages/no.json';
import { formatRelativeNb } from '../../../../lib/format/relativeTimeNb';
import { isFinishedSentence } from '../test/copy';
import {
  describeHandicapSaveFailure,
  formatRelativeAgoNb,
  HANDICAP_CARD_TEXT,
  HANDICAP_RECEIPT_TEXT,
  HANDICAP_SHEET_TEXT,
  handicapFieldError,
  handicapRulerValueText,
  handicapSaveLabel,
  handicapSheetSubline,
  handicapSinceLast,
  handicapSinceLastSpoken,
  handicapSpoken,
} from './handicapCopy';
import { hcpChange } from './hcpRuler';
import { describeProfileSaveFailure } from './profileCopy';

const web = source.game.home.handicapCard;

describe('kortet', () => {
  it('har webbens tittel og knapper', () => {
    expect(HANDICAP_CARD_TEXT.title).toBe(web.title);
    expect(HANDICAP_CARD_TEXT.confirm).toBe(web.confirm);
    expect(HANDICAP_CARD_TEXT.update).toBe(web.update);
  });

  it('har webbens brødtekst når tallet og tiden er satt inn', () => {
    const fromWeb = web.body
      .replace('<num>{hcp}</num>', '14,2')
      .replace('{relative}', 'for 5 uker siden');
    expect(HANDICAP_CARD_TEXT.bodySpoken('14,2', 'for 5 uker siden')).toBe(fromWeb);
    // Tallet står i halvfet mellom de to delene, og delene gir samme setning.
    expect(
      `${HANDICAP_CARD_TEXT.bodyBefore}14,2${HANDICAP_CARD_TEXT.bodyAfter('for 5 uker siden')}`,
    ).toBe(fromWeb);
  });
});

describe('formatRelativeAgoNb', () => {
  const NOW = Date.parse('2026-11-14T12:00:00.000Z');
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it.each([
    ['0 sekunder', 0],
    ['1 sekund', SECOND],
    ['40 sekunder', 40 * SECOND],
    ['1 minutt', MINUTE],
    ['5 timer', 5 * HOUR],
    ['1 døgn', DAY],
    ['2 døgn', 2 * DAY],
    ['3 døgn', 3 * DAY],
    ['10 dager', 10 * DAY],
    ['1 uke', 7 * DAY],
    ['4 uker', 28 * DAY],
    ['5 uker', 35 * DAY],
    ['1 måned', 30 * DAY],
    ['5 måneder', 150 * DAY],
    ['14 måneder', 430 * DAY],
  ])('er lik webbens tekst for %s', (_label, ageMs) => {
    const iso = new Date(NOW - ageMs).toISOString();
    expect(formatRelativeAgoNb(iso, NOW)).toBe(formatRelativeNb(iso, NOW));
  });

  // Webbens terskler: under 30 døgn teller uker, så «for 5 uker siden» finnes ikke.
  // Tegningens «5 uker» er et eksempel; kortet sier «for 4 uker siden», så «forrige måned».
  it('sier uker til 30 døgn, og så måneder', () => {
    expect(formatRelativeAgoNb(new Date(NOW - 29 * DAY).toISOString(), NOW)).toBe('for 4 uker siden');
    expect(formatRelativeAgoNb(new Date(NOW - 35 * DAY).toISOString(), NOW)).toBe('forrige måned');
  });

  it('floorer en tid i fremtiden (klokkeavvik) til nå', () => {
    expect(formatRelativeAgoNb(new Date(NOW + 5 * MINUTE).toISOString(), NOW)).toBe('nå');
  });
});

describe('arket', () => {
  it('har tegningens ord', () => {
    expect(HANDICAP_SHEET_TEXT.title).toBe('Oppdater handicap');
    expect(HANDICAP_SHEET_TEXT.close).toBe('Lukk');
    expect(HANDICAP_SHEET_TEXT.enter).toBe('Skriv inn tallet');
    expect(HANDICAP_SHEET_TEXT.offline).toBe('Du trenger nett for å lagre.');
    expect(HANDICAP_SHEET_TEXT.invalid).toBe('Skriv et tall mellom 0 og 54.');
    expect(HANDICAP_SHEET_TEXT.failed).toBe('Noe gikk galt. Prøv igjen.');
    expect(HANDICAP_RECEIPT_TEXT).toBe('Handicapet ditt er oppdatert.');
  });

  it('er ferdige setninger uten plassholdere', () => {
    for (const text of [...Object.values(HANDICAP_SHEET_TEXT), HANDICAP_RECEIPT_TEXT, HANDICAP_CARD_TEXT.title]) {
      expect(isFinishedSentence(text)).toBe(true);
    }
  });

  it('skriver «Sist oppdatert 22. august · 14,2», og bare tallet uten dato', () => {
    expect(handicapSheetSubline(new Date(2026, 7, 22).toISOString(), 14.2)).toBe(
      'Sist oppdatert 22. august · 14,2',
    );
    expect(handicapSheetSubline(new Date(2026, 7, 22).toISOString(), -0.4)).toBe(
      'Sist oppdatert 22. august · +0,4',
    );
    expect(handicapSheetSubline(null, 14.2)).toBe('Ikke oppdatert ennå · 14,2');
  });

  it.each([
    [13.8, false, 'Lagre 13,8'],
    [-0.6, false, 'Lagre +0,6'],
    [0, false, 'Lagre 0,0'],
    [null, false, 'Lagre'],
    [13.8, true, 'Lagrer …'],
  ])('knappen for %p (pågår: %p) heter «%s»', (value, pending, label) => {
    expect(handicapSaveLabel(value, pending)).toBe(label);
  });

  it('sier «fra sist» ned, opp og ingenting', () => {
    expect(handicapSinceLast(hcpChange(14.2, 13.8))).toBe('0,4 fra sist');
    expect(handicapSinceLast(hcpChange(13.8, 14.2))).toBe('0,4 fra sist');
    expect(handicapSinceLast(hcpChange(14.2, 14.2))).toBeNull();
    expect(handicapSinceLastSpoken(hcpChange(14.2, 13.8))).toBe('0,4 lavere enn sist');
    expect(handicapSinceLastSpoken(hcpChange(13.8, 14.2))).toBe('0,4 høyere enn sist');
    expect(handicapSinceLastSpoken(hcpChange(14.2, 14.2))).toBeNull();
  });

  it('leser plusshandicap som «pluss»', () => {
    expect(handicapSpoken(13.8)).toBe('13,8'.replace('.', ','));
    expect(handicapSpoken(-0.6)).toBe('pluss 0,6');
    expect(handicapRulerValueText(13.8, hcpChange(14.2, 13.8))).toBe('13,8, 0,4 lavere enn sist');
    expect(handicapRulerValueText(-0.6, hcpChange(0.4, -0.6))).toBe('pluss 0,6, 1,0 lavere enn sist');
    expect(handicapRulerValueText(14.2, hcpChange(14.2, 14.2))).toBe('14,2');
  });

  it('har en egen linje for plusshandicap over grensen', () => {
    expect(handicapFieldError(false, -8)).toBe('Skriv et tall mellom 0 og 54.');
    expect(handicapFieldError(true, -8)).toBe('Plusshandicap kan være opptil +8,0.');
    expect(handicapFieldError(true, -9.5)).toBe('Plusshandicap kan være opptil +9,5.');
  });
});

describe('describeHandicapSaveFailure', () => {
  it.each(['offline', 'network'] as const)('%s gir nett-setningen', (reason) => {
    expect(describeHandicapSaveFailure(reason)).toBe('Du trenger nett for å lagre.');
  });

  it('bruker profilens setning for «ikke logget inn»', () => {
    expect(describeHandicapSaveFailure('unauthorized')).toBe(describeProfileSaveFailure('unauthorized'));
  });

  it.each(['update_failed', 'hcp_invalid', 'name_required', 'no-web-base-url'] as const)(
    '%s gir «Noe gikk galt»',
    (reason) => {
      expect(describeHandicapSaveFailure(reason)).toBe('Noe gikk galt. Prøv igjen.');
    },
  );
});
