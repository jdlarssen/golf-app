// #2255: teksten på startbilletten.
//
// Samme to jobber som `homeCopy.test.ts`:
//  1. **Paritetsport mot webben.** Det som også står på nettsidens spillside,
//     hentes fra `messages/no.json` og sammenlignes tegn for tegn.
//  2. **Ingen tekst uten setning**, og riktige former for tall.
import source from '../../../../messages/no.json';
import { isFinishedSentence } from '../test/copy';
import {
  TICKET_TEXT,
  allowancePart,
  maxStrokesPart,
  approveButton,
  ownTeeOffLine,
  fieldA11y,
  flightOf,
  playedLine,
  rosterA11y,
  rulesHeading,
  stubTotal,
  teePart,
} from './ticketCopy';

const home = source.game.home;

describe('paritet mot messages/no.json', () => {
  it('knappene og utkast-teksten er webbens', () => {
    expect(TICKET_TEXT.viewOnMap).toBe(home.viewOnMap);
    expect(TICKET_TEXT.addToCalendar).toBe(home.addToCalendar);
    expect(TICKET_TEXT.shareText).toBe(source.spectate.shareText);
    expect(TICKET_TEXT.startRound).toBe(home.ctaStartRound);
    expect(TICKET_TEXT.reviewAndSubmit).toBe(home.ctaReviewAndSubmit);
    expect(TICKET_TEXT.draft).toBe(home.draftBanner);
  });

  it('teen står som på designlerretet, «Gul tee», ikke som webbens «Tee: Gul»', () => {
    expect(teePart('Gul')).toBe('Gul tee');
    expect(home.teeInfo.replace('{teeName}', 'Gul')).not.toBe(teePart('Gul'));
  });

  it('feltetikettene er webbens ord', () => {
    expect(TICKET_TEXT.flight).toBe(home.flightValueLabel);
    expect(TICKET_TEXT.team).toBe(home.teamLabel);
    expect(TICKET_TEXT.side).toBe(home.sideLabel);
  });

  it('«Du er påmeldt» er webbens merke', () => {
    expect(TICKET_TEXT.registered).toBe(home.registered);
  });
});

describe('formene', () => {
  it('tall og etiketter blir hele setninger', () => {
    expect(playedLine(7, 18)).toBe('Du har spilt 7 av 18 hull');
    expect(flightOf(2, 3)).toBe('2 av 3');
    // Hardt mellomrom: «85» og «%» skal aldri brytes fra hverandre.
    expect(allowancePart(85)).toBe('85\u00A0% handicap');
    // #2660: a league's cap on the strokes, after the percentage.
    expect(maxStrokesPart(32)).toBe('maks 32 slag');
    expect(fieldA11y('Dine slag', '15')).toBe('Dine slag: 15');
    expect(rosterA11y(true, 'Du og Marte')).toBe('Flighten din: Du og Marte');
    expect(rosterA11y(false, 'Du og Marte')).toBe('Med i runden: Du og Marte');
    expect(rulesHeading('Stableford')).toBe('Regler: Stableford');
    expect(approveButton(2)).toBe('Godkjenn (2)');
    // «15 p» til høyre for fremdriften: tavlas tall, med enheten helten bruker.
    expect(stubTotal(15, 'points')).toBe('15\u00A0p');
    expect(stubTotal(72, 'net')).toBe('72\u00A0netto');
    expect(stubTotal(3, 'toPar')).toBe('+3');
    expect(stubTotal(0, 'toPar')).toBe('E');
  });

  it('ingen tekst står tom eller med en plassholder ingen fylte inn', () => {
    for (const text of Object.values(TICKET_TEXT)) {
      expect(isFinishedSentence(text)).toBe(true);
    }
  });
});

// #2451: linja er webbens `game.waitingRoom.ownTeeOff*`, uten fet skrift.
describe('ownTeeOffLine — paritet mot messages/no.json (#2451)', () => {
  const room = source.game.waitingRoom;
  const web = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce(
      (text, [key, value]) => text.replace(`{${key}}`, String(value)),
      template.replace(/<\/?b>/g, ''),
    );

  it('flight, lag og uten begge er webbens setninger', () => {
    expect(ownTeeOffLine({ clock: '09:10', flight: 2, team: null })).toBe(
      web(room.ownTeeOffFlight, { time: '09:10', flight: 2 }),
    );
    expect(ownTeeOffLine({ clock: '09:10', flight: null, team: 3 })).toBe(
      web(room.ownTeeOffTeam, { time: '09:10', team: 3 }),
    );
    expect(ownTeeOffLine({ clock: '09:10', flight: null, team: null })).toBe(web(room.ownTeeOff, { time: '09:10' }));
  });
});

