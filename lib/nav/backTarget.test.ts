import { describe, expect, it } from 'vitest';
import { lacksHrefChoices, namesSubView, pickBackEntry, screenKey, STAYS_AFTER_SENDING } from './backTarget';

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

describe('namesSubView', () => {
  it('en undervisning som peker på sin egen forelder', () => {
    expect(namesSubView(`${ORIGIN}/klubbhuset?vis=utkast`, '/klubbhuset')).toBe(true);
    expect(namesSubView(`${ORIGIN}/admin/games/s/edit?del=navn-og-tid`, '/admin/games/s/edit')).toBe(true);
    expect(namesSubView(`${ORIGIN}/en/admin/games/s/signups?tab=approved`, '/admin/games/s/signups')).toBe(true);
  });

  it('en pil som peker på en annen skjerm', () => {
    expect(namesSubView(`${ORIGIN}/games/x/holes/5`, '/games/x')).toBe(false);
    expect(namesSubView(`${ORIGIN}/games/x/leaderboard?scoring=brutto`, '/games/x')).toBe(false);
  });

  it('en pil som peker på seg selv, er ingen undervisning', () => {
    expect(namesSubView(`${ORIGIN}/en/spectate/t`, '/spectate/t')).toBe(false);
  });
});

describe('lacksHrefChoices', () => {
  it('oppføringen mangler det pila bærer: banen du nettopp lagde', () => {
    expect(lacksHrefChoices(`${ORIGIN}/opprett-spill?step=3`, '/opprett-spill?step=3&bane=b')).toBe(true);
  });

  it('samme valg med en annen verdi', () => {
    expect(lacksHrefChoices(`${ORIGIN}/opprett-spill?step=2`, '/opprett-spill?step=3')).toBe(true);
  });

  it('oppføringen har alt pila bærer, og gjerne mer', () => {
    expect(lacksHrefChoices(`${ORIGIN}/opprett-spill?step=3`, '/opprett-spill?step=3')).toBe(false);
    expect(lacksHrefChoices(`${ORIGIN}/games/x?status=submitted`, '/games/x')).toBe(false);
  });

  it('en annen skjerm enn pilas mål sier ingenting', () => {
    expect(lacksHrefChoices(`${ORIGIN}/profile`, '/opprett-spill?step=3&bane=b')).toBe(false);
  });
});

describe('STAYS_AFTER_SENDING', () => {
  const stays = (path: string) => STAYS_AFTER_SENDING.some((pattern) => pattern.test(path));

  it.each(['/games/x/approve', '/liga/x/godkjenn/g/u'])('%s blir stående etter sending', (path) => {
    expect(stays(path)).toBe(true);
  });

  // Et skjema du har sendt, er borte med `replace`. Et du ikke har sendt, skal du
  // kunne gå tilbake til (regel 1).
  it.each([
    '/',
    '/games/x',
    '/games/x/submit',
    '/games/x/slett',
    '/opprett-spill',
    '/opprett-bane',
    '/admin/games/new',
    '/profile/slett-konto',
    '/klubber/bli-med/k',
    '/login',
  ])('%s er ikke med', (path) => {
    expect(stays(path)).toBe(false);
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

  it('regel 4 med en annen side imellom: hull → tavla → hull → pil gir spillet', () => {
    expect(backFromLast('/games/x', '/games/x/holes/3', '/games/x/leaderboard', '/games/x/holes/5')).toBe('/games/x');
  });

  it('å bla mellom hull er samme skjerm: hull 12 → pil gir spillet', () => {
    const holes = Array.from({ length: 12 }, (_, i) => `/games/x/holes/${i + 1}`);
    expect(backFromLast('/games/x', ...holes)).toBe('/games/x');
  });

  it('en erstattet redigering: to kopier av Profil → pil gir Hjem', () => {
    expect(backFromLast('/', '/profile', '/profile')).toBe('/');
  });

  it('et godkjent kort blir stående etter sending, og hoppes over', () => {
    expect(backFromLast('/games/x', '/games/x/approve?status=approved', '/games/x/leaderboard')).toBe('/games/x');
  });

  // Regel 1: et usendt skjema er der du kom fra. Et sendt er borte med `replace`.
  it('et usendt skjema du gikk fra, er der du kom fra', () => {
    expect(backFromLast('/games/x', '/games/x/slett', '/legal/privacy')).toBe('/games/x/slett');
    expect(backFromLast('/admin/games/s', '/admin/games/s/edit', '/admin/games/s/startlista')).toBe('/admin/games/s/edit');
    expect(backFromLast('/', '/opprett-spill?step=2', '/profile/venner')).toBe('/opprett-spill?step=2');
  });

  it('bare et godkjent kort bak deg gir null', () => {
    expect(backFromLast('/games/x/approve?status=approved', '/games/x/leaderboard')).toBeNull();
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
