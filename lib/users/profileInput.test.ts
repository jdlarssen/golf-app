import { describe, it, expect } from 'vitest';
import {
  parseProfileInput,
  HCP_MIN,
  HCP_MAX,
  type ProfileInputError,
} from './profileInput';

/**
 * Type A (ren logikk): den delte profil-valideringen.
 *
 * Denne regelen har to inngangsdører — skjemaet i `app/[locale]/profile` og
 * ruta native-appen kaller (#1906) — så den er testet ÉN gang her, ikke én
 * gang per dør. Det som låses: grenseverdiene, plusshandicap-fortegnet,
 * #1064-oppførselen for tomt kjønn, og rekkefølgen på feilene.
 */

/** Et gyldig grunnlag testene varierer ett felt av gangen fra. */
const base = {
  name: 'Ola Nordmann',
  nickname: '',
  hcpIndex: '12.4',
  gender: 'mens',
  level: 'normal',
} as const;

function parse(overrides: Parameters<typeof parseProfileInput>[0] = {}) {
  return parseProfileInput({ ...base, ...overrides });
}

describe('parseProfileInput — navn', () => {
  it.each([
    ['tom streng', ''],
    ['bare mellomrom', '   '],
    ['bare linjeskift/tab', '\t\n '],
    ['utelatt', undefined],
    ['null', null],
  ])('%s → name_required', (_label, name) => {
    expect(parse({ name })).toEqual({ ok: false, error: 'name_required' });
  });

  it('trimmer navnet som lagres', () => {
    const res = parse({ name: '  Ola Nordmann  ' });
    expect(res).toMatchObject({ ok: true, value: { name: 'Ola Nordmann' } });
  });
});

describe('parseProfileInput — kallenavn', () => {
  it.each([
    ['tom streng', '', null],
    ['bare mellomrom', '   ', null],
    ['utelatt', undefined, null],
    ['satt verdi trimmes', '  Nordy  ', 'Nordy'],
  ])('%s → %s', (_label, nickname, expected) => {
    const res = parse({ nickname });
    expect(res).toMatchObject({ ok: true, value: { nickname: expected } });
  });
});

describe('parseProfileInput — handicap', () => {
  it('leser komma og punktum som samme tall', () => {
    const komma = parse({ hcpIndex: '12,5' });
    const punktum = parse({ hcpIndex: '12.5' });
    expect(komma).toMatchObject({ ok: true, value: { hcpIndex: 12.5 } });
    expect(komma).toEqual(punktum);
  });

  it('tar imot et tall like godt som en streng', () => {
    expect(parse({ hcpIndex: 12.5 })).toMatchObject({
      ok: true,
      value: { hcpIndex: 12.5 },
    });
  });

  it.each([
    ['54 er på taket', '54', HCP_MAX],
    ['0 er scratch', '0', 0],
    ['desimal', '8,3', 8.3],
  ])('%s → %s', (_label, hcpIndex, expected) => {
    expect(parse({ hcpIndex })).toMatchObject({
      ok: true,
      value: { hcpIndex: expected },
    });
  });

  it.each([
    ['over taket', '54,1'],
    ['negativ magnitude', '-1'],
    ['tom', ''],
    ['ikke et tall', 'tolv'],
    ['utelatt', undefined],
  ])('%s → hcp_invalid', (_label, hcpIndex) => {
    expect(parse({ hcpIndex })).toEqual({ ok: false, error: 'hcp_invalid' });
  });

  it('lagrer plusshandicap NEGATIVT', () => {
    expect(parse({ hcpIndex: '2,2', hcpPlus: true })).toMatchObject({
      ok: true,
      value: { hcpIndex: -2.2 },
    });
  });

  it.each([
    ['plusshandicap på nedre grense', '10', HCP_MIN],
    ['plusshandicap innenfor', '4,5', -4.5],
  ])('%s → %s', (_label, hcpIndex, expected) => {
    expect(parse({ hcpIndex, hcpPlus: true })).toMatchObject({
      ok: true,
      value: { hcpIndex: expected },
    });
  });

  it('avviser plusshandicap under nedre grense', () => {
    // Magnituden 10,1 er innenfor [0, 54] — det er den SIGNERTE verdien
    // (−10,1) som bryter grensen. Fanges bare av sjekk nummer to.
    expect(parse({ hcpIndex: '10,1', hcpPlus: true })).toEqual({
      ok: false,
      error: 'hcp_invalid',
    });
  });

  it('gir 0 og ikke −0 for «pluss 0»', () => {
    const res = parse({ hcpIndex: '0', hcpPlus: true });
    expect(res).toMatchObject({ ok: true });
    const value = res.ok ? res.value.hcpIndex : NaN;
    expect(value).toBe(0);
    // Object.is skiller 0 fra −0 der === ikke gjør det. Et lagret −0 ville
    // vist seg som «+0,0» i handicap-visningen.
    expect(Object.is(value, -0)).toBe(false);
  });
});

describe('parseProfileInput — kjønn (#1064)', () => {
  it.each([
    ['tom streng', ''],
    ['bare mellomrom', '  '],
    ['utelatt', undefined],
    ['null', null],
  ])('%s utelater feltet helt («la stå»)', (_label, gender) => {
    const res = parse({ gender });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).not.toHaveProperty('gender');
  });

  it.each([['mens'], ['ladies']])('%s er gyldig', (gender) => {
    expect(parse({ gender })).toMatchObject({ ok: true, value: { gender } });
  });

  it('satt men ugyldig → gender_required', () => {
    expect(parse({ gender: 'bogus' })).toEqual({
      ok: false,
      error: 'gender_required',
    });
  });
});

describe('parseProfileInput — spillerklasse', () => {
  it.each([['junior'], ['normal'], ['senior']])('%s er gyldig', (level) => {
    expect(parse({ level })).toMatchObject({ ok: true, value: { level } });
  });

  it.each([
    ['utelatt', undefined],
    ['null', null],
  ])('%s defaulter til normal', (_label, level) => {
    expect(parse({ level })).toMatchObject({
      ok: true,
      value: { level: 'normal' },
    });
  });

  it.each([
    ['tom streng', ''],
    ['ukjent verdi', 'proff'],
  ])('%s → level_invalid', (_label, level) => {
    expect(parse({ level })).toEqual({ ok: false, error: 'level_invalid' });
  });
});

describe('parseProfileInput — rekkefølgen på sjekkene er kontrakten', () => {
  // Samme input skal gi samme FØRSTE feil som skjemaet ga før regelen flyttet
  // ut, ellers hopper feilbanneret til et annet felt for brukeren.
  it.each<[string, Parameters<typeof parseProfileInput>[0], ProfileInputError]>([
    [
      'alt er feil → navnet klages på først',
      { name: '', hcpIndex: '99', gender: 'bogus', level: 'proff' },
      'name_required',
    ],
    [
      'navnet er greit → handicapet er nest på tur',
      { name: 'Ola', hcpIndex: '99', gender: 'bogus', level: 'proff' },
      'hcp_invalid',
    ],
    [
      'navn og handicap greit → kjønnet før spillerklassen',
      { name: 'Ola', hcpIndex: '12', gender: 'bogus', level: 'proff' },
      'gender_required',
    ],
    [
      'bare spillerklassen igjen',
      { name: 'Ola', hcpIndex: '12', gender: 'mens', level: 'proff' },
      'level_invalid',
    ],
  ])('%s', (_label, input, expected) => {
    expect(parseProfileInput(input)).toEqual({ ok: false, error: expected });
  });
});
