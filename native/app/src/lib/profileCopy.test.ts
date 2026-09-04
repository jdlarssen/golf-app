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
//  5. **Ingen lagrings-kode uten setning.** Hver verdi i `ProfileSaveFailure`
//     skal gi en lesbar norsk linje. `tsc` sikrer at switch-en er uttømmende;
//     denne sikrer at det som kommer ut faktisk er tekst — og at de fire
//     valideringskodene sier NØYAKTIG det webbens skjema sier, siden det er
//     samme regel som avviste deg.
//
// `ProfileSaveFailure` hentes som ren TYPE fra `data/profile.ts`. Det er
// bevisst: en verdi-import derfra ville dratt inn `../supabase`, som kaster
// uten `EXPO_PUBLIC_SUPABASE_*` — og denne suiten mocker ingenting.
import source from '../../../../messages/no.json';
import { formatHcpDisplay } from '../../../../lib/handicap/signFormat';
import { HANDICAP_STALENESS_MS } from '../../../../lib/handicap/staleness';
import type { ProfileSaveFailure } from '../data/profile';
import {
  PROFILE_TEXT,
  describeHandicapAge,
  describeProfileSaveFailure,
  formatHcpNb,
  hcpUpdatedLine,
  unsentStrokesWarning,
} from './profileCopy';

const web = source.profile;
const webForm = web.form;
const webErrors: Record<string, string> = web.errors;

const SAVE_FAILURES: ProfileSaveFailure[] = [
  'offline',
  'no-web-base-url',
  'network',
  'unauthorized',
  'name_required',
  'hcp_invalid',
  'gender_required',
  'level_invalid',
  'update_failed',
];

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
    ['updatedBanner', PROFILE_TEXT.updatedBanner, web.updatedBanner],
    // Skjemaet: samme felt, samme ord, to flater.
    ['nameLabel', PROFILE_TEXT.nameLabel, webForm.nameLabel],
    ['nicknameLabel', PROFILE_TEXT.nicknameLabel, webForm.nicknameLabel],
    ['nicknamePlaceholder', PROFILE_TEXT.nicknamePlaceholder, webForm.nicknamePlaceholder],
    ['handicapLabel', PROFILE_TEXT.handicapLabel, webForm.handicapLabel],
    ['plusHandicapLabel', PROFILE_TEXT.plusHandicapLabel, webForm.plusHandicapAriaLabel],
    ['savedAsPrefix', PROFILE_TEXT.savedAsPrefix, webForm.savedAsPrefix],
    ['savedAsSuffix', PROFILE_TEXT.savedAsSuffix, webForm.savedAsSuffix],
    ['emailLine', PROFILE_TEXT.emailLine, webForm.emailLine],
    ['golfProfileLabel', PROFILE_TEXT.golfProfileLabel, webForm.golfProfileLabel],
    ['genderLegend', PROFILE_TEXT.genderLegend, webForm.genderLegend],
    ['genderHint', PROFILE_TEXT.genderHint, webForm.genderHint],
    ['genderMale', PROFILE_TEXT.genderMale, webForm.genderMale],
    ['genderFemale', PROFILE_TEXT.genderFemale, webForm.genderFemale],
    ['levelLegend', PROFILE_TEXT.levelLegend, webForm.levelLegend],
    ['levelHint', PROFILE_TEXT.levelHint, webForm.levelHint],
    ['levelJunior', PROFILE_TEXT.levelJunior, webForm.levelJunior],
    ['levelAdult', PROFILE_TEXT.levelAdult, webForm.levelAdult],
    ['levelSenior', PROFILE_TEXT.levelSenior, webForm.levelSenior],
    ['saveButton', PROFILE_TEXT.saveButton, webForm.saveButton],
    ['savePending', PROFILE_TEXT.savePending, webForm.savePending],
    ['saveHint', PROFILE_TEXT.saveHint, webForm.saveHint],
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

  it('setter handicap-ekkoet sammen til en hel linje', () => {
    // «Lagres som +1,5 · plusshandicap» — delene står hver for seg fordi
    // tallet skal midt inn og suffikset bare henger på for plusshandicap.
    expect(
      `${PROFILE_TEXT.savedAsPrefix} ${formatHcpNb(-1.5)} ${PROFILE_TEXT.savedAsSuffix}`,
    ).toBe('Lagres som +1,5 · plusshandicap');
  });

  it('skiller raden inn til skjemaet fra tittelen på skjemaet', () => {
    // Like i dag, to nøkler likevel — samme grunn som `deleteRow` og
    // `ACCOUNT_TEXT.heading`: den ene er veien inn, den andre er stedet.
    expect(PROFILE_TEXT.editRow).toBe('Rediger profil');
    expect(PROFILE_TEXT.editHeading).toBe('Rediger profil');
  });
});

