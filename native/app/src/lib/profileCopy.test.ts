// native/app/src/lib/profileCopy.test.ts
// Native #1906: copyen og tallformateringen i profil-rommet.
//
// Fire jobber, samme mønster som `accountCopy.test.ts`.
//
//  1. **Ingen tekst uten setning.** Hver verdi skal være lesbar norsk — ikke
//     tom, ikke en igjenglemt `{plassholder}`.
//  2. **Paritetsport mot webben.** Alt som også står på `/profile` hentes fra
//     `messages/no.json` og sammenlignes tegn for tegn. Rettes en rad på web
//     uten at appen følger etter, blir denne rød.
//  3. **Tallformateringen kan ikke drifte fra webbens.** Appen bygger
//     handicap-strengen lokalt fordi Hermes mangler ICU. Testen kjører i node,
//     der Intl finnes, og krever at hver verdi gir NØYAKTIG det webbens
//     `formatHcpDisplay(x, 'no')` gir. Det er denne todelingen — lokal
//     implementasjon, Intl-fasit i testen — som holder de to i takt.
//  4. **Advarselen ved utlogging leser riktig for ett og for mange slag.**
import source from '../../../../messages/no.json';
import { formatHcpDisplay } from '../../../../lib/handicap/sign';
import { HANDICAP_STALENESS_MS } from '../../../../lib/handicap/staleness';
import {
  PROFILE_TEXT,
  describeHandicapAge,
  formatHcpNb,
  hcpUpdatedLine,
  unsentStrokesWarning,
} from './profileCopy';

const web = source.profile;

/** Ingen halvferdig interpolering skal nå fram til skjermen. */
function isFinishedSentence(text: string): boolean {
  return text.trim().length > 0 && !/[{}]/.test(text);
}

describe('PROFILE_TEXT', () => {
  it.each(Object.entries(PROFILE_TEXT))('«%s» er en ferdig tekst', (_key, text) => {
    // `hcpUpdatedPrefix` er med vilje en halv setning (datoen settes inn av
    // `hcpUpdatedLine`), men den skal likevel ikke bære en plassholder.
    expect(isFinishedSentence(text)).toBe(true);
  });

  it.each([
    ['heading', PROFILE_TEXT.heading, web.kicker],
    ['displayNameFallback', PROFILE_TEXT.displayNameFallback, web.displayNameFallback],
    ['sectionAccount', PROFILE_TEXT.sectionAccount, web.sectionAccount],
    ['setHandicap', PROFILE_TEXT.setHandicap, web.setHandicap],
    ['hcpStaleShort', PROFILE_TEXT.hcpStaleShort, web.hcpStaleShort],
    ['logout', PROFILE_TEXT.logout, web.logoutButton],
    ['logoutPending', PROFILE_TEXT.logoutPending, web.logoutPending],
    ['deleteRow', PROFILE_TEXT.deleteRow, web.deleteRow],
  ])('«%s» er webbens streng tegn for tegn', (_key, appText, webText) => {
    expect(appText).toBe(webText);
  });

  it('setter «Oppdatert {dato}» sammen igjen til nøyaktig webbens streng', () => {
    // Webben rendrer ICU-strengen med next-intl; appen klipper plassholderen av
    // og setter datoen inn selv. Byttes plassholderen inn igjen, skal det være
    // samme streng — ellers har den ene siden fått et komma eller et
    // mellomrom den andre ikke har.
    expect(hcpUpdatedLine('{dato}')).toBe(web.hcpUpdatedShort);
  });

  it('leser som en hel linje når datoen settes inn', () => {
    expect(hcpUpdatedLine('12. mai')).toBe('Oppdatert 12. mai');
  });

});

describe('formatHcpNb', () => {
  // Fasiten er webbens egen funksjon, ikke en håndskrevet forventning: den
  // andre kolonnen dokumenterer bare hva de to blir enige om.
  it.each([
    [0, '0,0'],
    [12.4, '12,4'],
    [-1.5, '+1,5'],
    [54, '54,0'],
    [-10, '+10,0'],
    [8, '8,0'],
  ])('formaterer %p som «%s»', (signed, expected) => {
    expect(formatHcpNb(signed)).toBe(expected);
    expect(formatHcpNb(signed)).toBe(formatHcpDisplay(signed, 'no'));
  });

  it('setter aldri plusstegn på scratch', () => {
    // `-0` finnes som lagret verdi hvis noe har regnet seg fram til den.
    // «+0,0» er ikke et handicap.
    expect(formatHcpNb(-0)).toBe('0,0');
  });

  it('bruker norsk desimalkomma, aldri punktum', () => {
    expect(formatHcpNb(12.4)).not.toContain('.');
  });
});

describe('unsentStrokesWarning', () => {
  it('bøyer setningen riktig for ett slag og for flere', () => {
    expect(unsentStrokesWarning(1)).toBe(
      '1 slag er ikke sendt ennå. Logger du ut nå, blir det liggende på telefonen til du logger inn igjen.',
    );
    expect(unsentStrokesWarning(3)).toBe(
      '3 slag er ikke sendt ennå. Logger du ut nå, blir de liggende på telefonen til du logger inn igjen.',
    );
    expect(unsentStrokesWarning(1)).not.toBe(unsentStrokesWarning(3));
  });

  it('lover ikke at slagene blir sendt', () => {
    // Regelen bak setningen, ikke ordlyden: `logOut` teller karantene-rader
    // (#668) med i tallet, og de hoppes over av hver eneste senere drain — de
    // går ALDRI opp. Logger dessuten en annen bruker inn på telefonen, finnes
    // det ingen eier-vakt som rydder. Et løfte om levering ville altså vært
    // usant i to av tre tilfeller, og spilleren tar valget «Logg ut likevel»
    // på nettopp den setningen.
    for (const count of [1, 3]) {
      expect(unsentStrokesWarning(count)).not.toMatch(/sendes|blir sendt|går opp/);
    }
  });
});

describe('describeHandicapAge', () => {
  const NOW = new Date('2026-05-12T10:00:00Z');

  it('viser datoen når handicapet er ferskt', () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(describeHandicapAge(yesterday, NOW)).toBe('Oppdatert 11. mai');
  });

  it('ber om en oppdatering når det er for gammelt', () => {
    const old = new Date(NOW.getTime() - HANDICAP_STALENESS_MS - 1).toISOString();
    expect(describeHandicapAge(old, NOW)).toBe(PROFILE_TEXT.hcpStaleShort);
  });

  it('ber om en oppdatering når tidsstempelet mangler', () => {
    expect(describeHandicapAge(null, NOW)).toBe(PROFILE_TEXT.hcpStaleShort);
  });

  it('viser aldri «Invalid Date» på et ulesbart tidsstempel', () => {
    // `isHandicapStale` leser NaN-differansen som «ikke gammelt», så uten den
    // egne vakten hadde denne havnet i dato-grenen.
    expect(describeHandicapAge('tull', NOW)).toBe(PROFILE_TEXT.hcpStaleShort);
  });
});
