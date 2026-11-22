// #2297 (Type A): ordene på handicapkortet og i arket. Kortet er webbens tekst
// (`messages/no.json → game.home.handicapCard`), tegn for tegn.
import source from '../../../../messages/no.json';
import { formatRelativeNb } from '../../../../lib/format/relativeTimeNb';
import {
  describeHandicapSaveFailure,
  formatRelativeAgoNb,
  fromLastLine,
  HANDICAP_TEXT,
  handicapCardBody,
  plusBeyondMinLine,
  rulerA11yValue,
  saveLabel,
  sheetSubtitle,
  spokenHcp,
} from './handicapCopy';
import { hcpChange } from './hcpRuler';
import { describeProfileSaveFailure } from './profileCopy';

const CARD = source.game.home.handicapCard;
const NOW = Date.parse('2026-11-14T12:00:00.000Z');

describe('kortet', () => {
  it('har webbens tittel og knapper', () => {
    expect(HANDICAP_TEXT.cardTitle).toBe(CARD.title);
    expect(HANDICAP_TEXT.confirm).toBe(CARD.confirm);
    expect(HANDICAP_TEXT.update).toBe(CARD.update);
  });

  it('har webbens brødtekst, med tallet for seg', () => {
    const updatedAt = new Date(NOW - 35 * 86_400_000 + 3_600_000).toISOString();
    const body = handicapCardBody(14.2, updatedAt, NOW);
    const relative = formatRelativeNb(updatedAt, NOW);
    expect(`${body.before}<num>${body.hcp}</num>${body.after}`).toBe(
      CARD.body.replace('{hcp}', '14,2').replace('{relative}', relative),
    );
    expect(body.hcp).toBe('14,2');
  });

  it('skriver plusshandicap med plusstegn', () => {
    expect(handicapCardBody(-0.6, new Date(NOW).toISOString(), NOW).hcp).toBe('+0,6');
  });
});

describe('formatRelativeAgoNb', () => {
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  it.each([
    0,
    1 * SECOND,
    5 * SECOND,
    1 * MINUTE,
    5 * MINUTE,
    1 * HOUR,
    3 * HOUR,
    1 * DAY,
    2 * DAY,
    3 * DAY,
    6 * DAY,
    7 * DAY,
    14 * DAY,
    28 * DAY,
    29 * DAY,
    30 * DAY,
    35 * DAY,
    45 * DAY,
    400 * DAY,
    // Et stempel i framtida (klokkeskjevhet) er «nå», som på nettet.
    -5 * MINUTE,
    // Siste halve enhet før hver grense avrundes opp til neste enhet.
    59.5 * SECOND,
    59.5 * MINUTE,
    23.5 * HOUR,
  ])('%s ms siden gir samme tekst som nettet', (ago) => {
    const iso = new Date(NOW - ago).toISOString();
    expect(formatRelativeAgoNb(iso, NOW)).toBe(formatRelativeNb(iso, NOW));
  });
});

describe('formatRelativeAgoNb, kantene', () => {
  const MIN = 60 * 1000;
  it('59,5 minutter er «for 1 time siden», ikke «60 minutter»', () => {
    expect(formatRelativeAgoNb(new Date(NOW - 59.5 * MIN).toISOString(), NOW)).toBe('for 1 time siden');
  });
  it('en uparsbar tid kaster ikke og gir tom tekst', () => {
    expect(formatRelativeAgoNb('not-a-date', NOW)).toBe('');
  });
});

describe('arket', () => {
  it('undertittelen har lang dato og tallet', () => {
    // Midt på dagen, så datoen er den samme i alle tidssoner testen kjører i.
    expect(sheetSubtitle('2026-08-22T12:00:00.000Z', 14.2)).toBe('Sist oppdatert 22. august · 14,2');
    expect(sheetSubtitle('2026-08-22T12:00:00.000Z', -0.4)).toBe('Sist oppdatert 22. august · +0,4');
  });

  it('«fra sist» for ned og opp, og ingenting uendret', () => {
    expect(fromLastLine(hcpChange(14.2, 13.8))).toBe('0,4 fra sist');
    expect(fromLastLine(hcpChange(0.4, -0.6))).toBe('1,0 fra sist');
    expect(fromLastLine(hcpChange(13.8, 14.2))).toBe('0,4 fra sist');
    expect(fromLastLine(hcpChange(14.2, 14.2))).toBeNull();
  });

  it('skjermleseren sier tallet og endringen, og «pluss» for plusshandicap', () => {
    expect(rulerA11yValue(13.8, hcpChange(14.2, 13.8))).toBe('13,8, 0,4 lavere enn sist');
    expect(rulerA11yValue(14.6, hcpChange(14.2, 14.6))).toBe('14,6, 0,4 høyere enn sist');
    expect(rulerA11yValue(14.2, hcpChange(14.2, 14.2))).toBe('14,2');
    expect(rulerA11yValue(-0.6, hcpChange(0.4, -0.6))).toBe('pluss 0,6, 1,0 lavere enn sist');
    expect(spokenHcp(0)).toBe('0,0');
  });

  it('lagreknappen bærer tallet, og står uten når feltet ikke kan leses', () => {
    expect(saveLabel(13.8)).toBe('Lagre 13,8');
    expect(saveLabel(-0.6)).toBe('Lagre +0,6');
    expect(saveLabel(null)).toBe('Lagre');
    expect(HANDICAP_TEXT.saving).toBe('Lagrer …');
  });

  it('har tegningenes linjer', () => {
    expect(HANDICAP_TEXT.invalidRange).toBe('Skriv et tall mellom 0 og 54.');
    expect(plusBeyondMinLine(-8)).toBe('Plusshandicap kan være opptil +8,0.');
    expect(HANDICAP_TEXT.needsNetwork).toBe('Du trenger nett for å lagre.');
    expect(HANDICAP_TEXT.receipt).toBe('Handicapet ditt er oppdatert.');
  });
});

describe('describeHandicapSaveFailure', () => {
  it.each(['offline', 'network'] as const)('%s ber om nett', (reason) => {
    expect(describeHandicapSaveFailure(reason)).toBe('Du trenger nett for å lagre.');
  });

  it('utlogget sier det samme som profilskjemaet', () => {
    expect(describeHandicapSaveFailure('unauthorized')).toBe(describeProfileSaveFailure('unauthorized'));
  });

  it.each(['update_failed', 'hcp_invalid', 'name_required', 'no-web-base-url'] as const)(
    '%s gir tegningens feillinje',
    (reason) => {
      expect(describeHandicapSaveFailure(reason)).toBe('Noe gikk galt. Prøv igjen.');
    },
  );
});
