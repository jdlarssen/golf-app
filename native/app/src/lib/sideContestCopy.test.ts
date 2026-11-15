// #2283: tekstene på raden og i arket, ordrett fra tegningene (Type A).
import type { HoleContest } from '../../../../lib/games/sideContest';
import {
  contestPointsLine,
  contestTitle,
  describeSideClaimFailure,
  formatDistance,
  girAnswer,
  girQuestion,
  girStatus,
  noneLabel,
  sheetKicker,
  sideAnswer,
  sideQuestion,
  sideStatus,
  stepDistance,
} from './sideContestCopy';
import * as sharedSideContest from '../../../../lib/games/sideContest';

const gameCtp = { category: 'closest_to_pin', source: 'game' } as const;
const gameLd = { category: 'longest_drive', source: 'game' } as const;
const cupCtp = { category: 'closest_to_pin', source: 'cup', points: 2 } as const;
const cupGir: HoleContest = { category: 'gir', source: 'cup', points: 1.5, maxPerTeam: 2 };

describe('raden', () => {
  it('har tittel og undertekst som i tegningen', () => {
    expect(contestTitle('closest_to_pin')).toBe('Nærmest pinnen');
    expect(contestTitle('longest_drive')).toBe('Lengste drive');
    expect(contestTitle('gir')).toBe('GIR');
    expect(contestPointsLine(gameCtp)).toBe('Sidekonkurranse');
    expect(contestPointsLine(cupCtp)).toBe('+2 p til laget');
    expect(contestPointsLine(cupGir)).toBe('+1,5 p per GIR');
  });

  it('viser svaret: navn og avstand, bare navn, eller ingen', () => {
    expect(sideAnswer('closest_to_pin', 'Marte', 2.5)).toBe('Marte · 2,5 m');
    expect(sideAnswer('closest_to_pin', 'Hans', 11.5)).toBe('Hans · 11,5 m');
    expect(sideAnswer('longest_drive', 'Deg', null)).toBe('Deg');
    expect(sideAnswer('closest_to_pin', null, null)).toBe('Ingen på green');
    expect(sideAnswer('longest_drive', null, null)).toBe('Ingen på fairway');
  });

  it('teller GIR, og sier fra når alle bommet', () => {
    expect(girAnswer(2, 4, false)).toBe('2 av 4 traff');
    expect(girAnswer(1, 2, false)).toBe('1 av 2 traff');
    expect(girAnswer(0, 4, false)).toBe('0 av 4 traff');
    expect(girAnswer(0, 4, true)).toBe('Ingen traff greenen');
  });
});

