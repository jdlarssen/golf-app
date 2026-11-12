// native/app/src/lib/terminlisteCopy.test.ts
// #2838: tekstene på terminlista i appen (Type A).
//
// To jobber:
//  1. **Paritetsport mot webben.** Alt som også står på /finn-turneringer hentes
//     fra `messages/no.json` og sammenlignes tegn for tegn. Porten er et
//     regnskap: hver nøkkel under `discover.termin` er speilet med en funksjon
//     eller en verdi i kartet under, og en ny nøkkel på webben faller på `tsc`
//     til noen har tatt stilling. `no.json` leses fra node-siden; testen bundles
//     aldri.
//  2. **Reglene for linjene.** Dagen, den lille linja under klokka, «Bane ·
//     Format · lag på N» og vennelinja følger nettsidens regler.
import source from '../../../../messages/no.json';
import {
  TERMIN_TEXT,
  courseFormatLine,
  dayHeading,
  dayLabelText,
  describeTerminlisteFailure,
  inDays,
  pendingTeamLine,
  requestLabel,
  rowA11yLabel,
  seatLineText,
  seatsFree,
  seatsLeft,
  signUpLabel,
  socialProofText,
  teamOf,
  timeNoteText,
} from './terminlisteCopy';
import { WEB_LINK_TEXT } from './webLink';

const web = source.discover;
const termin = web.termin;

// Kartet, ikke lista, er porten: en ny nøkkel under `discover.termin` uten rad her gir rød `tsc`.
const TERMIN_MAP = {
  subtitle: TERMIN_TEXT.subtitle,
  filterLabel: TERMIN_TEXT.filterLabel,
  filterAll: TERMIN_TEXT.filterAll,
  filterWeekend: TERMIN_TEXT.filterWeekend,
  filterClub: TERMIN_TEXT.filterClub,
  today: TERMIN_TEXT.today,
  tomorrow: TERMIN_TEXT.tomorrow,
  inDays: inDays(7).replace('7', '{days}'),
  undated: TERMIN_TEXT.undated,
  signUp: TERMIN_TEXT.signUp,
  signUpLabel: signUpLabel('{name}'),
  request: TERMIN_TEXT.request,
  requestLabel: requestLabel('{name}'),
  seatsFree: seatsFree(0, 0).replace('0 av 0', '{free} av {cap}'),
  // Flertallsmalen er ICU; funksjonen låses under mot begge grenene.
  seatsLeft: '{count, plural, one {# plass igjen} other {# plasser igjen}}',
  full: TERMIN_TEXT.full,
  nineHoles: TERMIN_TEXT.nineHoles,
  firstTee: TERMIN_TEXT.firstTee,
  shotgun: TERMIN_TEXT.shotgun,
  teamOf: teamOf(0).replace('0', '{size}'),
  createOwn: TERMIN_TEXT.createOwn,
  emptyWeekend: TERMIN_TEXT.emptyWeekend,
  emptyClub: TERMIN_TEXT.emptyClub,
  showAll: TERMIN_TEXT.showAll,
} as const satisfies Record<keyof typeof termin, string>;

describe('paritet mot messages/no.json', () => {
  it.each(Object.keys(TERMIN_MAP) as (keyof typeof TERMIN_MAP)[])('discover.termin.%s er speilet tegn for tegn', (key) => {
    expect(TERMIN_MAP[key]).toBe(termin[key]);
  });

  it('sidetittel, undertittel og tom-tilstand er nettsidens', () => {
    expect({
      kicker: TERMIN_TEXT.kicker,
      pageTitle: TERMIN_TEXT.pageTitle,
      myRequests: TERMIN_TEXT.myRequests,
      pendingApproval: TERMIN_TEXT.pendingApproval,
      courseNotSet: TERMIN_TEXT.courseNotSet,
      emptyBody: TERMIN_TEXT.emptyBody,
      emptyAction: TERMIN_TEXT.emptyAction,
    }).toEqual({
      kicker: web.kicker,
      pageTitle: web.pageTitle,
      myRequests: web.myRequests,
      pendingApproval: web.pendingApproval,
      courseNotSet: web.courseNotSet,
      emptyBody: web.emptyBody,
      emptyAction: web.emptyAction,
    });
  });

  it('forespørselen til et lag er nettsidens, for kaptein og medlem', () => {
    expect(pendingTeamLine('{teamName}', true)).toBe(web.pendingApprovalCaptain);
    expect(pendingTeamLine('{teamName}', false)).toBe(web.pendingApprovalMember);
  });

  it('vennelinja er nettsidens `socialProof`', () => {
    const proof = source.socialProof;
    expect(socialProofText({ joinedCount: 4, knownFriendNames: [], knownFriendOverflow: 0 })).toBe(
      proof.count.replace('{count}', '4'),
    );
    expect(socialProofText({ joinedCount: 1, knownFriendNames: ['Kari N.'], knownFriendOverflow: 0 })).toBe(
      proof.friendsOne.replace('{name}', 'Kari'),
    );
    expect(
      socialProofText({ joinedCount: 2, knownFriendNames: ['Kari N.', 'Per Å.'], knownFriendOverflow: 0 }),
    ).toBe(proof.friendsTwo.replace('{name1}', 'Kari').replace('{name2}', 'Per'));
    // Entall og flertall: «# annen» / «# andre».
    expect(socialProof(1)).toBe('Kari og 1 annen du kjenner er med');
    expect(socialProof(3)).toBe('Kari og 3 andre du kjenner er med');
    expect(proof.friendsOverflow).toBe(
      '{name} og {count, plural, one {# annen} other {# andre}} du kjenner er med',
    );
  });
});

