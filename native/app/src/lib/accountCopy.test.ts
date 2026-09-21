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
//     Porten er et regnskap, ikke en håndplukket liste (#1904, #1912): hver
//     nøkkel under `profile.deleteAccount` og `.errors` er enten speilet eller
//     står på `WEB_ONLY` med en begrunnelse. Får webben en ny nøkkel — et
//     femte kulepunkt, et nytt banner — blir testen rød til noen har tatt
//     stilling. Kartene under bærer webbens nøkkel per kode, så en ny kode må
//     få en nøkkel eller `null` før `tsc` slipper den gjennom.
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

type WebKey = Exclude<keyof typeof web, 'errors'>;
type WebErrorKey = keyof typeof web.errors;

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
// Verdien er webbens banner for samme årsak.
const BLOCK_REASON_MAP = {
  admin_account: 'adminBanner',
  active_engagements: 'blockedBanner',
  sole_club_owner: 'soleClubOwnerBanner',
} as const satisfies Record<DeleteBlockReason, WebKey>;

const BLOCK_REASONS = Object.keys(BLOCK_REASON_MAP) as readonly DeleteBlockReason[];

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
// Verdien er webbens feilnøkkel for samme utfall, eller `null` der webben ikke
// har noen (nett, manglende server-adresse og status-oppslaget er app-egne).
const FAILURE_MAP = {
  offline: null,
  'no-web-base-url': null,
  network: null,
  unauthorized: null,
  admin_account: 'admin_account',
  active_engagements: 'active_games',
  sole_club_owner: 'sole_club_owner',
  status_failed: null,
  delete_failed: 'delete_failed',
} as const satisfies Record<AccountDeleteFailure, WebErrorKey | null>;

const FAILURES = Object.keys(FAILURE_MAP) as readonly AccountDeleteFailure[];

const MIRRORED_FAILURES = Object.entries(FAILURE_MAP).filter(
  (entry): entry is [AccountDeleteFailure, WebErrorKey] => entry[1] !== null,
);

/** Webbens strenger som står tegn for tegn i `ACCOUNT_TEXT`: [web-nøkkel, appens tekst]. */
const TEXT_ROWS: [WebKey, string][] = [
  ['kicker', ACCOUNT_TEXT.heading],
  // #1906: appen skrev «Tilbake» så lenge det ikke fantes noe profil-rom å
  // gå tilbake til. Rommet finnes nå, `goBack()` lander i det, og strengen er
  // webbens igjen — låst her så avviket ikke sniker seg inn på nytt.
  ['backLabel', ACCOUNT_TEXT.backLabel],
  ['deletedHeading', ACCOUNT_TEXT.deletedHeading],
  ['keptHeading', ACCOUNT_TEXT.keptHeading],
  ['keptBullet', ACCOUNT_TEXT.keptBullet],
  ['deleteButton', ACCOUNT_TEXT.deleteButton],
  ['deletePending', ACCOUNT_TEXT.deletePending],
  ['cancelButton', ACCOUNT_TEXT.cancelButton],
];

/**
 * Kulepunktene utledes fra webben, ikke fra en fast liste (#1912): får webben
 * `bullet5`, får testen en rad for den — og den raden er rød til appen har
 * fem kulepunkter.
 */
const WEB_BULLET_KEYS = Object.keys(web)
  .filter((key) => /^bullet\d+$/.test(key))
  .sort((a, b) => Number(a.slice('bullet'.length)) - Number(b.slice('bullet'.length)));

/** Strenger under `profile.deleteAccount` appen med vilje IKKE viser. */
const WEB_ONLY: Partial<Record<WebKey, string>> = {
  // Lenka tilbake til `/profile` på webbens sperre-visning. I appen er sperren
  // et banner på samme skjerm, og veien tilbake er `backLabel`.
  blockedBackLink: 'webbens egen lenke fra sperre-visningen; appen har tilbake-knappen',
};

/** Ingen halvferdig interpolering skal nå fram til skjermen. */
function isFinishedSentence(text: string): boolean {
  return text.trim().length > 0 && !/[{}]/.test(text);
}

describe('describeDeleteBlock', () => {
  it.each(BLOCK_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeDeleteBlock(reason))).toBe(true);
  });

  it.each(Object.entries(BLOCK_REASON_MAP) as [DeleteBlockReason, WebKey][])(
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

  it.each(MIRRORED_FAILURES)(
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
  it.each(TEXT_ROWS)('«%s» er webbens streng tegn for tegn', (webKey, appText) => {
    expect(appText).toBe(web[webKey]);
  });

  it('har like mange kulepunkter som webben', () => {
    expect(ACCOUNT_TEXT.deletedBullets).toHaveLength(WEB_BULLET_KEYS.length);
  });

  it.each(WEB_BULLET_KEYS.map((key, index) => [key, index + 1] as const))(
    '«%s» er kulepunkt nr. %i i appen, tegn for tegn',
    (webKey, position) => {
      expect(ACCOUNT_TEXT.deletedBullets[position - 1]).toBe(web[webKey as WebKey]);
    },
  );

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

describe('regnskapet mot webben (#1904)', () => {
  it('hver streng under profile.deleteAccount er speilet eller står på WEB_ONLY', () => {
    const accounted = new Set<string>([
      ...TEXT_ROWS.map(([webKey]) => webKey),
      ...WEB_BULLET_KEYS,
      // Dekket av sammensettings-testen over.
      'confirmParagraph',
      ...Object.values(BLOCK_REASON_MAP),
      ...Object.keys(WEB_ONLY),
    ]);
    const webStrings = Object.keys(web)
      .filter((key) => typeof web[key as keyof typeof web] === 'string')
      .sort();
    expect(webStrings).toEqual([...accounted].sort());
  });

  it('hver feilnøkkel under profile.deleteAccount.errors har en kode som viser den', () => {
    const mirrored = [...new Set(MIRRORED_FAILURES.map(([, webKey]) => webKey))];
    expect(Object.keys(webErrors).sort()).toEqual(mirrored.sort());
  });
});