describe('arket', () => {
  it('kickeren har hullet, og i cup poengene', () => {
    expect(sheetKicker(gameCtp, 7)).toBe('Sidekonkurranse · hull 7');
    expect(sheetKicker(cupCtp, 3)).toBe('Sidepoeng · hull 3 · +2 p til laget');
    expect(sheetKicker(cupGir, 5)).toBe('Sidepoeng · hull 5 · +1,5 p per GIR');
  });

  it('spør flighten i et vanlig spill og kampen i cup', () => {
    expect(sideQuestion(gameCtp)).toBe('Hvem i flighten lå nærmest på green etter utslaget?');
    expect(sideQuestion(gameLd)).toBe('Hvem i flighten slo lengst ut på fairway?');
    expect(sideQuestion(cupCtp)).toBe('Hvem i kampen lå nærmest på green etter utslaget?');
  });

  it('GIR-spørsmålet følger par', () => {
    expect(girQuestion(3)).toBe('Hvem var på greenen etter utslaget? Trykk på alle som traff.');
    expect(girQuestion(4)).toBe('Hvem var på greenen på to slag? Trykk på alle som traff.');
    expect(girQuestion(5)).toBe('Hvem var på greenen på tre slag? Trykk på alle som traff.');
  });

  it('siste linje sier ingen for hver kategori', () => {
    expect(noneLabel('closest_to_pin')).toBe('Ingen på green');
    expect(noneLabel('longest_drive')).toBe('Ingen på fairway');
    expect(noneLabel('gir')).toBe('Ingen traff greenen');
  });

  it('statusen før og etter lagring, og uten nett', () => {
    expect(sideStatus(gameCtp, null, false)).toBe(
      'Svaret deles med hele flighten. Arrangøren kårer vinneren til slutt.',
    );
    expect(sideStatus(cupCtp, null, false)).toBe('Svaret deles med kampen. Arrangøren kårer vinneren til slutt.');
    expect(sideStatus(gameCtp, { me: false, name: 'Tore' }, false)).toBe(
      'Lagret av Tore. Alle i flighten kan endre.',
    );
    expect(sideStatus(gameLd, { me: true }, false)).toBe('Lagret av deg. Alle i flighten kan endre.');
    expect(sideStatus(cupCtp, { me: false, name: 'Kari' }, false)).toBe('Lagret av Kari. Alle i kampen kan endre.');
    expect(sideStatus(gameCtp, { me: false, name: 'Tore' }, true)).toBe('Lagret av Tore.');
  });

  it('GIR-statusen har maks per lag, eller én ball i foursomes', () => {
    expect(girStatus(2, false, null, false)).toBe('Svaret deles med kampen. Hvert lag får poeng for høyst 2.');
    expect(girStatus(2, false, { me: false, name: 'Tore' }, false)).toBe(
      'Lagret av Tore. Hvert lag får poeng for høyst 2.',
    );
    expect(girStatus(2, false, { me: true }, false)).toBe('Lagret av deg. Hvert lag får poeng for høyst 2.');
    expect(girStatus(2, true, { me: false, name: 'Kari' }, false)).toBe(
      'Lagret av Kari. Laget spiller én ball, så det teller én gang.',
    );
    expect(girStatus(2, false, { me: false, name: 'Tore' }, true)).toBe('Lagret av Tore.');
  });
});

describe('avstanden', () => {
  it('skrives med komma og én desimal', () => {
    expect(formatDistance(2.5)).toBe('2,5');
    expect(formatDistance(3)).toBe('3,0');
    expect(formatDistance(99.9)).toBe('99,9');
  });

  it('− og + går i halve meter og stopper ved grensene', () => {
    expect(stepDistance(null, 1)).toBe(0.5);
    expect(stepDistance(null, -1)).toBeNull();
    expect(stepDistance(2.5, 1)).toBe(3);
    expect(stepDistance(2.5, -1)).toBe(2);
    expect(stepDistance(0.5, -1)).toBeNull();
    expect(stepDistance(0.6, -1)).toBe(0.1);
    expect(stepDistance(99.5, 1)).toBeNull();
    expect(stepDistance(99.4, 1)).toBe(99.9);
    expect(stepDistance(2.4, 1)).toBe(2.9);
  });
});

describe('describeSideClaimFailure', () => {
  it('nettfeil er tegningens lagringsfeil', () => {
    expect(describeSideClaimFailure('db_error', gameCtp)).toBe('Fikk ikke lagret. Sjekk nettet og prøv igjen.');
  });

  it('sier flighten i spill og kampen i cup', () => {
    expect(describeSideClaimFailure('not_player', gameCtp)).toBe(
      'Du er ikke med i flighten lenger, så svaret ble ikke lagret.',
    );
    expect(describeSideClaimFailure('wrong_flight', cupGir)).toBe(
      'Spilleren er ikke med i kampen din lenger, så svaret ble ikke lagret.',
    );
  });

  it.each(['not_authenticated', 'not_active', 'no_slot', 'bad_distance'] as const)('har tekst for %s', (code) => {
    expect(describeSideClaimFailure(code, gameCtp)).toMatch(/\.$/);
  });
});

describe('#2283: avstandssteget har ett hjem', () => {
  it('appens stepDistance er den nettets felt bruker, i lib/games', () => {
    expect(stepDistance).toBe(sharedSideContest.stepDistance);
  });
});
