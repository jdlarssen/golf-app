// native/app/src/lib/endGameCopy.test.ts
// Native N6c (#1856): copyen arrangøren møter når avslutningen ikke går gjennom.
//
// To jobber, som i `rosterCopy.test.ts`:
//
//  1. **Ingen kode uten setning.** `tsc` sikrer at switchen er uttømmende;
//     denne sikrer at det som kommer ut er lesbar tekst — ikke tom streng,
//     ikke en igjenglemt `{pos}`.
//  2. **Én årsak, én setning.** Femten grunner som alle sier «noe gikk galt»
//     er den feilen som kostet N6b tre feilsøkingsrunder. Testen krever at de
//     femten er forskjellige fra hverandre.
import source from '../../../../messages/no.json';
import type { EndRoundFailure } from '../data/endGame';
import type { ReminderFailure } from '../data/remind';
import { isFinishedSentence } from '../test/copy';
import {
  allDeliveredLine,
  approveConfirmBody,
  approveOnBehalfLabel,
  countHeading,
  CUP_LINK_LABEL,
  CUP_NOTE,
  cupWebPath,
  describeEndRoundFailure,
  describeReminderFailure,
  describeReminderPreviewFailure,
  END_GAME_TEXT,
  endGameKicker,
  lastRemindedNote,
  opensWhenNote,
  ownRowHint,
  progressLine,
  remindLabel,
  reminderNote,
  reopenNote,
  resultLine,
  slotLabel,
  slotRowLabel,
  titleSubtitle,
  unremindableNotes,
} from './endGameCopy';
import { describeRosterFailure } from './rosterCopy';
import { WEB_LINK_TEXT } from './webLink';

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
const REASON_MAP = {
  'no-session': true,
  offline: true,
  'not-found': true,
  'cup-game': true,
  'not-active': true,
  'no-players': true,
  'not-all-submitted': true,
  'not-all-approved': true,
  'withdrawal-unsupported': true,
  'withdraw-after-submit': true,
  'withdraw-after-submit-partial': true,
  'db-withdraw': true,
  'db-winners': true,
  'winner-withdrawn': true,
  'rls-denied': true,
  'no-rows': true,
  db: true,
} as const satisfies Record<EndRoundFailure, true>;

const REASONS = Object.keys(REASON_MAP) as readonly EndRoundFailure[];

