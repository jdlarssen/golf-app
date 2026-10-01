// native/app/src/lib/loginCopy.test.ts
// Native #1977: feilene på innloggingsskjermen, på norsk.
//
// Testen har tre jobber.
//
//  1. **Klassifisereren treffer de EKTE strengene.** Radene under er ordrett
//     det GoTrue svarer på kode-steget. Siden #2216 ber appen om koden gjennom
//     nettsidens rute, som svarer med en kode og ikke en GoTrue-tekst
//     (`data/loginCode.ts`), så bare verify-steget klassifiseres her.
//  2. **Paritetsport mot webben.** Hver kode som også finnes på nettsidens
//     `/login` hentes fra `messages/no.json` og sammenlignes tegn for tegn.
//     Rettes en setning på web uten at appen følger etter, blir denne rød.
//     `no.json` leses fra node-siden; testen bundles aldri. Hver nøkkel under
//     `auth.errors` er enten delt med appen, har en app-egen ordlyd i
//     `APP_WORDING`, eller står på `WEB_ONLY` med en begrunnelse (#1904) —
//     får webben en ny feilkode, blir testen rød til noen har tatt stilling
//     til om appen skal vise den.
//  3. **Ingen kode uten setning.** `tsc` sikrer at switch-en er uttømmende;
//     denne sikrer at det som kommer ut faktisk er lesbar tekst.
import source from '../../../../messages/no.json';
import { isFinishedSentence } from '../test/copy';
import { OFFLINE_NOTE } from './rosterCopy';
import {
  LOGIN_TEXT,
  OTP_LENGTH,
  RESEND_SECONDS,
  classifyVerifyError,
  describeLoginError,
  formatCountdown,
  maskSentToEmail,
  resendWaitSeconds,
  type LoginErrorCode,
} from './loginCopy';

const webErrors: Record<string, string> = source.auth.errors;

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
const CODE_MAP = {
  rate_limited: true,
  rate_limited_minute: true,
  rate_limited_quota: true,
  user_not_found: true,
  invite_expired: true,
  disposable_email: true,
  code_invalid: true,
  code_expired: true,
  network: true,
  unknown: true,
} as const satisfies Record<LoginErrorCode, true>;

const CODES = Object.keys(CODE_MAP) as readonly LoginErrorCode[];

/**
 * Koder der appen med vilje sier noe annet enn webben, med begrunnelsen.
 * Ordlyden selv låses ikke her — bare at den finnes og ikke er webbens.
 */
const APP_WORDING: Partial<Record<LoginErrorCode, string>> = {
  user_not_found:
    'appen sier ærlig at nye kontoer er skrudd av; webbens tekst ber om admin',
};

/** Kodene appen deler med webben. `network` er app-egen (offline-først). */
const SHARED_WITH_WEB = CODES.filter((code) => code !== 'network' && !(code in APP_WORDING));

/**
 * Webbens feilkoder appen med vilje IKKE har (se `LoginErrorCode` i
 * `loginCopy.ts`).
 */
const WEB_ONLY: Partial<Record<keyof typeof source.auth.errors, string>> = {
  link_expired: 'fra magic-link-tiden; appen har ingen lenke',
};

describe('classifyVerifyError', () => {
  it.each<[string, string, LoginErrorCode]>([
    // GoTrue svarer likt på feiltastet og utløpt kode. Webben lander på «gått
    // ut» for begge; appen speiler det med vilje.
    ['Token has expired or is invalid', 'otp_expired', 'code_expired'],
    ['Token has expired', '', 'code_expired'],
    ['Invalid token', 'validation_failed', 'code_invalid'],
    ['Noe helt annet fra serveren', '', 'code_invalid'],
    // Nett-sjekken går FØRST: en forespørsel som aldri kom fram har ingen kode.
    ['Network request failed', '', 'network'],
    ['Failed to fetch', '', 'network'],
    ['Load failed', '', 'network'],
  ])('«%s» (%s) → %s', (message, code, expected) => {
    expect(classifyVerifyError({ message, code })).toBe(expected);
  });

  it('tåler en feil uten tekst og uten kode', () => {
    expect(classifyVerifyError({})).toBe('code_invalid');
    expect(classifyVerifyError({ message: null, code: null })).toBe('code_invalid');
  });
});

