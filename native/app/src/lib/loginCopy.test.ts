// native/app/src/lib/loginCopy.test.ts
// Native #1977: GoTrue-feilene på innloggingsskjermen, på norsk.
//
// Testen har tre jobber.
//
//  1. **Klassifisereren treffer de EKTE strengene.** Radene under er ordrett
//     det GoTrue svarer — tre av dem er observert i simulatoren mot staging i
//     P4-runden, resten er webbens egne match-regler og deres fikstur-tekster.
//     Rekkefølge-fellene har hver sin rad: kvoten inneholder selv ordet «rate»,
//     og en nett-feil har ingen HTTP-kode å falle tilbake på.
//  2. **Paritetsport mot webben.** Hver kode som også finnes på nettsidens
//     `/login` hentes fra `messages/no.json` og sammenlignes tegn for tegn.
//     Rettes en setning på web uten at appen følger etter, blir denne rød.
//     `no.json` leses fra node-siden; testen bundles aldri. Hver nøkkel under
//     `auth.errors` er enten delt med appen eller står på `WEB_ONLY` med en
//     begrunnelse (#1904) — får webben en ny feilkode, blir testen rød til
//     noen har tatt stilling til om appen skal vise den.
//  3. **Ingen kode uten setning.** `tsc` sikrer at switch-en er uttømmende;
//     denne sikrer at det som kommer ut faktisk er lesbar tekst.
import source from '../../../../messages/no.json';
import { OFFLINE_NOTE } from './rosterCopy';
import {
  LOGIN_TEXT,
  classifyLoginError,
  describeLoginError,
  type LoginErrorCode,
  type LoginStep,
} from './loginCopy';

const webErrors: Record<string, string> = source.auth.errors;

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
const CODE_MAP = {
  rate_limited_minute: true,
  rate_limited_quota: true,
  user_not_found: true,
  code_invalid: true,
  code_expired: true,
  network: true,
  unknown: true,
} as const satisfies Record<LoginErrorCode, true>;

const CODES = Object.keys(CODE_MAP) as readonly LoginErrorCode[];

/** Kodene appen deler med webben. `network` er app-egen (offline-først). */
const SHARED_WITH_WEB = CODES.filter((code) => code !== 'network');

/**
 * Webbens feilkoder appen med vilje IKKE har (se `LoginErrorCode` i
 * `loginCopy.ts`). De tre første krever noe bare webbens server har.
 */
const WEB_ONLY: Partial<Record<keyof typeof source.auth.errors, string>> = {
  rate_limited: 'webbens egen 15-minutters bøtte i login-actionen',
  invite_expired: 'krever et service-role-oppslag på utløpte invitasjoner',
  disposable_email: 'webbens sperre mot engangsadresser ved åpen selvregistrering',
  link_expired: 'fra magic-link-tiden; appen har ingen lenke',
};

describe('classifyLoginError', () => {
  it.each<[LoginStep, string, string, LoginErrorCode]>([
    // ── send-code ────────────────────────────────────────────────────────────
    // Observert i simulatoren mot staging, P4 (#1954 §4 rad 1).
    ['send-code', 'email rate limit exceeded', '', 'rate_limited_quota'],
    // Kvoten MÅ vinne over den generelle rate-regelen: teksten over inneholder
    // selv «rate», og de to deler error.code.
    ['send-code', 'Email rate limit exceeded', 'over_email_send_rate_limit', 'rate_limited_quota'],
    [
      'send-code',
      'For security purposes, you can only request this after 60 seconds.',
      '',
      'rate_limited_minute',
    ],
    ['send-code', 'Too many requests', 'over_request_rate_limit', 'rate_limited_minute'],
    ['send-code', '', 'over_email_send_rate_limit', 'rate_limited_minute'],
    // Ukjent adresse: appen sender ALLTID shouldCreateUser:false, så GoTrue
    // svarer «signups not allowed» / otp_disabled i stedet for «not found».
    ['send-code', 'Signups not allowed for otp', 'otp_disabled', 'user_not_found'],
    ['send-code', 'User not found', 'user_not_found', 'user_not_found'],
    ['send-code', 'Signups are disabled', 'signup_disabled', 'user_not_found'],
    // Observert i simulatoren: en adresse GoTrue ikke godtar.
    ['send-code', 'Email address "x@y" is invalid', 'validation_failed', 'user_not_found'],
    ['send-code', 'Noe helt annet fra serveren', '', 'unknown'],
    // Nett-sjekken går FØRST: en forespørsel som aldri kom fram har ingen kode.
    ['send-code', 'Network request failed', '', 'network'],
    ['send-code', 'Failed to fetch', '', 'network'],
    ['send-code', 'Load failed', '', 'network'],

    // ── verify-code ──────────────────────────────────────────────────────────
    // GoTrue svarer likt på feiltastet og utløpt kode. Webben lander på «gått
    // ut» for begge; appen speiler det med vilje.
    ['verify-code', 'Token has expired or is invalid', 'otp_expired', 'code_expired'],
    ['verify-code', 'Token has expired', '', 'code_expired'],
    ['verify-code', 'Invalid token', 'validation_failed', 'code_invalid'],
    ['verify-code', 'Noe helt annet fra serveren', '', 'code_invalid'],
    ['verify-code', 'Network request failed', '', 'network'],
  ])('%s: «%s» (%s) → %s', (step, message, code, expected) => {
    expect(classifyLoginError(step, { message, code })).toBe(expected);
  });

  it('tåler en feil uten tekst og uten kode', () => {
    expect(classifyLoginError('send-code', {})).toBe('unknown');
    expect(classifyLoginError('verify-code', {})).toBe('code_invalid');
    expect(classifyLoginError('send-code', { message: null, code: null })).toBe('unknown');
  });
});

describe('describeLoginError', () => {
  it.each(CODES)('gir en ferdig norsk setning for %s', (code) => {
    const text = describeLoginError(code);
    expect(text.trim().length).toBeGreaterThan(0);
    // Ingen halvferdig interpolering skal nå fram til skjermen.
    expect(text).not.toMatch(/[{}]/);
  });

  it.each(SHARED_WITH_WEB)('sier nøyaktig det samme som webben for %s', (code) => {
    expect(describeLoginError(code)).toBe(webErrors[code]);
  });

  it('hver nøkkel under auth.errors er delt med appen eller står på WEB_ONLY (#1904)', () => {
    const accounted = new Set<string>([...SHARED_WITH_WEB, ...Object.keys(WEB_ONLY)]);
    expect(Object.keys(webErrors).sort()).toEqual([...accounted].sort());
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
  it('har en egen setning for hvert tomt felt, så Supabase aldri blir spurt', () => {
    expect(LOGIN_TEXT.emailRequired.trim().length).toBeGreaterThan(0);
    expect(LOGIN_TEXT.codeRequired.trim().length).toBeGreaterThan(0);
    expect(LOGIN_TEXT.emailRequired).not.toBe(LOGIN_TEXT.codeRequired);
  });
});
