import { describe, expect, it } from 'vitest';
import { FORM_SCREENS, pickBackEntry, screenKey } from './backTarget';

// #2746: hvor pila på nettet fører. Type A. Lista er det nettleseren selv sier
// om historikken, så testene gir den direkte.

const ORIGIN = 'https://tornygolf.no';
const entries = (...paths: string[]) => paths.map((path) => ({ url: `${ORIGIN}${path}` }));
/** Pila fra siste oppføring: stien den fører til, eller null for reserven. */
function backFromLast(...paths: string[]): string | null {
  const list = entries(...paths);
  const index = pickBackEntry(list, list.length - 1);
  return index === null ? null : paths[index]!;
}

describe('screenKey', () => {
  it('tar bort språkprefikset og alt etter «?»', () => {
    expect(screenKey(`${ORIGIN}/en/games/x`)).toBe('/games/x');
    expect(screenKey(`${ORIGIN}/en`)).toBe('/');
    expect(screenKey(`${ORIGIN}/games/x/leaderboard?scoring=brutto`)).toBe('/games/x/leaderboard');
  });

  it('samler alle hullene til samme skjerm', () => {
    expect(screenKey(`${ORIGIN}/games/x/holes/3`)).toBe('/games/x/holes');
    expect(screenKey(`${ORIGIN}/games/x/holes/18?foo=1`)).toBe('/games/x/holes');
  });

  it('forveksler ikke en side som bare begynner likt med språkprefikset', () => {
    expect(screenKey(`${ORIGIN}/english`)).toBe('/english');
  });
});

describe('FORM_SCREENS', () => {
  const isForm = (path: string) => FORM_SCREENS.some((pattern) => pattern.test(path));

  it.each([
    '/games/x/submit',
    '/games/x/approve',
    '/games/x/slett',
    '/games/x/trekk-fra',
    '/games/x/avslutt',
    '/games/x/rediger',
    '/admin/games/new',
    '/admin/games/x/edit',
    '/admin/games/x/trekk-spiller/u',
    '/profile/slett-konto',
    '/profile/venner/fjern/u',
    '/opprett-spill',
    '/opprett-spill/slett-utkast',
    '/opprett-bane',
    '/klubber/x/rolle/u',
    '/liga/x/godkjenn/g/u',
    '/complete-profile',
  ])('%s er et skjema', (path) => {
    expect(isForm(path)).toBe(true);
  });

  it.each([
    '/',
    '/games/x',
    '/games/x/holes',
    '/games/x/leaderboard',
    '/games/x/klar',
    '/profile',
    '/profile/venner',
    '/liga/x',
    // Informasjonssiden om sletting, ikke skjemaet under profilen.
    '/legal/slett-konto',
    '/legal/privacy',
  ])('%s er ikke et skjema', (path) => {
    expect(isForm(path)).toBe(false);
  });
});

describe('pickBackEntry', () => {
  it('kald start: én oppføring gir null, og lenka tar over', () => {
    expect(backFromLast('/games/x')).toBeNull();
  });

  it('#117-løkka: historikk → tavla → hull-oversikt → tavla → pil gir historikken', () => {
    expect(
      backFromLast('/historikk', '/games/x/leaderboard', '/games/x/leaderboard/holes', '/games/x/leaderboard'),
    ).toBe('/historikk');
  });

  it('å bla mellom hull er samme skjerm: hull 12 → pil gir spillet', () => {
    const holes = Array.from({ length: 12 }, (_, i) => `/games/x/holes/${i + 1}`);
    expect(backFromLast('/games/x', ...holes)).toBe('/games/x');
  });

  it('en erstattet redigering: to kopier av Profil → pil gir Hjem', () => {
    expect(backFromLast('/', '/profile', '/profile')).toBe('/');
  });

  it('et skjema bak deg hoppes over', () => {
    expect(backFromLast('/games/x', '/games/x/submit', '/games/x/leaderboard')).toBe('/games/x');
  });

  it('bare skjemaer bak deg gir null', () => {
    expect(backFromLast('/games/x/submit', '/games/x')).toBeNull();
  });

  it('/en/games/x og /games/x er samme skjerm', () => {
    expect(backFromLast('/', '/en/games/x', '/games/x')).toBe('/');
  });

  it('netto og brutto er samme skjerm', () => {
    expect(
      backFromLast('/games/x', '/games/x/leaderboard?scoring=netto', '/games/x/leaderboard?scoring=brutto'),
    ).toBe('/games/x');
  });

  it('oppføringer etter den du står på teller ikke', () => {
    const list = entries('/', '/games/x', '/games/x/holes/1');
    expect(pickBackEntry(list, 1)).toBe(0);
  });

  it('en oppføring uten adresse hoppes over', () => {
    expect(pickBackEntry([{ url: `${ORIGIN}/` }, { url: null }, { url: `${ORIGIN}/games/x` }], 2)).toBe(0);
  });

  it('står du på første oppføring, er det ingenting bak deg', () => {
    expect(pickBackEntry(entries('/', '/games/x'), 0)).toBeNull();
  });

  // Produktvalget i PR-en (eierens svar mangler): en skjerm under den du står på
  // er ikke «bak deg». Tas valget bort, er det `isBelow` i `pickBackEntry` og
  // disse to testene som går ut.
  describe('skjermer under den du står på', () => {
    it('kortet levert fra et hull du åpnet på Hjem: pil fra spillet gir Hjem, som i appen', () => {
      expect(backFromLast('/', '/games/x/holes/18', '/games/x')).toBe('/');
    });

    it('kostnaden: fra hull 3 til spillet med en vanlig lenke gir også Hjem, mens appen går til hullet', () => {
      expect(backFromLast('/', '/games/x/holes/3', '/games/x')).toBe('/');
    });

    it('et annet spill er ikke under dette', () => {
      expect(backFromLast('/games/y', '/games/x/holes/18', '/games/x')).toBe('/games/y');
    });

    it('Hjem har ingenting under seg: `/` hopper ikke over alt', () => {
      expect(backFromLast('/profile', '/')).toBe('/profile');
    });
  });
});
