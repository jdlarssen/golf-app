// Native N3 (#1825): format-gaten på spill-hjem.
//
// Én rad her er verdt hele fila: `hole_segment` er NOT NULL med default
// `'full'` (verifisert mot staging 2026-08-30), så en gate som spør «er feltet
// satt?» ville stengt HVERT eneste vanlige spill ute. Testen låser at den spør
// om verdien.
import { isScoringSupported } from './formatGate';

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
    ['best ball (egen ball, egen rad)', game({ gameMode: 'best_ball' }), true],
    ['texas scramble — ett lagkort', game({ gameMode: 'texas_scramble' }), false],
    ['foursomes — alternate shot', game({ gameMode: 'foursomes_matchplay' }), false],
    ['patsome — lagball fra hull 7', game({ gameMode: 'patsome' }), false],
    ['front9-halvdel av en delt cup-dag', game({ holeSegment: 'front9' }), false],
    ['back9-halvdel', game({ holeSegment: 'back9' }), false],
    ['avledet cup-spill', game({ sourceGameId: 'host-game' }), false],
  ])('%s', (_label: string, input: Parameters<typeof isScoringSupported>[0], expected: boolean) => {
    expect(isScoringSupported(input)).toBe(expected);
  });
});
