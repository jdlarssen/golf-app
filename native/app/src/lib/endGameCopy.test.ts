// native/app/src/lib/endGameCopy.test.ts
// Native N6c (#1856): copyen arrangøren møter når avslutningen ikke går gjennom.
//
// To jobber, som i `rosterCopy.test.ts`:
//
//  1. **Ingen kode uten setning.** `tsc` sikrer at switchen er uttømmende;
//     denne sikrer at det som kommer ut er lesbar tekst — ikke tom streng,
//     ikke en igjenglemt `{pos}`.
//  2. **Én årsak, én setning.** Fjorten grunner som alle sier «noe gikk galt»
//     er den feilen som kostet N6b tre feilsøkingsrunder. Testen krever at de
//     fjorten er forskjellige fra hverandre.
import source from '../../../../messages/no.json';
import type { EndRoundFailure } from '../data/endGame';
import {
  CUP_NOTE,
  END_GAME_TEXT,
  describeEndRoundFailure,
  slotLabel,
} from './endGameCopy';
import { describeRosterFailure } from './rosterCopy';

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

  it('gir fjorten FORSKJELLIGE setninger', () => {
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
    // MÅ si hvem som løser den og hvor.
    expect(END_GAME_TEXT.unapprovedNote).toContain('medspiller');
    expect(END_GAME_TEXT.unapprovedNote).toContain('nettsiden');
  });

  it('sier at avslutningen ikke kan angres fra appen', () => {
    expect(END_GAME_TEXT.confirmBody).toContain('nettsiden');
  });
});