describe('describeLoginError', () => {
  it.each(CODES)('gir en ferdig norsk setning for %s', (code) => {
    const text = describeLoginError(code);
    expect(isFinishedSentence(text)).toBe(true);
  });

  it.each(SHARED_WITH_WEB)('sier nøyaktig det samme som webben for %s', (code) => {
    expect(describeLoginError(code)).toBe(webErrors[code]);
  });

  it('hver nøkkel under auth.errors er delt, har app-egen ordlyd eller står på WEB_ONLY (#1904)', () => {
    const accounted = new Set<string>([
      ...SHARED_WITH_WEB,
      ...Object.keys(APP_WORDING),
      ...Object.keys(WEB_ONLY),
    ]);
    expect(Object.keys(webErrors).sort()).toEqual([...accounted].sort());
  });

  it.each(Object.keys(APP_WORDING) as LoginErrorCode[])(
    'har en app-egen setning for %s, ikke webbens',
    (code) => {
      expect(describeLoginError(code)).not.toBe(webErrors[code]);
    },
  );

  it('ber aldri om admin når e-posten ikke har konto (#2216)', () => {
    // Den som finner appen i App Store, har ingen admin å spørre. Rød før
    // #2216: setningen var webbens, som ber spilleren spørre en admin.
    expect(describeLoginError('user_not_found')).not.toMatch(/admin/i);
  });

  it('bruker appens egen offline-setning for network — webben har ingen', () => {
    expect(describeLoginError('network')).toBe(OFFLINE_NOTE);
    expect(webErrors).not.toHaveProperty('network');
  });

  it('viser aldri GoTrues engelske tekst videre', () => {
    for (const code of CODES) {
      expect(describeLoginError(code)).not.toMatch(/[a-z]{4,} [a-z]{4,} (limit|token|address)/i);
    }
  });
});

describe('LOGIN_TEXT', () => {
  // Et tomt kodefelt kan ikke sendes (#2216): «Logg inn» er grå til alle
  // sifrene står der. Bare e-postfeltet trenger sin egen setning.
  it('har en egen setning for et tomt e-postfelt, så serveren aldri blir spurt', () => {
    expect(LOGIN_TEXT.emailRequired.trim().length).toBeGreaterThan(0);
  });
});

// #2216: «Ny kode om 0:42» på kode-steget.
describe('nedtellingen til ny kode', () => {
  const SENT = Date.UTC(2026, 9, 1, 12, 0, 0);

  it.each<[number, number]>([
    [0, RESEND_SECONDS],
    [18_000, 42],
    [59_999, 1],
    [60_000, 0],
    [600_000, 0],
    // Klokka gikk bakover (en annen enhet, en justert klokke): aldri over taket.
    [-5_000, RESEND_SECONDS],
  ])('%i ms etter sendingen → %i s igjen', (elapsed, left) => {
    expect(resendWaitSeconds(SENT, SENT + elapsed)).toBe(left);
  });

  it.each<[number, string]>([
    [60, '1:00'],
    [42, '0:42'],
    [5, '0:05'],
    [0, '0:00'],
  ])('%i s skrives «%s»', (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text);
  });

  it('teller åtte siffer, som Supabase og nettsiden', () => {
    expect(OTP_LENGTH).toBe(8);
    expect(LOGIN_TEXT.codeHint).toMatch(/åtte siffer/);
  });
});

// #2216: «Vi sendte den til k••••@firma.no» på kode-steget, som i designet
// (Innlogging-forslag): første tegn, én prikk per resten av lokaldelen, og
// hele domenet.
describe('maskSentToEmail', () => {
  it.each<[string, string]>([
    ['kjell@example.test', 'k••••@example.test'],
    ['kari@example.test', 'k•••@example.test'],
    ['ola.nordmann@example.com', 'o•••••••••••@example.com'],
    ['a@example.test', 'a@example.test'],
    ['ikke-en-adresse', 'ikke-en-adresse'],
    ['', ''],
  ])('«%s» → «%s»', (email, shown) => {
    expect(maskSentToEmail(email)).toBe(shown);
  });
});

