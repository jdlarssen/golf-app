// Native N3 (#1825), utvidet i N4 (#1828): format-gaten på spill-hjem.
//
// To rader er verdt hele fila:
//  - `hole_segment` er NOT NULL med default `'full'` (verifisert mot staging
//    2026-08-30), så en gate som spør «er feltet satt?» ville stengt HVERT
//    eneste vanlige spill ute. Testen låser at den spør om verdien.
//  - Familie-overgangene i N4 går begge veier. Scramble og alternate shot ble
//    åpnet, wolf/BBB ble stengt. Uten en rad per familie kan en senere endring
//    dra en av dem tilbake uten at noe sier fra.
import { gateMessage, gateReason, isScoringSupported } from './formatGate';

function game(overrides: Partial<Parameters<typeof isScoringSupported>[0]> = {}) {
  return {
    gameMode: 'solo_strokeplay',
    holeSegment: 'full',
    sourceGameId: null,
    ...overrides,
  };
}

describe('isScoringSupported', () => {
  it.each<[string, Parameters<typeof isScoringSupported>[0], boolean]>([
    ['vanlig soloslagspill', game(), true],
    ['stableford', game({ gameMode: 'stableford' }), true],
    ['singles matchplay', game({ gameMode: 'singles_matchplay' }), true],
    ['fourball matchplay', game({ gameMode: 'fourball_matchplay' }), true],
    ['best ball (egen ball, egen rad)', game({ gameMode: 'best_ball' }), true],
    // N4 åpnet scramble-familien — alle tre kollapser til ett lagkort, og
    // motoren gir dem lag-rader med teamHandicap.
    ['texas scramble — ett lagkort', game({ gameMode: 'texas_scramble' }), true],
    ['ambrose', game({ gameMode: 'ambrose' }), true],
    ['florida scramble', game({ gameMode: 'florida_scramble' }), true],
    // ... og alternate-shot-matchplay, som deler samme kaptein-rad-mekanikk.
    ['foursomes — alternate shot', game({ gameMode: 'foursomes_matchplay' }), true],
    ['greensome', game({ gameMode: 'greensome_matchplay' }), true],
    ['chapman', game({ gameMode: 'chapman_matchplay' }), true],
    ['gruesome', game({ gameMode: 'gruesome_matchplay' }), true],
    ['shamble (egen ball etter delt drive)', game({ gameMode: 'shamble' }), true],
    ['skins', game({ gameMode: 'skins' }), true],
    ['nassau', game({ gameMode: 'nassau' }), true],
    ['nines', game({ gameMode: 'nines' }), true],
    ['round robin', game({ gameMode: 'round_robin' }), true],
    ['acey deucey', game({ gameMode: 'acey_deucey' }), true],
    // N4 stengte disse to: regnestykket bor i egne per-hull-tabeller appen
    // hverken leser eller skriver, så ren slag-tasting gir tomme resultater.
    ['wolf — mangler per-hull-valg', game({ gameMode: 'wolf' }), false],
    ['bingo bango bongo — mangler per-hull-valg', game({ gameMode: 'bingo_bango_bongo' }), false],
    // Uendret fra N3.
    ['patsome — segment-hybrid', game({ gameMode: 'patsome' }), false],
    ['front9-halvdel av en delt cup-dag', game({ holeSegment: 'front9' }), false],
    ['back9-halvdel', game({ holeSegment: 'back9' }), false],
    ['avledet cup-spill', game({ sourceGameId: 'host-game' }), false],
  ])('%s', (_label: string, input: Parameters<typeof isScoringSupported>[0], expected: boolean) => {
    expect(isScoringSupported(input)).toBe(expected);
  });
});

describe('gateReason', () => {
  it('skiller formatet fra runden — teksten spilleren får er ikke den samme', () => {
    expect(gateReason(game({ gameMode: 'wolf' }))).toBe('mode');
    expect(gateReason(game({ holeSegment: 'front9' }))).toBe('segment');
    expect(gateReason(game({ sourceGameId: 'host' }))).toBe('derived');
    expect(gateReason(game())).toBeNull();

    expect(gateMessage('mode')).toBe('Dette formatet føres på nettsiden ennå.');
    expect(gateMessage('segment')).toBe('Denne runden føres på nettsiden ennå.');
    expect(gateMessage('derived')).toBe('Denne runden føres på nettsiden ennå.');
  });

  it('lar formatet stenge før runden — et wolf-front9 er stengt som format', () => {
    expect(gateReason(game({ gameMode: 'wolf', holeSegment: 'front9' }))).toBe('mode');
  });
});
