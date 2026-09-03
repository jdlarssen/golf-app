// native/app/src/lib/accountCopy.test.ts
// Native #1876: copyen en spiller møter når hen skal slette kontoen sin.
//
// Testen har tre jobber.
//
//  1. **Ingen kode uten setning.** Hver verdi i de to unionene skal gi en
//     lesbar norsk linje — ikke `undefined`, ikke en tom streng, ikke en
//     igjenglemt plassholder. `tsc` sikrer at switch-ene er uttømmende; denne
//     sikrer at det som kommer ut faktisk er tekst.
//  2. **Paritetsport mot webben.** Alt som også står på `/profile/slett-konto`
//     hentes fra `messages/no.json` og sammenlignes tegn for tegn. Rettes en
//     setning på web uten at appen følger etter, blir denne rød — ellers ville
//     spilleren fått to ulike forklaringer på samme regel, avhengig av flate.
//     `no.json` leses fra node-siden; testen bundles aldri.
//  3. **De to kartene holdes fra hverandre.** Banneret før innsending og feilen
//     etter innsending er ULIKE nøkler for samme årsak. Testen låser hvilken
//     nøkkel som hører til hvilken retning, så ingen «rydder opp» ved å slå dem
//     sammen — banneret ramser opp veien ut per ting, feilmeldingen sier bare
//     «avslutt det», og en sammenslåing ville gitt appen en annen ordlyd enn
//     webben.
import source from '../../../../messages/no.json';
import { OFFLINE_NOTE } from './rosterCopy';
import {
  ACCOUNT_TEXT,
  DISPLAY_NAME_FALLBACK,
  describeDeleteBlock,
  describeDeleteFailure,
  type AccountDeleteFailure,
  type DeleteBlockReason,
} from './accountCopy';

const web = source.profile.deleteAccount;
const webErrors: Record<string, string> = web.errors;

const BLOCK_REASONS: DeleteBlockReason[] = ['admin_account', 'active_engagements'];

const FAILURES: AccountDeleteFailure[] = [
  'offline',
  'no-web-base-url',
  'network',
  'unauthorized',
  'admin_account',
  'active_engagements',
  'status_failed',
  'delete_failed',
];

/** Ingen halvferdig interpolering skal nå fram til skjermen. */
function isFinishedSentence(text: string): boolean {
  return text.trim().length > 0 && !/[{}]/.test(text);
}

describe('describeDeleteBlock', () => {
  it.each(BLOCK_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeDeleteBlock(reason))).toBe(true);
  });

  it.each([
    ['admin_account', 'adminBanner'],
    ['active_engagements', 'blockedBanner'],
  ] as [DeleteBlockReason, 'adminBanner' | 'blockedBanner'][])(
    'viser webbens banner for «%s»',
    (reason, webKey) => {
      expect(describeDeleteBlock(reason)).toBe(web[webKey]);
    },
  );
});

describe('describeDeleteFailure', () => {
  it.each(FAILURES)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeDeleteFailure(reason))).toBe(true);
  });

  it.each([
    ['admin_account', 'admin_account'],
    ['active_engagements', 'active_games'],
    ['delete_failed', 'delete_failed'],
  ] as [AccountDeleteFailure, string][])(
    'viser webbens feilmelding for «%s»',
    (reason, webKey) => {
      expect(describeDeleteFailure(reason)).toBe(webErrors[webKey]);
    },
  );

  // Sletting legges ALDRI i kø. Den delte offline-setningen lover «koble til, så
  // går det gjennom» — sant for en score, feil her. Testen låser at vi ikke
  // faller tilbake på den igjen.
  // Eier-tapptest 2026-09-02: med Wi-Fi av og mobildata på er enheten «online»,
  // men når ikke serveren — da er det denne grenen som vises. Den må si kravet,
  // ikke bare «prøv igjen».
  it('sier at sletting krever nett i BEGGE nett-grenene', () => {
    for (const reason of ['offline', 'network'] as const) {
      expect(describeDeleteFailure(reason)).toMatch(/nett|tilkobling/i);
    }
    expect(describeDeleteFailure('network')).toContain('slette kontoen');
  });

  it('lover ikke at slettingen går gjennom senere', () => {
    const offline = describeDeleteFailure('offline');
    expect(offline).not.toBe(OFFLINE_NOTE);
    expect(offline).toContain('uten nett');
    expect(offline).not.toContain('går det gjennom');
  });

  it('sier hva som mangler når appen ikke vet hvilken server den skal spørre', () => {
    // Ærlig-feil-guardrailen: en knapp som ikke gjør noe er verre enn en knapp
    // som sier hvorfor.
    expect(describeDeleteFailure('no-web-base-url')).toContain('administrator');
  });
});