describe('describeProfileSaveFailure', () => {
  it.each(SAVE_FAILURES)('gir en ferdig setning for «%s»', (reason) => {
    const text = describeProfileSaveFailure(reason);
    expect(text).toBeDefined();
    expect(isFinishedSentence(text)).toBe(true);
  });

  it.each([
    ['name_required', 'name_required'],
    ['hcp_invalid', 'hcp_invalid'],
    ['gender_required', 'gender_required'],
    ['level_invalid', 'level_invalid'],
    // Ruta svarer `update_failed`; webbens copy-nøkkel for samme utfall heter
    // `unknown`. Kartet står her, ikke i datalaget.
    ['update_failed', 'unknown'],
  ] as [ProfileSaveFailure, string][])(
    'viser webbens feilmelding for «%s»',
    (reason, webKey) => {
      expect(describeProfileSaveFailure(reason)).toBe(webErrors[webKey]);
    },
  );

  it('sier at lagring krever nett i BEGGE nett-grenene', () => {
    // Eier-tapptesten på slette-flyten (Wi-Fi av, mobildata på: enheten er
    // «online», men når ikke serveren) viste at «prøv igjen» alene ikke
    // forteller hva som skal være annerledes neste gang.
    for (const reason of ['offline', 'network'] as const) {
      expect(describeProfileSaveFailure(reason)).toMatch(/nett|tilkobling/i);
      expect(describeProfileSaveFailure(reason)).toContain('lagre');
    }
  });

  it('lover ikke at lagringen skjer av seg selv senere', () => {
    // Profil-lagring legges ALDRI i sync-køen — regelen kjøres på serveren.
    // En setning som lover levering ville vært usann.
    expect(describeProfileSaveFailure('offline')).not.toMatch(/sendes|går det gjennom/);
  });

  it('sier hva som mangler når appen ikke vet hvilken server den skal spørre', () => {
    expect(describeProfileSaveFailure('no-web-base-url')).toContain('administrator');
  });

  it('holder valideringskodene fra hverandre', () => {
    // Fire ulike grunner til at skjemaet ble avvist. Slås to av dem sammen,
    // står spilleren med en setning som peker på feil felt.
    const sentences = SAVE_FAILURES.map(describeProfileSaveFailure);
    expect(new Set(sentences).size).toBe(SAVE_FAILURES.length);
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
      '1 slag er ikke sendt ennå. Logger du ut nå, blir det liggende på telefonen til du logger inn igjen, med mindre noen andre logger inn før deg.',
    );
    expect(unsentStrokesWarning(3)).toBe(
      '3 slag er ikke sendt ennå. Logger du ut nå, blir de liggende på telefonen til du logger inn igjen, med mindre noen andre logger inn før deg.',
    );
    expect(unsentStrokesWarning(1)).not.toBe(unsentStrokesWarning(3));
  });

  it('lover ikke at slagene blir sendt', () => {
    // Regelen bak setningen, ikke ordlyden: `logOut` teller karantene-rader
    // (#668) med i tallet, og de hoppes over av hver eneste senere drain — de
    // går ALDRI opp. Logger dessuten en annen bruker inn på telefonen, tømmer
    // eier-vakten (#1942) radene før første drain. Et løfte om levering ville
    // altså vært usant i to av tre tilfeller, og spilleren tar valget «Logg ut
    // likevel» på nettopp den setningen.
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