describe('describeEndRoundFailure', () => {
  it.each(REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeEndRoundFailure(reason))).toBe(true);
  });

  it('gir én FORSKJELLIG setning per grunn', () => {
    const sentences = REASONS.map((reason) => describeEndRoundFailure(reason));
    expect(new Set(sentences).size).toBe(REASONS.length);
  });

  it.each([
    'not-all-submitted',
    'not-all-approved',
    'db-withdraw',
  ] as EndRoundFailure[])('navngir hvem det står på ved «%s»', (reason) => {
    const text = describeEndRoundFailure(reason, ['Kari', 'Ola', 'Per']);
    expect(text).toContain('Kari, Ola og Per');
    // Uten navn skal setningen fortsatt stå — `blockedUserIds` er valgfri.
    expect(isFinishedSentence(describeEndRoundFailure(reason))).toBe(true);
  });

  it('bruker webbens ordlyd der webben har en', () => {
    // Paritetsport: rettes en av strengene på web uten at appen følger etter,
    // blir denne rød. Ellers får arrangøren to ulike forklaringer på samme
    // regel, avhengig av hvilken flate hen står på.
    expect(describeEndRoundFailure('db-winners')).toBe(
      source.admin.game.sideWinners.dbError,
    );
    expect(describeEndRoundFailure('winner-withdrawn')).toBe(
      source.admin.game.sideWinners.winnerWithdrawnError,
    );
    expect(END_GAME_TEXT.noQualified).toBe(
      source.admin.game.sideWinners.noQualified,
    );
    expect(END_GAME_TEXT.withdrawLabel).toBe(source.game.finish.withdrawLabel);
    expect(END_GAME_TEXT.submitBusy).toBe(source.game.finish.finishPending);
  });

  it('bøyer kortet etter hvor mange som rakk å levere', () => {
    // Flertallsformen er ikke pynt: «Even og Kari leverte kortet sitt» leses som
    // ETT kort, og arrangøren leter etter feil antall rader i listen.
    const one = describeEndRoundFailure('withdraw-after-submit', ['Even']);
    const two = describeEndRoundFailure('withdraw-after-submit', [
      'Even',
      'Kari',
    ]);
    expect(one).toContain('Even leverte kortet sitt');
    expect(two).toContain('Even og Kari leverte kortene sine');
    // Begge må si at avkryssingen IKKE ble utført halvveis — ellers leter
    // arrangøren etter en trukket spiller som ikke finnes.
    for (const text of [one, two]) {
      expect(text).toContain('ingen ble trukket');
    }
  });

  it('sier IKKE «ingen ble trukket» når noen alt er trukket (#1896)', () => {
    // Det delvise utfallet: vakta på selve skrivet slo til etter at de første
    // i bunken var trukket. Da er «ingen ble trukket» en løgn som sender
    // arrangøren på leting etter feil rader.
    const text = describeEndRoundFailure('withdraw-after-submit-partial', ['Even']);
    expect(text).toContain('Even leverte kortet sitt');
    expect(text).toContain('alt trukket');
    expect(text).not.toContain('ingen ble trukket');
  });

  it('sier samme nett-linje som roster-skrivingene', () => {
    expect(describeEndRoundFailure('offline')).toBe(
      describeRosterFailure('offline'),
    );
  });

  it('viser aldri serverens tekst ved en rå DB-feil (#2228)', () => {
    // Den brede signaturen etterligner et kallsted som prøver å sende rå tekst
    // inn igjen. Den logges der den oppstår, og vises aldri.
    const wide = describeEndRoundFailure as (
      r: EndRoundFailure,
      n?: readonly string[],
      m?: string,
    ) => string;
    expect(wide('db', [], 'TypeError: Network request failed')).toBe(
      'Noe gikk galt mot serveren.',
    );
    expect(describeEndRoundFailure('db')).toBe('Noe gikk galt mot serveren.');
  });

  it('peker cup-avslaget til nettsiden — det finnes ingen vei i appen', () => {
    expect(describeEndRoundFailure('cup-game')).toBe(CUP_NOTE);
    expect(CUP_NOTE).toContain('nettsiden');
  });
});

describe('slotLabel', () => {
  it('nummererer HULLET, ikke plasseringen', () => {
    // `position` er hvilken LD-/CTP-slot raden gjelder. Leses den som «1.
    // plass», blir sideturneringens poeng feil: hver slot gir 2p til én
    // spiller, og samme spiller kan ta begge.
    expect(
      slotLabel({ key: 'ld-2', category: 'longest_drive', position: 2 }),
    ).toBe('Lengste drive #2');
    expect(
      slotLabel({ key: 'ctp-1', category: 'closest_to_pin', position: 1 }),
    ).toBe('Nærmest pinnen #1');
  });
});

describe('END_GAME_TEXT', () => {
  it('har ferdige setninger overalt', () => {
    for (const [key, value] of Object.entries(END_GAME_TEXT)) {
      expect([key, isFinishedSentence(value)]).toEqual([key, true]);
    }
  });

  it('sier hvor godkjenningen kan overstyres, i stedet for å stoppe i en blindvei', () => {
    // Guardrailen er «ærlig feil»: gaten kan ikke passeres i appen, så teksten
    // MÅ si hvem som løser den og hvor. Fram til #1891 var «hvor» nettsiden,
    // fordi appen ikke hadde overstyringen. Nå har den den — og da er en
    // henvisning videre en beskrivelse av en app som ikke finnes lenger.
    expect(END_GAME_TEXT.unapprovedNote).toContain('medspiller');
    expect(END_GAME_TEXT.unapprovedNote).toContain('godkjenn det selv her');
    expect(END_GAME_TEXT.unapprovedNote).not.toContain('nettsiden');
  });

  it('sier hvem som kan åpne runden igjen — bare admin kan (#2578)', () => {
    // `reopenGame` krever admin på nettsiden. Den gamle setningen lovet alle
    // arrangører at de kunne åpne runden igjen derfra.
    expect(reopenNote(true)).toBe('Du kan åpne den igjen fra nettsiden.');
    expect(reopenNote(false)).toBe('Bare en administrator kan åpne runden igjen.');
  });

  it('holder trukket og «uten kort» fra hverandre — de svarer motsatt', () => {
    // Eieren leste den forrige versjonen og skjønte den ikke, med god grunn:
    // introen lovet at slagene «teller fortsatt» over BEGGE radtypene, mens
    // hinten rett under sa at trukne ikke teller. Introen tok feil — en
    // trukket spiller er ute av både spiller- og score-settet i
    // `buildModeResultForGame` (:308-334). Testen låser todelingen, ikke
    // ordlyden: introen skal ikke uttale seg om slagene i det hele tatt.
    expect(END_GAME_TEXT.missingIntro).not.toContain('teller');
    expect(END_GAME_TEXT.withdrawHint).toContain('teller ikke i rangeringen');
    expect(END_GAME_TEXT.noCardHint).toContain('teller fortsatt');
  });
});