describe('de to kartene', () => {
  it('bruker ULIKE setninger for «active_engagements» før og etter innsending', () => {
    // Det er nettopp her det er lett å ta feil: samme kode, to nøkler på web.
    expect(describeDeleteBlock('active_engagements')).toBe(web.blockedBanner);
    expect(describeDeleteFailure('active_engagements')).toBe(webErrors.active_games);
    expect(describeDeleteBlock('active_engagements')).not.toBe(
      describeDeleteFailure('active_engagements'),
    );
  });

  it('holder «admin_account» knyttet til hver sin nøkkel, selv om de er like i dag', () => {
    // `adminBanner` og `errors.admin_account` har identisk ordlyd akkurat nå.
    // Slås de sammen i appen, følger ikke appen med den dagen webben endrer
    // bare den ene.
    expect(describeDeleteBlock('admin_account')).toBe(web.adminBanner);
    expect(describeDeleteFailure('admin_account')).toBe(webErrors.admin_account);
  });
});

describe('ACCOUNT_TEXT', () => {
  it.each([
    ['heading', ACCOUNT_TEXT.heading, web.kicker],
    // #1906: appen skrev «Tilbake» så lenge det ikke fantes noe profil-rom å
    // gå tilbake til. Rommet finnes nå, `goBack()` lander i det, og strengen er
    // webbens igjen — låst her så avviket ikke sniker seg inn på nytt.
    ['backLabel', ACCOUNT_TEXT.backLabel, web.backLabel],
    ['deletedHeading', ACCOUNT_TEXT.deletedHeading, web.deletedHeading],
    ['deletedBullets[0]', ACCOUNT_TEXT.deletedBullets[0], web.bullet1],
    ['deletedBullets[1]', ACCOUNT_TEXT.deletedBullets[1], web.bullet2],
    ['deletedBullets[2]', ACCOUNT_TEXT.deletedBullets[2], web.bullet3],
    ['deletedBullets[3]', ACCOUNT_TEXT.deletedBullets[3], web.bullet4],
    ['keptHeading', ACCOUNT_TEXT.keptHeading, web.keptHeading],
    ['keptBullet', ACCOUNT_TEXT.keptBullet, web.keptBullet],
    ['deleteButton', ACCOUNT_TEXT.deleteButton, web.deleteButton],
    ['deletePending', ACCOUNT_TEXT.deletePending, web.deletePending],
    ['cancelButton', ACCOUNT_TEXT.cancelButton, web.cancelButton],
  ])('«%s» er webbens streng tegn for tegn', (_key, appText, webText) => {
    expect(appText).toBe(webText);
  });

  it('setter bekreft-setningen sammen til nøyaktig webbens streng', () => {
    // Webben rendrer navnet fett via `t.rich`; appen deler setningen i to og
    // legger navnet i en egen <Text> mellom delene. Sammensatt igjen — med
    // markeringen der webben har den — skal det være samme streng.
    const rebuilt = `${ACCOUNT_TEXT.confirmLead}<strong>{displayName}</strong>${ACCOUNT_TEXT.confirmTrail}`;
    expect(rebuilt).toBe(web.confirmParagraph);
  });

  it('leser som en hel setning når navnet settes inn', () => {
    expect(
      `${ACCOUNT_TEXT.confirmLead}Kari Nordmann${ACCOUNT_TEXT.confirmTrail}`,
    ).toBe('Du er i ferd med å slette Kari Nordmann permanent. Handlingen kan ikke angres.');
  });

  it('har webbens fallback-navn når spilleren verken har navn eller e-post', () => {
    expect(
      `${ACCOUNT_TEXT.confirmLead}${DISPLAY_NAME_FALLBACK}${ACCOUNT_TEXT.confirmTrail}`,
    ).toBe('Du er i ferd med å slette kontoen din permanent. Handlingen kan ikke angres.');
  });
});
