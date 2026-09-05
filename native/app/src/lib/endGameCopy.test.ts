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
import {
  approveConfirmBody,
  CUP_LINK_LABEL,
  CUP_NOTE,
  cupWebPath,
  describeEndRoundFailure,
  describeReminderFailure,
  describeReminderPreviewFailure,
  END_GAME_TEXT,
  lastRemindedNote,
  ownRowHint,
  remindLabel,
  slotLabel,
  stillPlayingNote,
} from './endGameCopy';
import { describeRosterFailure } from './rosterCopy';
import { WEB_LINK_TEXT } from './webLink';

const REASONS: EndRoundFailure[] = [
  'no-session',
  'offline',
  'not-found',
  'cup-game',
  'not-active',
  'no-players',
  'not-all-submitted',
  'not-all-approved',
  'withdrawal-unsupported',
  'withdraw-after-submit',
  'withdraw-after-submit-partial',
  'db-withdraw',
  'db-winners',
  'rls-denied',
  'no-rows',
  'db',
];

/** Ingen halvferdig interpolering skal nå fram til skjermen. */
function isFinishedSentence(text: string): boolean {
  return text.trim().length > 0 && !/[{}]/.test(text);
}

describe('describeEndRoundFailure', () => {
  it.each(REASONS)('gir en ferdig setning for «%s»', (reason) => {
    expect(isFinishedSentence(describeEndRoundFailure(reason))).toBe(true);
  });

  it('gir seksten FORSKJELLIGE setninger', () => {
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

  it('viser serverens egen melding ved en rå DB-feil, og en rolig linje uten', () => {
    expect(describeEndRoundFailure('db', [], 'connection reset')).toBe(
      'connection reset',
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
    expect(END_GAME_TEXT.unapprovedNote).toContain('på vegne av gruppa');
    expect(END_GAME_TEXT.unapprovedNote).not.toContain('nettsiden');
  });

  it('sier at avslutningen ikke kan angres fra appen', () => {
    expect(END_GAME_TEXT.confirmBody).toContain('nettsiden');
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
  it('peker til nettsiden BARE i formatene som har frafall', () => {
    // Knappen under lista var alt gatet på `plan.withdrawalSupported`
    // (`EndGame.tsx`), men teksten var det ikke: i matchplay, scramble-familien
    // og pott-formatene sto «det gjør du på nettsiden» over en side som bare
    // sender arrangøren tilbake igjen. Ordet «trekke» er med i sperren fordi
    // hele handlingen mangler i disse formatene — ikke bare veien til den.
    expect(ownRowHint(true)).toContain('nettsiden');
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

const REMINDER_REASONS: ReminderFailure[] = [
  'offline',
  'no-web-base-url',
  'unauthorized',
  'network',
  'forbidden',
  'not_found',
  'not_active',
  'remind_failed',
];

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
    expect(stillPlayingNote(2)).toBe(
      '2 av dem har ikke ført alle hullene ennå. Purring hjelper først da.',
    );
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