function socialProof(overflow: number) {
  return socialProofText({ joinedCount: 9, knownFriendNames: ['Kari N.'], knownFriendOverflow: overflow });
}

describe('linjene', () => {
  it('seatsLeft følger flertallsmalen', () => {
    expect([seatsLeft(1), seatsLeft(2)]).toEqual(['1 plass igjen', '2 plasser igjen']);
  });

  it('dagetiketten: i dag, i morgen, om N dager, ingenting for en dag som er gått', () => {
    expect([
      dayLabelText({ kind: 'today' }),
      dayLabelText({ kind: 'tomorrow' }),
      dayLabelText({ kind: 'days', days: 2 }),
      dayLabelText(null),
    ]).toEqual(['i dag', 'i morgen', 'om 2 dager', null]);
  });

  it('den lille linja under klokka: 9 hull, shotgun, første start, ingenting', () => {
    expect(['nine_holes', 'shotgun', 'first_tee', null].map((note) => timeNoteText(note as never))).toEqual([
      '9 hull',
      'shotgun',
      'første start',
      null,
    ]);
  });

  it('«Bane · Format · lag på N»: lag på bare når laget er større enn én, «Bane ikke valgt» uten bane', () => {
    expect(courseFormatLine('Byneset North', 'Stableford', 1)).toBe('Byneset North · Stableford');
    expect(courseFormatLine('Byneset North', 'Best ball', 2)).toBe('Byneset North · Best ball · lag på 2');
    expect(courseFormatLine(null, 'Stableford', 1)).toBe('Bane ikke valgt · Stableford');
  });

  it('dagen over gruppen: «Lørdag 14. november», med året når det ikke er i år', () => {
    // Middag lokal tid, så dagen er den samme i alle tidssoner testen kjører i.
    const noon = new Date(2026, 10, 14, 12).toISOString();
    expect(dayHeading(noon, new Date(2026, 10, 12, 12))).toBe('Lørdag 14. november');
    expect(dayHeading(noon, new Date(2027, 0, 5, 12))).toBe('Lørdag 14. november 2026');
  });

  it('hver feilgrunn har en lesbar setning', () => {
    const reasons = ['offline', 'network', 'load_failed', 'unauthorized', 'no-web-base-url'] as const;
    const texts = reasons.map(describeTerminlisteFailure);
    expect(texts.every((text) => text.trim().length > 10 && !text.includes('{'))).toBe(true);
    expect(describeTerminlisteFailure('no-web-base-url')).toBe(WEB_LINK_TEXT.missingBaseUrl);
  });
});

describe('skjermleserens rad', () => {
  const base = { name: 'Lørdagsrunden', full: false, cta: 'direct' as const, clock: '09:20', note: 'første start', courseFormat: 'Byneset North · Stableford', third: '6 av 8 plasser ledige' };

  it('knappen først, så klokka, den lille linja, bane og format og plass-linja', () => {
    expect(rowA11yLabel(base)).toBe(
      'Meld meg på Lørdagsrunden. kl. 09:20. første start. Byneset North · Stableford. 6 av 8 plasser ledige',
    );
    expect(rowA11yLabel({ ...base, cta: 'request', note: null, third: null })).toBe(
      'Be om å bli med i Lørdagsrunden. kl. 09:20. Byneset North · Stableford',
    );
  });

  it('en runde uten tid sier «Dato ikke satt», og en full runde har «Fullt» foran og ingen plass-linje', () => {
    expect(rowA11yLabel({ ...base, clock: null, note: null, third: null })).toBe(
      'Meld meg på Lørdagsrunden. Dato ikke satt. Byneset North · Stableford',
    );
    expect(rowA11yLabel({ ...base, full: true, third: 'Fullt' })).toBe(
      'Lørdagsrunden. Fullt. kl. 09:20. første start. Byneset North · Stableford',
    );
  });

  it('plass-linja: ledige, få igjen og fullt', () => {
    expect([seatLineText({ cap: 8, held: 2 }), seatLineText({ cap: 8, held: 7 }), seatLineText({ cap: 8, held: 8 })]).toEqual([
      '6 av 8 plasser ledige',
      '1 plass igjen',
      'Fullt',
    ]);
  });
});