describe('ownRowHint', () => {
  it('peker til knappen BARE i formatene som har frafall', () => {
    // Knappen under lista er gatet på `plan.withdrawalSupported`
    // (`EndGame.tsx`), og fram til #1934 var teksten ikke det: i matchplay,
    // scramble-familien og pott-formatene lovet den en vei ut som ikke fantes.
    // Ordet «trekke» er med i sperren fordi hele handlingen mangler i disse
    // formatene — ikke bare veien til den.
    //
    // #1917: veien er ikke lenger nettsiden, den er knappen rett under. Sperren
    // står så teksten ikke kan falle tilbake til henvisningen.
    expect(ownRowHint(true)).toContain('knappen under');
    expect(ownRowHint(true)).not.toContain('nettsiden');
    expect(ownRowHint(false)).not.toContain('nettsiden');
    expect(ownRowHint(false)).not.toContain('trekke');
  });

  it('gir en ferdig setning begge veier', () => {
    // Dekningen END_GAME_TEXT-løkka hadde før hinten ble en funksjon.
    expect(isFinishedSentence(ownRowHint(true))).toBe(true);
    expect(isFinishedSentence(ownRowHint(false))).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Purring (#1889) og lenke-etikettene (#1891)
// -----------------------------------------------------------------------------

// Kartet, ikke lista, er porten: en ny kode i unionen uten rad her gir rød `tsc`.
const REMINDER_REASON_MAP = {
  offline: true,
  'no-web-base-url': true,
  unauthorized: true,
  network: true,
  forbidden: true,
  not_found: true,
  not_active: true,
  remind_failed: true,
} as const satisfies Record<ReminderFailure, true>;

const REMINDER_REASONS = Object.keys(REMINDER_REASON_MAP) as readonly ReminderFailure[];

describe('describeReminderFailure', () => {
  it.each(REMINDER_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeReminderFailure(reason))).toBe(true);
  });

  it('skiller de fire årsakene arrangøren kan gjøre noe med', () => {
    // Fire ulike neste-steg: koble til, logg inn, innse at runden er lukket,
    // ta kontakt. Faller to av dem sammen, mister arrangøren rådet.
    expect(describeReminderFailure('offline')).toBe('Purring krever nett.');
    expect(describeReminderFailure('unauthorized')).toBe(
      'Logg inn på nytt og prøv igjen.',
    );
    expect(describeReminderFailure('not_active')).toBe(END_GAME_TEXT.notActive);
    // Delt med lenke-knappene: samme mangel i bygget stopper begge, og
    // meldingen skal derfor ikke nevne én av dem.
    expect(describeReminderFailure('no-web-base-url')).toBe(
      WEB_LINK_TEXT.missingBaseUrl,
    );
  });

  it('samler resten i ett råd — de har alle samme neste steg', () => {
    const rest = (['network', 'forbidden', 'not_found', 'remind_failed'] as const).map(
      describeReminderFailure,
    );
    expect(new Set(rest).size).toBe(1);
    expect(rest[0]).toBe('Fikk ikke purret. Prøv igjen.');
  });
});

describe('describeReminderPreviewFailure', () => {
  it.each(REMINDER_REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeReminderPreviewFailure(reason))).toBe(true);
  });

  it('sier ikke at en purring feilet når ingen purring ble forsøkt', () => {
    // GET-en er forhåndssjekken. «Fikk ikke purret» ville sendt arrangøren på
    // leting etter en purring som aldri ble sendt.
    expect(describeReminderPreviewFailure('remind_failed')).toBe(
      'Fikk ikke sjekket hvem som kan purres. Prøv igjen.',
    );
    expect(describeReminderPreviewFailure('remind_failed')).not.toBe(
      describeReminderFailure('remind_failed'),
    );
  });

  it('gjenbruker setningen der årsaken betyr det samme for begge kallene', () => {
    for (const reason of ['offline', 'no-web-base-url', 'unauthorized', 'not_active'] as const) {
      expect(describeReminderPreviewFailure(reason)).toBe(
        describeReminderFailure(reason),
      );
    }
  });
});

