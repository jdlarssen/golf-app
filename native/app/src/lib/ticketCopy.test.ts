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
  approveButton,
  fieldA11y,
  flightOf,
  playedLine,
  rosterA11y,
  rulesHeading,
  teePart,
} from './ticketCopy';

const home = source.game.home;

describe('paritet mot messages/no.json', () => {
  it('knappene og utkast-teksten er webbens', () => {
    expect(TICKET_TEXT.viewOnMap).toBe(home.viewOnMap);
    expect(TICKET_TEXT.startRound).toBe(home.ctaStartRound);
    expect(TICKET_TEXT.reviewAndSubmit).toBe(home.ctaReviewAndSubmit);
    expect(TICKET_TEXT.draft).toBe(home.draftBanner);
    expect(teePart('Gul')).toBe(home.teeInfo.replace('{teeName}', 'Gul'));
  });

  it('feltetikettene er webbens ord', () => {
    expect(TICKET_TEXT.flight).toBe(home.flightValueLabel);
    expect(TICKET_TEXT.team).toBe(home.teamLabel);
    expect(TICKET_TEXT.side).toBe(home.sideLabel);
  });

  it('«Du er påmeldt» er webbens merke i setningsform', () => {
    expect(TICKET_TEXT.registered.toUpperCase()).toBe(home.registered);
  });
});

describe('formene', () => {
  it('tall og etiketter blir hele setninger', () => {
    expect(playedLine(7, 18)).toBe('Du har spilt 7 av 18 hull');
    expect(flightOf(2, 3)).toBe('2 av 3');
    // Hardt mellomrom: «85» og «%» skal aldri brytes fra hverandre.
    expect(allowancePart(85)).toBe('85\u00A0% handicap');
    expect(fieldA11y('Dine slag', '15')).toBe('Dine slag: 15');
    expect(rosterA11y(true, 'Du og Marte')).toBe('Flighten din: Du og Marte');
    expect(rosterA11y(false, 'Du og Marte')).toBe('Med i runden: Du og Marte');
    expect(rulesHeading('Stableford')).toBe('Regler: Stableford');
    expect(approveButton(2)).toBe('Godkjenn (2)');
  });

  it('ingen tekst står tom eller med en plassholder ingen fylte inn', () => {
    for (const text of Object.values(TICKET_TEXT)) {
      expect(isFinishedSentence(text)).toBe(true);
    }
  });
});
