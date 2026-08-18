import { describe, it, expect } from 'vitest';
import { egressFromEnv } from './playwright.egress';

/**
 * Type A (ren logikk) for #1581. Kontrakten som låses her er «usatt = uendret»:
 * CI (GitHub Actions) og lokal Mac setter ingen av variablene, så `use`-blokka i
 * playwright.config.ts skal være bit-for-bit den samme som før speilingen fantes.
 */
describe('egressFromEnv', () => {
  describe('usatt = uendret', () => {
    it.each([
      ['helt tomt env', {}],
      ['tomme strenger teller som usatt', { HTTPS_PROXY: '', NODE_EXTRA_CA_CERTS: '' }],
      [
        'tomme strenger i alle kjente variabler',
        {
          HTTPS_PROXY: '',
          https_proxy: '',
          HTTP_PROXY: '',
          http_proxy: '',
          NO_PROXY: '',
          no_proxy: '',
          NODE_EXTRA_CA_CERTS: '',
          SSL_CERT_FILE: '',
        },
      ],
    ])('%s → {}', (_label, env) => {
      expect(egressFromEnv(env)).toStrictEqual({});
    });

    it('lar NO_PROXY alene være uten virkning (ingen proxy å omgå)', () => {
      expect(egressFromEnv({ NO_PROXY: 'supabase.co' })).toStrictEqual({});
    });
  });

  describe('proxy-speiling', () => {
    it.each([
      ['HTTPS_PROXY', { HTTPS_PROXY: 'http://vert:3128' }],
      ['https_proxy', { https_proxy: 'http://vert:3128' }],
      ['HTTP_PROXY', { HTTP_PROXY: 'http://vert:3128' }],
      ['http_proxy', { http_proxy: 'http://vert:3128' }],
    ])('%s → proxy.server', (_label, env) => {
      expect(egressFromEnv(env).proxy?.server).toBe('http://vert:3128');
    });

    it('lar uppercase vinne over lowercase, og https vinne over http', () => {
      expect(
        egressFromEnv({
          HTTPS_PROXY: 'http://valgt:1',
          https_proxy: 'http://taper:2',
          HTTP_PROXY: 'http://taper:3',
          http_proxy: 'http://taper:4',
        }).proxy?.server,
      ).toBe('http://valgt:1');
    });

    it('faller tilbake til HTTP_PROXY når ingen https-variant er satt', () => {
      expect(
        egressFromEnv({ HTTP_PROXY: 'http://valgt:3128', http_proxy: 'http://taper:2' })
          .proxy?.server,
      ).toBe('http://valgt:3128');
    });

    it('trimmer whitespace rundt proxy-URL-en', () => {
      expect(egressFromEnv({ HTTPS_PROXY: '  http://vert:3128  ' }).proxy?.server).toBe(
        'http://vert:3128',
      );
    });

    it('holder userinfo utenfor server og leverer den dekodet som username/password', () => {
      const proxy = egressFromEnv({
        HTTPS_PROXY: 'http://bruker%40tornygolf.no:pa%2Fssord@vert:3128',
      }).proxy;
      expect(proxy?.server).toBe('http://vert:3128');
      expect(proxy?.username).toBe('bruker@tornygolf.no');
      expect(proxy?.password).toBe('pa/ssord');
    });

    it('utelater username/password når proxy-URL-en ikke har userinfo', () => {
      const proxy = egressFromEnv({ HTTPS_PROXY: 'http://vert:3128' });
      expect(proxy.proxy).not.toHaveProperty('username');
      expect(proxy.proxy).not.toHaveProperty('password');
    });

    it('tar med username uten password når bare brukernavn er oppgitt', () => {
      const proxy = egressFromEnv({ HTTPS_PROXY: 'http://bruker@vert:3128' }).proxy;
      expect(proxy?.username).toBe('bruker');
      expect(proxy).not.toHaveProperty('password');
    });

    it('beholder porten når proxy-URL-en har sti eller query (bare origin brukes)', () => {
      expect(egressFromEnv({ HTTPS_PROXY: 'http://vert:3128/sti?x=1' }).proxy?.server).toBe(
        'http://vert:3128',
      );
    });

    it.each([
      ['ikke en url'],
      ['vert:3128'],
      ['://vert'],
    ])('kaster på ugyldig proxy-URL (%s) med variabelnavnet i meldingen', (verdi) => {
      expect(() => egressFromEnv({ HTTPS_PROXY: verdi })).toThrow(/HTTPS_PROXY/);
    });
  });

  describe('bypass', () => {
    it('omgår alltid localhost og 127.0.0.1 — appen under test er lokal', () => {
      expect(egressFromEnv({ HTTPS_PROXY: 'http://vert:3128' }).proxy?.bypass).toBe(
        'localhost,127.0.0.1',
      );
    });

    it.each([
      ['NO_PROXY', { NO_PROXY: 'intern.no,.staging.no' }],
      ['no_proxy', { no_proxy: 'intern.no,.staging.no' }],
    ])('legger %s bak standard-omgåelsene', (_label, env) => {
      expect(
        egressFromEnv({ HTTPS_PROXY: 'http://vert:3128', ...env }).proxy?.bypass,
      ).toBe('localhost,127.0.0.1,intern.no,.staging.no');
    });

    it('trimmer ledd og dropper tomme ledd', () => {
      expect(
        egressFromEnv({
          HTTPS_PROXY: 'http://vert:3128',
          NO_PROXY: ' intern.no , , .staging.no ,',
        }).proxy?.bypass,
      ).toBe('localhost,127.0.0.1,intern.no,.staging.no');
    });

    it('dupliserer ikke localhost når NO_PROXY allerede nevner den', () => {
      expect(
        egressFromEnv({
          HTTPS_PROXY: 'http://vert:3128',
          NO_PROXY: 'localhost,127.0.0.1,intern.no',
        }).proxy?.bypass,
      ).toBe('localhost,127.0.0.1,intern.no');
    });
  });

  describe('CA-speiling', () => {
    it.each([
      ['NODE_EXTRA_CA_CERTS', { NODE_EXTRA_CA_CERTS: '/root/.ccr/ca-bundle.crt' }],
      ['SSL_CERT_FILE', { SSL_CERT_FILE: '/root/.ccr/ca-bundle.crt' }],
    ])('%s satt → ignoreHTTPSErrors: true', (_label, env) => {
      expect(egressFromEnv(env)).toStrictEqual({ ignoreHTTPSErrors: true });
    });

    it('utelater nøkkelen helt når ingen CA-variabel er satt', () => {
      expect(egressFromEnv({ HTTPS_PROXY: 'http://vert:3128' })).not.toHaveProperty(
        'ignoreHTTPSErrors',
      );
    });

    it('kombinerer proxy og CA når begge er satt', () => {
      expect(
        egressFromEnv({
          HTTPS_PROXY: 'http://vert:3128',
          NODE_EXTRA_CA_CERTS: '/root/.ccr/ca-bundle.crt',
        }),
      ).toStrictEqual({
        proxy: { server: 'http://vert:3128', bypass: 'localhost,127.0.0.1' },
        ignoreHTTPSErrors: true,
      });
    });
  });
});