describe('purre-malene', () => {
  it('setter inn tallene og lar ingen `{}` slippe gjennom', () => {
    expect(remindLabel(3)).toBe('Purr på dem som mangler (3)');
    // #1933: én setning per grunn, bare de som gjelder, entall for én gjest.
    expect(unremindableNotes({ unfinished: 2, guests: 1, splitDay: 3 })).toEqual([
      '2 av dem har ikke ført alle hullene ennå. Purring hjelper først da.',
      '1 av dem er gjest. Den som fører kortet, leverer det.',
      '3 av dem leverer hele runden på Bak 9 og blir purret der.',
    ]);
    expect(unremindableNotes({ unfinished: 0, guests: 2, splitDay: 0 })).toEqual([
      '2 av dem er gjester. Den som fører kortene, leverer dem.',
    ]);
    expect(unremindableNotes({ unfinished: 0, guests: 0, splitDay: 0 })).toEqual([]);
    expect(lastRemindedNote('14:05')).toBe('Sist purret kl. 14:05');
    expect(approveConfirmBody('Kari')).toBe(
      'Godkjenn kortet til Kari? Du står som den som godkjente.',
    );
  });
});

describe('cup-lenka', () => {
  it('peker på cupens forside, med id-en kodet', () => {
    expect(cupWebPath('cup-1')).toBe('/cup/cup-1');
    // En sti bygget av data kodes DER den bygges — ikke der noen senere antar
    // at den var trygg.
    expect(cupWebPath('a/b')).toBe('/cup/a%2Fb');
    expect(isFinishedSentence(CUP_LINK_LABEL)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// #2578: tekstene fra tegningene
// -----------------------------------------------------------------------------

describe('progressLine', () => {
  it('utelater deler som er null (beslutning 3)', () => {
    expect(
      progressLine({ total: 8, delivered: 6, approved: 5, waiting: 1, missing: 2 }, true),
    ).toBe('5 godkjent · 1 venter på godkjenning · 2 mangler kort');
    expect(
      progressLine({ total: 8, delivered: 8, approved: 7, waiting: 1, missing: 0 }, true),
    ).toBe('7 godkjent · 1 venter på godkjenning');
    expect(
      progressLine({ total: 3, delivered: 1, approved: 0, waiting: 1, missing: 2 }, true),
    ).toBe('1 venter på godkjenning · 2 mangler kort');
  });

  it('sier bare hvor mange som mangler kort når runden ikke krever godkjenning', () => {
    expect(
      progressLine({ total: 8, delivered: 6, approved: 6, waiting: 0, missing: 2 }, false),
    ).toBe('2 mangler kort');
  });
});

describe('opensWhenNote', () => {
  it('sier ordrett det tegningen sier', () => {
    expect(
      opensWhenNote({ unapproved: ['Jonas Berg'], unacknowledged: ['Sigrid Aas'], winnersOpen: true }, 2),
    ).toBe('Åpner når Jonas Berg er godkjent, Sigrid Aas er huket av og vinnerne er kåret.');
  });

  it('tar med bare det som gjenstår', () => {
    expect(opensWhenNote({ unapproved: ['Jonas Berg'], unacknowledged: [], winnersOpen: false }, 0)).toBe(
      'Åpner når Jonas Berg er godkjent.',
    );
    expect(
      opensWhenNote({ unapproved: [], unacknowledged: ['Sigrid Aas', 'Tore Lunde'], winnersOpen: true }, 2),
    ).toBe('Åpner når Sigrid Aas og Tore Lunde er huket av og vinnerne er kåret.');
  });

  it('skriver opptil tre navn, og et tall fra fire (beslutning 4)', () => {
    expect(
      opensWhenNote({ unapproved: ['Ola', 'Kari', 'Per'], unacknowledged: [], winnersOpen: false }, 0),
    ).toBe('Åpner når Ola, Kari og Per er godkjent.');
    expect(
      opensWhenNote({ unapproved: ['Ola', 'Kari', 'Per', 'Pål'], unacknowledged: [], winnersOpen: false }, 0),
    ).toBe('Åpner når 4 spillere er godkjent.');
    expect(
      opensWhenNote(
        { unapproved: [], unacknowledged: Array.from({ length: 12 }, (_, i) => `S${i}`), winnersOpen: true },
        2,
      ),
    ).toBe('Åpner når 12 spillere er huket av og vinnerne er kåret.');
  });

  it('sier «vinneren» når runden har én slot (beslutning 5)', () => {
    expect(opensWhenNote({ unapproved: [], unacknowledged: [], winnersOpen: true }, 1)).toBe(
      'Åpner når vinneren er kåret.',
    );
    expect(opensWhenNote({ unapproved: [], unacknowledged: [], winnersOpen: true }, 3)).toBe(
      'Åpner når vinnerne er kåret.',
    );
  });
});

describe('resultLine', () => {
  it('sier hvor mange som står i resultatet, og om alle har levert (beslutning 6)', () => {
    expect(resultLine(8, 8)).toBe('8 spillere, alle har levert');
    expect(resultLine(1, 1)).toBe('1 spiller, alle har levert');
    expect(resultLine(7, 6)).toBe('7 spillere, 6 har levert');
  });
});

describe('reminderNote', () => {
  it('slår sammen notatene og «Sist purret kl. …» med punktum til slutt', () => {
    const notes = unremindableNotes({ unfinished: 1, guests: 0, splitDay: 0 });
    expect(reminderNote(notes, '14:05')).toEqual([
      '1 av dem har ikke ført alle hullene ennå. Purring hjelper først da.',
      'Sist purret kl. 14:05.',
    ]);
    expect(reminderNote(notes, null)).toEqual(notes);
    expect(reminderNote([], '14:05')).toEqual(['Sist purret kl. 14:05.']);
    expect(reminderNote([], null)).toEqual([]);
  });
});

describe('tilgjengelighets-etikettene', () => {
  it('navngir kortet godkjenn-knappen gjelder', () => {
    expect(approveOnBehalfLabel('Jonas Berg')).toBe(
      'Godkjenn kortet til Jonas Berg på vegne av gruppa',
    );
  });

  it('leser slot-raden med vinneren, eller ber om et valg', () => {
    const slot = { key: 'ctp-1', category: 'closest_to_pin', position: 1 } as const;
    expect(slotRowLabel(slot, 'Kristian Holm')).toBe(
      'Nærmest pinnen #1: Kristian Holm. Endre vinner',
    );
    expect(slotRowLabel(slot, null)).toBe('Nærmest pinnen #1. Velg vinner');
  });
});

describe('toppen og tittelen', () => {
  it('setter spillnavnet foran det som står etter', () => {
    expect(endGameKicker('Lørdagsrunden', END_GAME_TEXT.kickerActive)).toBe(
      'Lørdagsrunden · I gang',
    );
    expect(endGameKicker('Lørdagsrunden', null)).toBe('Lørdagsrunden');
  });

  it('teller spillerne under tittelen, med banen foran når den finnes', () => {
    expect(titleSubtitle('Byneset North', 8)).toBe('Byneset North · 8 spillere');
    expect(titleSubtitle(null, 1)).toBe('1 spiller');
  });

  it('teller i seksjonsoverskriftene og i det sterke kortet', () => {
    expect(countHeading(END_GAME_TEXT.unapprovedHeading, 1)).toBe('Venter på godkjenning · 1');
    expect(allDeliveredLine(8)).toBe('8 av 8 kort er levert');
  });
});
