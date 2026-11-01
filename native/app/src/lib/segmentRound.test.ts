// #2752: den delte cup-dagen, Type A. Reglene er nettets; testene låser at appen
// spør dem med riktig halvdel.
import type { SegmentSibling } from '../../../../lib/games/segmentSiblingRules';
import {
  boundaryLink,
  bridgeHole,
  gameHoleNumbers,
  gameHoles,
  gameLastHole,
  isDerivedGame,
  roundHole,
  roundHoleNumbers,
  scoresGameId,
} from './segmentRound';

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  parMens: 4,
  parLadies: 4,
  parJuniors: 4,
  strokeIndex: i + 1,
}));

const back9Sibling = (mySubmittedAt: string | null = null): SegmentSibling => ({
  gameId: 'back9-host',
  gameMode: 'best_ball',
  holeSegment: 'back9',
  mySubmittedAt,
  myTeamNumber: 1,
});

const front9Sibling: SegmentSibling = {
  gameId: 'front9-host',
  gameMode: 'greensome_matchplay',
  holeSegment: 'front9',
  mySubmittedAt: null,
  myTeamNumber: 1,
};

const game = (holeSegment: string, id = 'this-game') => ({
  id,
  holeSegment,
  sourceGameId: null,
});

describe('hullene spillet eier', () => {
  it.each([
    ['full', 18, 1, 18],
    ['front9', 9, 1, 9],
    ['back9', 9, 10, 18],
  ])('%s har %i hull fra %i til %i', (segment, count, first, last) => {
    const numbers = gameHoleNumbers({ holeSegment: segment });
    expect(numbers).toHaveLength(count);
    expect(numbers[0]).toBe(first);
    expect(gameLastHole({ holeSegment: segment })).toBe(last);
  });

  it('klipper banens hull til spillet, og lar et vanlig spill stå urørt', () => {
    expect(gameHoles({ game: game('back9') as never, holes: HOLES }).map((h) => h.holeNumber)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    expect(gameHoles({ game: game('full') as never, holes: HOLES })).toEqual(HOLES);
  });
});

describe('avledede kamper', () => {
  it('leser slagene fra spillet de er avledet av, og vanlige spill fra seg selv', () => {
    expect(scoresGameId({ id: 'derived', sourceGameId: 'host' })).toBe('host');
    expect(scoresGameId({ id: 'plain', sourceGameId: null })).toBe('plain');
    expect(isDerivedGame({ sourceGameId: 'host' })).toBe(true);
    expect(isDerivedGame({ sourceGameId: null })).toBe(false);
  });
});

describe('hullene i runden', () => {
  it('uten søsken er runden spillets egne hull', () => {
    expect(roundHoleNumbers({ game: game('front9') as never })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('med søsken er runden alle 18, uansett hvilken halvdel du står i', () => {
    const all = Array.from({ length: 18 }, (_, i) => i + 1);
    expect(roundHoleNumbers({ game: game('front9') as never, segmentSibling: back9Sibling() })).toEqual(all);
    expect(roundHoleNumbers({ game: game('back9') as never, segmentSibling: front9Sibling })).toEqual(all);
  });

  it('et hull i egen halvdel føres her, et hull i den andre føres i søskenet', () => {
    const bundle = { game: game('front9') as never, segmentSibling: back9Sibling() };
    expect(roundHole(bundle, 9)).toEqual({ gameId: 'this-game', holeNumber: 9 });
    expect(roundHole(bundle, 10)).toEqual({ gameId: 'back9-host', holeNumber: 10 });
  });

  it('et hull utenfor runden finnes ikke', () => {
    const bundle = { game: game('front9') as never };
    expect(roundHole(bundle, 10)).toBeNull();
    expect(roundHole(bundle, 0)).toBeNull();
    expect(roundHole({ game: game('full') as never }, 19)).toBeNull();
  });
});

describe('broen', () => {
  it('første halvdel med andre halvdel ulevert: broen til hull 10', () => {
    expect(bridgeHole({ game: game('front9') as never, segmentSibling: back9Sibling() })).toEqual({
      gameId: 'back9-host',
      holeNumber: 10,
    });
  });

  it.each([
    ['andre halvdel er levert', { game: game('front9') as never, segmentSibling: back9Sibling('2026-11-01T10:00:00Z') }],
    ['ingen søsken', { game: game('front9') as never, segmentSibling: null }],
    ['andre halvdel, der runden leveres', { game: game('back9') as never, segmentSibling: front9Sibling }],
    ['et vanlig spill', { game: game('full') as never }],
  ])('ingen bro når %s', (_label, bundle) => {
    expect(bridgeHole(bundle)).toBeNull();
  });
});

describe('lenka mellom halvdelene', () => {
  it('hull 10 har en vei tilbake til hull 9', () => {
    expect(boundaryLink({ game: game('back9') as never, segmentSibling: front9Sibling }, 10)).toEqual({
      gameId: 'front9-host',
      holeNumber: 9,
    });
  });

  it('hull 9 viser ingen lenke mens broen er hovedknappen', () => {
    expect(boundaryLink({ game: game('front9') as never, segmentSibling: back9Sibling() }, 9)).toBeNull();
  });

  it('hull 9 får lenka når andre halvdel er levert og «Lever» er tilbake', () => {
    expect(
      boundaryLink({ game: game('front9') as never, segmentSibling: back9Sibling('2026-11-01T10:00:00Z') }, 9),
    ).toEqual({ gameId: 'back9-host', holeNumber: 10 });
  });

  it.each([
    ['hull midt i en halvdel', 'back9', 12],
    ['første hull i første halvdel', 'front9', 1],
  ])('%s har ingen lenke', (_label, segment, hole) => {
    expect(boundaryLink({ game: game(segment) as never, segmentSibling: front9Sibling }, hole)).toBeNull();
  });
});
